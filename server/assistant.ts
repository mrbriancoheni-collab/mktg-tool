// AI assistant that can answer questions AND propose canvas edits.
// Streams newline-delimited JSON: {type:"text",delta} chunks, then optionally
// {type:"changes", ...} with ops the client previews and applies (undoable).

import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import { changesToOps, interpretDemo, type Change } from "../shared/aiedit";
import { FLOW_TYPES } from "../shared/catalog";
import type { Graph } from "../shared/model";
import { simulate } from "../shared/simulate";
import { AIError, client, describeGraph, FALLBACK, MODEL, SYSTEM, type ChatTurn, type OnUsage } from "./ai";

const nullable = (schema: object) => ({ anyOf: [schema, { type: "null" }] });
const STR = nullable({ type: "string" });
const NUM = nullable({ type: "number" });

const CHANGE_PROPS = {
  action: { type: "string", enum: ["add", "update", "remove", "connect", "disconnect", "rename_board"] },
  ref: { ...STR, description: "add: a temporary id for the new step (e.g. new1) so later changes can refer to it" },
  id: { ...STR, description: "update/remove: the existing node id from the canvas" },
  type: { ...nullable({ type: "string", enum: FLOW_TYPES }), description: "add: the catalog type of the new step" },
  label: { ...STR, description: "Specific step name" },
  notes: STR,
  budget: { ...NUM, description: "Monthly USD budget (traffic steps)" },
  cpc: { ...NUM, description: "Cost per click in USD (traffic steps)" },
  visitors: { ...NUM, description: "Monthly visitors (unpaid traffic)" },
  conversionRate: { ...NUM, description: "% who continue, 0-100" },
  price: { ...NUM, description: "Revenue per conversion in USD" },
  from: { ...STR, description: "add: id/ref of the step this follows. connect/disconnect: source id/ref" },
  to: { ...STR, description: "connect/disconnect: target id/ref" },
  weight: { ...NUM, description: "connect: relative traffic share" },
  name: { ...STR, description: "rename_board: new board name" },
};

const TOOL: Anthropic.Beta.BetaTool = {
  name: "propose_changes",
  description:
    "Propose edits to the campaign canvas. Use this whenever the user asks to add, remove, change, rebalance, optimize or restructure anything on the board. The user reviews and applies the changes. Include every field in each change, using null for fields that don't apply.",
  strict: true,
  eager_input_streaming: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["summary", "changes"],
    properties: {
      summary: { type: "string", description: "One sentence describing the overall change and its expected impact" },
      changes: {
        type: "array",
        items: { type: "object", additionalProperties: false, required: Object.keys(CHANGE_PROPS), properties: CHANGE_PROPS },
      },
    },
  },
};

const ChangeSetSchema = z.object({
  summary: z.string(),
  changes: z
    .array(
      z.object({
        action: z.enum(["add", "update", "remove", "connect", "disconnect", "rename_board"]),
        ref: z.string().nullable(),
        id: z.string().nullable(),
        type: z.string().nullable(),
        label: z.string().nullable(),
        notes: z.string().nullable(),
        budget: z.number().nullable(),
        cpc: z.number().nullable(),
        visitors: z.number().nullable(),
        conversionRate: z.number().nullable(),
        price: z.number().nullable(),
        from: z.string().nullable(),
        to: z.string().nullable(),
        weight: z.number().nullable(),
        name: z.string().nullable(),
      }),
    )
    .max(60),
});

const INSTRUCTIONS = `You can both answer questions and change the canvas.
- If the user asks a question, answer it concisely using the canvas data.
- If the user asks for a change (add, remove, cut, increase, rebalance, optimize, restructure, "make it…"), first briefly explain what you'll change and why (2-4 sentences, with the expected effect on spend/revenue/ROAS where you can estimate it), then call propose_changes. Use node ids exactly as shown in [brackets] on the canvas.
- Keep budgets realistic and preserve the user's total budget unless they ask to change it.
- Never claim changes were applied — the user applies them.`;

export type AssistantEvent =
  | { type: "text"; delta: string }
  | { type: "changes"; summary: string; ops: unknown[]; described: string[]; warnings: string[] }
  | { type: "error"; message: string };

export async function* assistant(graph: Graph, history: ChatTurn[], onUsage?: OnUsage): AsyncGenerator<AssistantEvent> {
  const last = history[history.length - 1]?.content ?? "";
  if (!client) {
    yield* demoAssistant(graph, last);
    return;
  }
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.slice(0, -1).map((t) => ({ role: t.role, content: t.content })),
    { role: "user", content: `<canvas snapshot="current">\n${describeGraph(graph)}\n</canvas>\n\n${last}` },
  ];
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    ...FALLBACK,
    output_config: { effort: "medium" },
    system: [{ type: "text", text: `${SYSTEM}\n\n${INSTRUCTIONS}`, cache_control: { type: "ephemeral" } }],
    tools: [TOOL],
    tool_choice: { type: "auto" },
    messages,
  });
  for await (const ev of stream) {
    if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") yield { type: "text", delta: ev.delta.text };
  }
  const final = await stream.finalMessage();
  onUsage?.(final.usage, final.model);
  if (final.stop_reason === "refusal") throw new AIError("The model declined this request. Try rephrasing.");
  if (final.stop_reason === "max_tokens") throw new AIError("The response was too long — try a narrower request.");
  const call = final.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === "propose_changes");
  if (!call) return;
  const parsed = ChangeSetSchema.safeParse(call.input);
  if (!parsed.success) {
    yield { type: "error", message: "The AI's proposed changes were malformed — please try again." };
    return;
  }
  const { ops, warnings, described } = changesToOps(graph, parsed.data.changes as Change[]);
  if (ops.length) yield { type: "changes", summary: parsed.data.summary, ops, described, warnings };
}

async function* demoAssistant(graph: Graph, text: string): AsyncGenerator<AssistantEvent> {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const proposal = interpretDemo(graph, text);
  const t = simulate(graph).totals;
  const reply = proposal
    ? `Here's what I'd change: ${proposal.summary} Review the preview below and click **Apply** — you can undo it anytime.\n\n_Demo mode understands simple requests (add retargeting / upsell / email nurture, cut or increase budget by X%, remove a step). Add an API key for full AI editing._`
    : `**Demo mode** — I can see ${graph.nodes.length} steps forecasting $${Math.round(t.spend).toLocaleString()} spend → $${Math.round(t.revenue).toLocaleString()} revenue (${t.roas.toFixed(2)}x ROAS).\n\nTry: _"add retargeting"_, _"cut budget by 15%"_, _"add an upsell"_ or _"remove TikTok"_. Set \`ANTHROPIC_API_KEY\` for full answers and any kind of edit.`;
  for (const chunk of reply.match(/[\s\S]{1,18}/g) ?? []) {
    await sleep(8);
    yield { type: "text", delta: chunk };
  }
  if (proposal) {
    const { ops, warnings, described } = changesToOps(graph, proposal.changes);
    if (ops.length) yield { type: "changes", summary: proposal.summary, ops, described, warnings };
  }
}
