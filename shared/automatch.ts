// Suggests which live platform campaigns belong to which canvas traffic steps,
// using campaign names, step labels, UTM campaign names and channel keywords.

import type { GraphNode } from "./model";

export interface Campaign {
  id: string;
  name: string;
}

export interface MatchSuggestion {
  nodeId: string;
  connector: string;
  campaigns: (Campaign & { score: number })[];
}

const STOP = new Set(["the", "and", "a", "of", "for", "to", "campaign", "campaigns", "ads", "ad", "copy", "new", "v1", "v2", "test", "-", "–"]);
const tokens = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !STOP.has(t) && !/^\d{4}$/.test(t)));

/** Channel hints in campaign names → canvas step type. */
const HINTS: [RegExp, string][] = [
  [/retarget|remarket|rmkt|\brt\b|warm|abandon/, "retargeting"],
  [/pmax|performance max/, "google_pmax"],
  [/shopping|\bpla\b/, "google_shopping"],
  [/display|\bgdn\b|banner/, "google_display"],
  [/youtube|\byt\b|video|in-stream/, "youtube_ads"],
  [/search|brand|non-?brand|\bkw\b|keyword/, "google_search"],
  [/instagram|\big\b|reels|stories/, "instagram_ads"],
];

function score(node: GraphNode, campaign: Campaign) {
  const name = campaign.name.toLowerCase();
  const nodeWords = new Set([...tokens(node.data.label), ...tokens(node.data.utm?.campaign ?? ""), ...tokens(node.data.notes ?? "")]);
  const camp = tokens(campaign.name);
  let overlap = 0;
  for (const t of camp) if (nodeWords.has(t)) overlap++;
  let s = camp.size ? overlap / camp.size : 0;
  for (const [re, type] of HINTS) {
    if (!re.test(name)) continue;
    s += node.data.type === type ? 0.6 : -0.15;
    break;
  }
  if (node.data.utm?.campaign && name.includes(node.data.utm.campaign.toLowerCase())) s += 0.5;
  return Math.round(s * 100) / 100;
}

/**
 * Assigns each campaign to its best-scoring eligible node. With a single
 * eligible node, every campaign is suggested for it.
 */
export function matchCampaigns(nodes: GraphNode[], campaigns: Campaign[], connector: string, threshold = 0.25): MatchSuggestion[] {
  if (!nodes.length || !campaigns.length) return [];
  const out = new Map<string, MatchSuggestion>();
  for (const c of campaigns) {
    const ranked = nodes.map((n) => ({ n, s: score(n, c) })).sort((a, b) => b.s - a.s);
    const best = ranked[0];
    const pick = best.s >= threshold ? best : nodes.length === 1 ? { n: nodes[0], s: Math.max(best.s, 0.1) } : null;
    if (!pick) continue;
    const m = out.get(pick.n.id) ?? { nodeId: pick.n.id, connector, campaigns: [] };
    m.campaigns.push({ ...c, score: pick.s });
    out.set(pick.n.id, m);
  }
  return [...out.values()];
}
