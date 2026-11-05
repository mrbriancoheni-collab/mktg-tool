// Subscription plans and their limits. When billing is disabled (internal
// deployments), every workspace gets the "unlimited" plan.

export type PlanId = "free" | "pro" | "team" | "unlimited";

export interface Plan {
  id: PlanId;
  name: string;
  priceMonthly: number;
  boards: number;
  aiPerMonth: number;
  members: number;
  scheduledReports: boolean;
  liveConnectors: boolean;
  blurb: string;
  features: string[];
}

const INF = Number.POSITIVE_INFINITY;

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    boards: 3,
    aiPerMonth: 50,
    members: 2,
    scheduledReports: false,
    liveConnectors: false,
    blurb: "Plan and forecast your first campaigns.",
    features: ["3 boards", "50 AI actions / month", "2 members", "All 150+ canvas elements", "CSV import & ad-pack export", "Share links & comments"],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMonthly: 49,
    boards: INF,
    aiPerMonth: 1000,
    members: 5,
    scheduledReports: true,
    liveConnectors: true,
    blurb: "For marketers running live campaigns.",
    features: ["Unlimited boards", "1,000 AI actions / month", "5 members", "Live Google Ads, GA4 & Meta data", "Scheduled reports & alerts", "Publish ad drafts"],
  },
  team: {
    id: "team",
    name: "Team",
    priceMonthly: 149,
    boards: INF,
    aiPerMonth: 5000,
    members: 25,
    scheduledReports: true,
    liveConnectors: true,
    blurb: "For agencies and growth teams.",
    features: ["Everything in Pro", "5,000 AI actions / month", "25 members", "Roles & audit log", "Priority support"],
  },
  unlimited: {
    id: "unlimited",
    name: "Unlimited",
    priceMonthly: 0,
    boards: INF,
    aiPerMonth: INF,
    members: INF,
    scheduledReports: true,
    liveConnectors: true,
    blurb: "Internal deployment — no limits.",
    features: [],
  },
};

export const PUBLIC_PLANS: PlanId[] = ["free", "pro", "team"];
export const ROLES = ["viewer", "member", "admin", "owner"] as const;
export type Role = (typeof ROLES)[number];
export const roleAtLeast = (role: Role, min: Role) => ROLES.indexOf(role) >= ROLES.indexOf(min);
