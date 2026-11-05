# Legal & Compliance Launch Checklist

The `legal/` folder holds **templates**, which the app shows at `/legal/*`. They are a strong starting point but are **not legal advice**. Budget for a review by a lawyer who handles SaaS and privacy work. Many offer fixed-fee packages for a ToS, Privacy Policy and DPA. Items marked ⚠️ can block a launch or platform approval.

## 1. Business basics
- [ ] Form a legal entity (for example a US LLC or C-corp) so contracts and liability sit with the company, not with you personally.
- [ ] ⚠️ **Name clearance.** "AdCanvas" is a generic name that other companies may already use. Search the USPTO, EUIPO and UKIPO registers, app stores and domains before you invest in the brand. Consider filing a trademark in class 42 (SaaS) and class 35 (advertising services).
- [ ] Secure a domain and business email addresses (privacy@, legal@, abuse@, support@). The documents refer to these.
- [ ] Insurance: technology errors & omissions (E&O) and cyber liability. Enterprise customers often ask for proof.

## 2. Fill in and publish the documents
- [ ] Replace every `[PLACEHOLDER]` in `legal/*.md` (company name, address, contacts, governing law, retention periods, providers).
- [ ] Make sure the Privacy Policy matches what the app **actually** does: providers, data stored, retention. Update it whenever you add a tool.
- [ ] Add "I agree to the Terms and Privacy Policy" at sign-up and record when each user accepted, once accounts exist.
- [ ] Fill in the Subprocessors list and sign DPAs with each subprocessor:
  - [ ] Anthropic (commercial terms and DPA; confirm current data-use and retention terms)
  - [ ] Hosting provider
  - [ ] Database provider
  - [ ] Email provider
  - [ ] Error monitoring
  - [ ] Payments
- [ ] Prepare a signable DPA with the Standard Contractual Clauses (SCCs) and UK Addendum attached for EU/UK customers.

## 3. Privacy law operations
- [ ] **GDPR / UK GDPR** (if you have EU/UK users):
  - [ ] Keep a record of processing activities.
  - [ ] Document your lawful bases.
  - [ ] Write a breach-response plan that meets the 72-hour regulator notification window.
  - [ ] Appoint an EU and/or UK representative (Art. 27) if you have no establishment there but offer services there.
  - [ ] Consider a DPIA for AI features.
- [ ] **US state privacy laws** (CCPA/CPRA and others): check the thresholds. A B2B SaaS often acts as a service provider, and the DPA's CCPA terms cover that.
- [ ] A process for data subject requests. In-app export and delete already exist (Board menu → Privacy & data). Add an identity-verification step once you have accounts.
- [ ] A cookie consent banner **only if** you add non-essential analytics or marketing tags. The app currently uses only strictly necessary storage.

## 4. ⚠️ Ad-platform API requirements
Each platform reviews your app. Prepare these items before applying:
- [ ] Public **Privacy Policy URL**, **Terms URL** and **Data Deletion URL**. These exist at `/legal/privacy`, `/legal/terms` and `/legal/data-deletion` once deployed.
- [ ] **Google:**
  - [ ] Apply for a Google Ads API developer token.
  - [ ] Complete OAuth consent-screen verification.
  - [ ] Keep the "Limited Use" disclosure, which is already in the Privacy Policy, Section 5.
  - [ ] Depending on the scopes you request, Google may require an independent security assessment.
- [ ] **Meta:**
  - [ ] Complete business verification.
  - [ ] Pass app review for the Marketing API permissions you need.
  - [ ] Provide the data deletion instructions URL or a deletion callback.
  - [ ] Complete Meta's annual Data Use Checkup.
- [ ] **LinkedIn:** Marketing Developer Platform application. Approval is selective, so describe the use case clearly.
- [ ] **TikTok:** Marketing API developer application.
- [ ] Follow each platform's data-retention and display rules. For example, some require deleting data when access is revoked. The Disconnect action already deletes stored credentials.

## 5. Advertising and marketing law
These apply to your customers' campaigns. The Terms and Acceptable Use Policy put that responsibility on customers, but they shape product decisions too.
- [ ] **FTC rules:** truth-in-advertising, Endorsement Guides (influencer disclosures), and the rule banning fake reviews.
- [ ] **Email:** CAN-SPAM (US), CASL (Canada), and GDPR/PECR (EU/UK opt-in for B2C email).
- [ ] ⚠️ **SMS / WhatsApp:** TCPA in the US requires prior express written consent for marketing texts, plus quiet hours and opt-out handling. Penalties are high.
- [ ] **Special ad categories:** housing, employment and credit ads have targeting restrictions under US law and platform rules.
- [ ] **Regulated verticals:** health, finance, alcohol, gambling and cannabis need extra review.

## 6. AI-specific
- [ ] Keep the AI-content notices in the app. They appear under asset generation, analysis and chat.
- [ ] Check your AI provider's usage policies, and pass the relevant restrictions to customers through the Acceptable Use Policy (already included).
- [ ] **EU AI Act:** a marketing-copy tool is generally not "high-risk", but transparency duties apply. Confirm with counsel as the guidance develops.
- [ ] Avoid claiming that forecasts or AI output guarantee results. The Terms disclaim this, so keep marketing copy consistent with them.

## 7. Security (needed to sell to larger businesses)
- [ ] Authentication with MFA, role-based access, and encryption of stored integration credentials. Credentials are currently a local JSON file with restricted file permissions; move them into encrypted DB columns or a secrets manager before launch.
- [ ] Audit logging, backups, and a written incident response plan.
- [ ] Prepare answers for security questionnaires. Plan SOC 2 Type I, then Type II, once mid-market or enterprise customers ask for it.
- [ ] Accessibility (WCAG 2.1 AA). It's often required in procurement, and the EU Accessibility Act may apply to some services.
