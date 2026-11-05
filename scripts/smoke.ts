// End-to-end smoke test against a running dev server (`npm run dev`, then `npm run smoke`).
import { CATALOG_BY_TYPE } from "../shared/catalog";
import { simulate } from "../shared/simulate";

const base = process.env.BASE ?? "http://localhost:5173";
const post = (p: string, b: unknown) =>
  fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });

for (const brief of [
  "B2B SaaS for HR teams, $20k/month to book demos",
  "Eco water bottle for millennials, $15k budget",
  "Online course sold via webinar, $8k",
]) {
  const res = await post("/api/ai/plan", { brief });
  const plan = await res.json();
  if (!res.ok) throw new Error(plan.error);
  const unknown = plan.nodes.filter((n: any) => !CATALOG_BY_TYPE[n.type]).map((n: any) => n.type);
  const graph = {
    name: plan.name,
    nodes: plan.nodes.map((n: any) => ({
      id: n.id,
      data: { ...Object.fromEntries(Object.entries(n).filter(([, v]) => v !== null)), kind: CATALOG_BY_TYPE[n.type]?.kind },
    })),
    edges: plan.edges.map((e: any, i: number) => ({ id: "e" + i, source: e.source, target: e.target, data: e.weight ? { weight: e.weight } : {} })),
  };
  const t = simulate(graph as any).totals;
  const an = await (await post("/api/ai/analyze", { graph })).json();
  const asset = await (await post("/api/ai/asset", { graph, nodeId: graph.nodes[0].id, kind: "ad_copy" })).text();
  console.log(
    `${plan.name}: ${plan.nodes.length} nodes${unknown.length ? " UNKNOWN " + unknown : ""} | spend $${Math.round(t.spend)} rev $${Math.round(t.revenue)} ROAS ${t.roas.toFixed(2)} leads ${Math.round(t.leads)} customers ${Math.round(t.customers)} | analysis ${an.healthScore}/100, ${an.findings.length} findings | asset ${asset.length} chars`,
  );
}
const chat = await (await post("/api/ai/chat", { graph: { name: "x", nodes: [], edges: [] }, history: [{ role: "user", content: "hi" }] })).text();
console.log("chat:", chat.slice(0, 70).replace(/\n/g, " "));
console.log("integrations with connectors:", (await (await fetch(base + "/api/integrations")).json()).length);
