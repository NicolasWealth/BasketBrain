---
doc: checklist
status: approved
---

# Build Checklist

Build mode: fast

## Slices

- [x] **1. Basket arithmetic produces correct totals and accepted savings**
  Becomes usable: The project has a tested basket domain that validates money, computes totals from item state, enforces the 30-item limit, and applies accepted recommendations correctly.
  Why now: This is the financial foundation for every catalogue, recommendation, API, and screen behavior.
  PRD ref: `prd.md > Features and Behavior > Item Entry`, `prd.md > Features and Behavior > Live Budget Summary`
  Spec ref: `spec.md > Financial Arithmetic (lib/basket.ts)`, `spec.md > Data Model`
  Build: Bootstrap the specified Next.js and Jest project only as needed for this slice; implement `src/lib/basket.ts` and `src/__tests__/basket.test.ts`.
  Verify (mechanical): Passed `node .\node_modules\jest\bin\jest.js src/__tests__/basket.test.ts --runInBand --detectOpenHandles` — 1 suite, 42 tests.
  Learner check: Review an example basket total and confirm that accepting a cheaper substitution reduces it by the specified saving.
  Commit: `Add basket arithmetic`

- [ ] **2. Entered items can be matched and package-confirmed against the catalogue**
  Becomes usable: Static catalogue data and deterministic matching identify eligible products in the same currency, including package confirmation for every item.
  Why now: Recommendations may only be generated from confirmed catalogue relationships and recorded prices.
  PRD ref: `prd.md > Features and Behavior > Catalogue and Matching`
  Spec ref: `spec.md > Catalogue and Matching (lib/catalogue.ts)`, `spec.md > Data Model`
  Build: Add `src/data/catalogue.json`, `src/lib/catalogue.ts`, and `src/__tests__/catalogue.test.ts` with the confirmed-package and currency rules.
  Verify (mechanical): Run `npm test -- catalogue.test.ts`.
  Learner check: Confirm that the matching flow distinguishes a name match from a confirmed package.
  Commit: `Add catalogue matching`

- [ ] **3. The app generates and evaluates budget-saving candidates deterministically**
  Becomes usable: Confirmed basket items produce valid candidate cards, and the budget search finds whether a solution exists among those candidates.
  Why now: This is the product's core budget-planning behavior and must be correct before AI enrichment or UI presentation.
  PRD ref: `prd.md > Features and Behavior > Recommendations`, `prd.md > Features and Behavior > Completion and Outcome States`
  Spec ref: `spec.md > Recommendation Engine (lib/recommendations.ts)`, `spec.md > Testing > __tests__/recommendations.test.ts`
  Build: Implement `src/lib/recommendations.ts` and `src/__tests__/recommendations.test.ts`, including candidate caps, deterministic IDs, fixed fallback text, revalidation, and bounded least-disruptive search.
  Verify (mechanical): Run `npm test -- recommendations.test.ts`.
  Learner check: Inspect a generated plan and confirm it uses the fewest changed items before other tie-breakers.
  Commit: `Add recommendation engine`

- [ ] **4. The recommendations API securely enriches every server-built candidate**
  Becomes usable: The server validates the request, builds candidates itself, obtains optional AI explanations, and returns safe fallbacks whenever enrichment is unavailable.
  Why now: The client needs a stable contract before it can render recommendation and failure states.
  PRD ref: `prd.md > Features and Behavior > Recommendations`, `prd.md > States and Boundaries`
  Spec ref: `spec.md > API Contract: /api/recommendations`, `spec.md > AI Provider Adapter (lib/ai/)`
  Build: Add the AI adapter, `src/app/api/recommendations/route.ts`, and `src/__tests__/api-route.test.ts`; keep the API key server-only and the model configurable.
  Verify (mechanical): Run `npm test -- api-route.test.ts`.
  Learner check: Verify that a simulated provider outage still leaves fixed-text recommendation cards available.
  Commit: `Add recommendations API`

- [ ] **5. Users can complete the basket-to-plan journey in the browser**
  Becomes usable: The landing, setup, basket, matching confirmation, recommendation, acceptance, review, and outcome states work as one session-backed flow.
  Why now: All domain behavior and contracts are established, so screens can compose them without changing their rules.
  PRD ref: `prd.md > The Core Journey`, `prd.md > Screens and Layout`
  Spec ref: `spec.md > Components`, `spec.md > The Core Journey Through the System`, `spec.md > File Structure`
  Build: Add the session provider, pages, and components in the specified file structure; connect the full flow and cover its end-to-end behavior.
  Verify (mechanical): Run `npm test` and `npm run build`.
  Learner check: Follow the demo flow, including package Confirm clicks, and report whether the budget and recommendation states are clear.
  Commit: `Add basket planning screens`

## Hands-on Checkpoints

- [ ] Core recommendation behavior explored after slice 3
- [ ] Final kick-the-tires exploration and feedback completed

## Final Review

- [ ] Final review complete — feedback resolved and learner confirms ready to ship

## Code Tour and App Map

- [ ] Learning activity complete — guided route, focused alternative, prior practice connected, or brief recap
- [ ] Optional edit and transfer reflection addressed — offered/declined/already covered/not applicable as appropriate
- [ ] `devpost/app-map.html` generated from finished code, checked, and shown, including a project-grounded practice to reuse

Activity and evidence: [record after implementation]
Route and stops: [record after implementation]
Edit outcome: [record after implementation]
Reflection: [record after implementation]
Activity mode: [record after implementation]

## Revisions
