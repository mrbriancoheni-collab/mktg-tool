// Suggested next steps for the "+" quick-add button, by the current step's type/kind.
import { CATALOG_BY_TYPE } from "./catalog";

const BY_TYPE: Record<string, string[]> = {
  landing_page: ["checkout", "optin_page", "booking", "cart", "email_sequence", "add_audience"],
  product_page: ["cart", "checkout", "abandoned_cart", "add_audience"],
  collection_page: ["product_page", "cart"],
  cart: ["checkout", "abandoned_cart"],
  checkout: ["upsell", "order_bump", "thank_you", "post_purchase", "purchase"],
  order_bump: ["upsell", "thank_you"],
  upsell: ["downsell", "thank_you", "post_purchase"],
  downsell: ["thank_you"],
  optin_page: ["email_sequence", "thank_you", "booking", "webinar", "sms"],
  lead_magnet: ["email_sequence", "lead_scoring", "booking", "thank_you"],
  quiz: ["email_sequence", "product_page", "booking", "condition"],
  webinar: ["checkout", "booking", "email_sequence", "sales_page"],
  sales_page: ["checkout", "order_bump"],
  blog_post: ["optin_page", "lead_magnet", "product_page"],
  pricing_page: ["trial_signup", "demo_request", "checkout"],
  demo_request: ["sales_call", "sdr_followup", "booking"],
  trial_signup: ["onboarding", "trial_activation", "email_sequence"],
  booking: ["sales_call", "sms", "email_sequence"],
  case_study: ["demo_request", "pricing_page"],
  comparison: ["demo_request", "pricing_page", "trial_signup"],
  email_sequence: ["booking", "checkout", "sales_page", "landing_page"],
  sms: ["checkout", "booking"],
  lead_form: ["email_sequence", "sdr_followup", "booking", "mql"],
  lead_scoring: ["mql", "email_sequence"],
  mql: ["sdr_followup", "booking"],
  sdr_followup: ["sales_call", "booking"],
  sales_call: ["proposal", "closed_won"],
  proposal: ["closed_won"],
  trial_activation: ["subscription", "email_sequence"],
  subscription: ["expansion", "winback", "referral_reward"],
  abandoned_cart: ["checkout"],
  browse_abandon: ["product_page", "checkout"],
  onboarding: ["trial_activation", "member_area"],
  ab_split: ["landing_page", "product_page"],
  condition: ["email_sequence", "sales_call", "checkout"],
};

const BY_KIND: Record<string, string[]> = {
  traffic: ["landing_page", "product_page", "optin_page", "lead_magnet", "demo_request", "webinar", "quiz"],
  page: ["checkout", "email_sequence", "thank_you", "booking"],
  action: ["checkout", "booking", "thank_you", "email_sequence"],
  integration: [],
  note: [],
};

export function suggestNext(type: string): string[] {
  const kind = CATALOG_BY_TYPE[type]?.kind ?? "page";
  return (BY_TYPE[type] ?? BY_KIND[kind]).filter((t) => CATALOG_BY_TYPE[t]).slice(0, 6);
}
