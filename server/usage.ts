// AI usage metering and plan enforcement.

import type { Request } from "express";
import { effectivePlan, HttpError } from "./auth";
import { db } from "./db";

export interface TokenUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/** Throws 402 when the workspace has used its monthly AI allowance. */
export async function assertAiQuota(req: Request) {
  const a = req.auth!;
  const plan = effectivePlan(a.workspace.plan);
  if (!Number.isFinite(plan.aiPerMonth)) return;
  const [r] = await db().query(`SELECT count(*)::int AS n FROM ai_usage WHERE workspace_id=$1 AND created_at >= date_trunc('month', now())`, [a.workspace.id]);
  if (Number(r.n) >= plan.aiPerMonth) throw new HttpError(402, `You've used all ${plan.aiPerMonth} AI actions on the ${plan.name} plan this month. Upgrade for more.`);
}

/** Returns a callback the AI layer calls with token usage once a request finishes. */
export function meter(req: Request, feature: string) {
  return (usage: TokenUsage | undefined, model: string) => {
    const a = req.auth!;
    const input = (usage?.input_tokens ?? 0) + (usage?.cache_read_input_tokens ?? 0) + (usage?.cache_creation_input_tokens ?? 0);
    db()
      .query(`INSERT INTO ai_usage (workspace_id, user_id, feature, model, input_tokens, output_tokens) VALUES ($1,$2,$3,$4,$5,$6)`, [
        a.workspace.id,
        a.user.id,
        feature,
        model,
        input,
        usage?.output_tokens ?? 0,
      ])
      .catch((e) => console.error("[usage]", e.message));
  };
}
