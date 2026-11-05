# Usability test plan

**Goal:** confirm that a new user can build a funnel, adapt it, create ads, bring in results and share them without help, and find where they get stuck. Run this before launch and after every major UX change.

## 1. Who to test with

| Group | Count | Recruit from |
|---|---|---|
| B2C performance marketers (e-commerce, apps, DTC) | 3–4 | Existing customers, LinkedIn, r/PPC, marketing Slack groups |
| B2B demand-gen / agency marketers | 3–4 | Your network, agency communities |
| Founder or generalist (no ad expertise) | 1–2 | Startup communities |

Five people per round find most problems; run another round after fixing them. Offer an incentive (for example a $75 gift card). Get recording consent.

## 2. Setup
- Use a staging deployment with a live `ANTHROPIC_API_KEY`. Demo mode is not representative.
- Give each participant a fresh account. Clear the onboarding state, so the tour and checklist appear.
- Run sessions moderated over video, 45 minutes each. Ask them to think aloud. Don't help unless they're stuck for 2 minutes.

## 3. Tasks (read aloud one at a time)

| # | Task prompt | Success = | Benchmark (scripted, see §6) |
|---|---|---|---|
| 1 | "You're launching *[their real product]* with a $10k/month budget. Get a full campaign plan on screen." | A board with traffic, pages and conversion steps | 2 clicks |
| 2 | "You think Meta will cost more than planned. Change it to $1.50 per click and tell me what happens to profit." | Edits CPC and reads the new profit | 3 clicks |
| 3 | "Get ad copy you could upload to Google Ads today." | Downloads an ad pack CSV or publishes drafts | 4 clicks |
| 4 | "Ask the tool to add a way to win back people who didn't buy." | Applies an AI proposal (retargeting or email) | 3 clicks |
| 5 | "Your boss asks how last month went. Show them." | Opens the Dashboard with data (sample data is OK) | 2 clicks |
| 6 | "Send the plan to a client so they can comment but not edit." | Creates a share link, or exports the PDF | 3 clicks |
| 7 (stretch) | "Find the cheapest way to get 20% more customers." | Uses What-if or the Budget optimizer | — |

## 4. What to measure
- **Task success:** completed without help, with help, or failed.
- **Time on task,** and the moment each participant first hesitates (note the timestamp).
- **Single Ease Question** after each task: "How easy was that?" on a 1–7 scale.
- **SUS** (System Usability Scale) at the end. Target: **≥ 75**.
- **Open questions:**
  - What did you expect to happen when you first saw the canvas?
  - What was confusing?
  - Would you use this instead of your current setup? Why or why not?

## 5. Analyze
1. List every issue with: the task, the severity (blocker, major or minor), how many participants hit it, and a quote.
2. Fix blockers before launch. Pair each fix with an event in the product analytics funnel so you can confirm it worked.
3. Compare with the live **activation funnel** at `/admin` (set `ADMIN_EMAILS`):
   signup → board_built → node_edited → asset_generated → data_connected → analysis_run → shared.
   The biggest drop between two steps is where to focus next.

## 6. Scripted baseline (automated, demo mode)

These numbers come from a Playwright script that performs each task as a new user. They measure **minimum clicks**, not human time. Use them as a regression check: if a change adds clicks to a core task, question it.

| Task | Clicks | Notes |
|---|---|---|
| Build a complete funnel (template) | 2 | AI Build with a brief is about 3 clicks plus typing |
| Change a channel's budget | 3 | Select step → Plan tab → edit |
| Get platform-ready ad copy | 4 | Creative tab → Create ad pack → Generate → Download |
| Ask AI to change the plan | 3 | AI tab → type → Apply |
| See performance dashboard | 2 | Dashboard → sample data (or Sync) |
| Share a view-only link | 3 | Board menu → Share → Create link |

**Known friction to watch in sessions** (from my own review, not yet confirmed with users):
- Clicking the already-open side tab closes the panel.
- Clicking a step while the AI chat is open keeps the chat (by design, so a conversation isn't interrupted). People may expect the step's settings to open.
- Several tools appear twice: as nodes in the canvas palette, and under Settings → Integrations. Check whether this confuses people.
