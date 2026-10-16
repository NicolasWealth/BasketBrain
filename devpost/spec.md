---
doc: spec
status: draft
---

# BasketBrain — Technical Specification

## How This Works, In Plain Language

BasketBrain is a Next.js web application. All of the interface runs in the browser. When the user needs AI-generated recommendation text, the browser sends a request to a **Route Handler** — a server-side function that lives in the same Next.js project. That function calls the AI provider (OpenAI) using an API key stored only on the server; the browser never sees the key. The function validates the AI's response, discards anything that doesn't meet the contract, and returns a safe, structured list of suggestions to the browser.

Every number the user sees — line totals, basket totals, savings, remaining budget, overspend — is calculated by application code in the browser from before-and-after basket states. Existing basket prices come from the user; proposed replacement prices come only from the recorded illustrative catalogue price. The AI can write explanatory text and nominate candidate changes, but it cannot produce or modify any displayed financial figure.

The product catalogue (about 25–30 grocery items) is a JSON file shipped with the application. It never changes at runtime. Catalogue matching is a deterministic function that normalises item names and compares them against catalogue entries and their known aliases. No database, no external lookup.

Session state lives in a client `SessionProvider` mounted by `app/layout.tsx`, so it survives navigation between setup and `/basket` during the open tab. A refresh or tab close resets it. A direct visit to `/basket` without a valid session redirects to setup. The PRD requires no cross-session persistence for the PoC.

The architecture is small by design: one Next.js project, one JSON catalogue file, one server-side route, application-code arithmetic, and one AI provider behind a replaceable adapter.

---

## The Core Journey Through the System

Implements `prd.md > The Core Journey`.

1. **User opens the app.** Next.js serves the landing page (`app/page.tsx`). The component renders the budget setup form (currency selector + budget input). No API call; no data fetched.

2. **User sets budget and clicks "Start my basket."** The client parses the selected currency and budget with the exact decimal rules in `lib/basket.ts`. On success, it navigates to the basket workspace with `currency` and `budgetMinor` held in React session state (not URL parameters). No server round-trip.

3. **User adds an item.** `ItemEntryForm` collects name, quantity, unit size, unit price, and priority. On submission, it parses and bounds every value, then calls `matchCatalogueItem(name, currency)` — a deterministic function in `lib/catalogue.ts`. The item is added regardless of match result, but a catalogue association is used for recommendations only after name and package confirmation.

4. **Line total and basket total update.** `calculateLineTotalMinor(quantity, unitPriceMinor)` and `calculateBasketTotalMinor(items)` — both pure functions in `lib/basket.ts` — run synchronously in the browser. The budget summary component re-renders.

5. **User requests recommendations.** The client creates the bounded, deterministic candidate set from confirmed same-package catalogue alternatives and sends the current basket revision to `POST /api/recommendations`. The Route Handler independently reconstructs and allowlists those candidates from its trusted catalogue, asks the AI only to rank and explain them, and returns a response tagged with the request revision. The browser discards a late response for an older revision. The browser never receives provider-supplied financial figures.

6. **Recommendation display.** `RecommendationsEngine` validates the returned allowlisted candidates, calculates each displayed financial figure, and attaches an item-level snapshot. It also runs the bounded budget search and displays its status in the recommendations panel: a reviewable plan, no solution among evaluated candidates, or search limit reached.

7. **User accepts a recommendation.** A single reducer transition runs `applyRecommendation()` against the target item's current snapshot and trusted catalogue data. On success it changes only that item, updates a substituted item's recorded price, increments the basket revision, adds the realized saving to accumulated savings, retains unrelated valid proposals, and marks only affected/invalid proposals `needs-review`. It is never applied automatically.

8. **User rejects a recommendation.** The recommendation's status is set to `rejected` in local state. The basket is unchanged.

9. **Session ends.** When the basket total ≤ budget, the success state is computed from derived totals and displays `accumulatedSavingsMinor`. When recommendations have been evaluated, the panel shows a bounded-search status rather than claiming global impossibility: a plan found, no solution among evaluated candidates, or search limit reached.

---

## Stack

| Concern | Choice | Rationale |
|---|---|---|
| Framework | Next.js 15 (App Router) | Frontend + server-side Route Handlers in one project; no separate backend needed; straightforward Vercel deploy if desired. |
| Language | TypeScript (strict) | Shared types across client and server keep the arithmetic boundary explicit and catch misuse at compile time. |
| Styling | CSS Modules + CSS custom properties | No build-step dependency, full control, consistent with the PRD's bespoke visual direction. Tailwind is available as an option but not the default. |
| AI provider (initial) | OpenAI `gpt-6-luna`, configured by `OPENAI_MODEL` | Current cost-sensitive text model with Structured Outputs support. The server verifies the configured model is available to the API account before use; the provider remains replaceable behind `lib/ai/openai.ts`. |
| Testing | Jest + React Testing Library + `ts-jest` | Jest’s TypeScript transform uses `ts-jest`; suitable for arithmetic, catalogue, API-route, and reducer tests. |
| Package manager | npm |  |

**Documentation links (verified 2026-10-15; verify account access at build start):**
- Next.js: https://nextjs.org/docs
- OpenAI model catalogue: https://developers.openai.com/api/docs/models
- OpenAI `gpt-6-luna`: https://developers.openai.com/api/docs/models/gpt-6-luna
- OpenAI Structured Outputs: https://developers.openai.com/api/docs/guides/structured-outputs
- OpenAI pricing: https://platform.openai.com/pricing
- OpenAI Node SDK: https://platform.openai.com/docs/libraries
- Jest: https://jestjs.io/docs/getting-started
- ts-jest: https://kulshekhar.github.io/ts-jest/
- React Testing Library: https://testing-library.com/docs/react-testing-library/intro

> **OpenAI verification boundary:** Official documentation lists `gpt-6-luna` at $0.10 input / $0.50 output per 1M tokens and records Structured Outputs as supported. This workspace cannot verify a private API account. At build start, the server must verify that `OPENAI_MODEL` (default `gpt-6-luna`) is returned by that account's model-list endpoint and complete a minimal Structured Outputs request. If either check fails, recommendations are unavailable until an account-available supported model is configured; no browser fallback or credential exposure is permitted.

---

## Where It Runs and How Someone Tries It

**Runtime:** Browser (Next.js dev server running locally on Node.js).

**Environment requirements:**
- Node.js ≥ 20
- An OpenAI API key in `.env.local` as `OPENAI_API_KEY`
- `OPENAI_MODEL=gpt-6-luna` (server-side configuration; change only to a model verified for the configured account)

**Start command:**
```bash
npm install
npm run dev
```
Open `http://localhost:3000` in a browser.

**Demo recording:** Run locally, record the screen. Walk through the core journey: set budget → add items with all three priority levels → confirm the matched catalogue packages → trigger "Find ways to save" → accept one recommendation, reject one → show the final verified total.

**Submission requirements:** Short demo video + public GitHub repository. Deployment is optional.

**Optional deployment:** Vercel (`vercel deploy`). Add `OPENAI_API_KEY` as a Vercel environment variable. No other configuration needed.

**`.env.example` (committed; contains placeholder names only, no real secrets):**
```
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-6-luna
```

**`.gitignore` must include:** `.env`, `.env.*`, and explicit negation `!.env.example`. `NEXT_PUBLIC_*` is never used for provider credentials or model-access data.

**Test configuration:** `jest.config.ts` uses `ts-jest` with TypeScript. Development dependencies include `jest`, `ts-jest`, `@types/jest`, `jest-environment-jsdom`, and React Testing Library dependencies; `npm test` must run the TypeScript suites without a separate transpiler.

---

## Look and Feel

Carries forward `prd.md > Look and Feel` and `scope.md > Inspiration & Identity`.

- **Palette:** CSS custom properties. Warm neutral background (`--color-bg: hsl(40, 20%, 97%)`). Deep green primary (`--color-primary: hsl(152, 45%, 28%)`). Muted amber for warnings (`--color-warning: hsl(38, 90%, 48%)`). Calm green for success (`--color-success: hsl(152, 35%, 42%)`). Near-black for body text.
- **Typography:** `Inter` (Google Fonts). Body 16px / 1.6 line height. Generous whitespace. Financial figures use tabular-nums for alignment.
- **Visual detail:** Compact basket SVG icon in the header. No decorative gradients, no excessive glassmorphism, no dashboard charts.
- **Density:** Spacious and calm. Cards with subtle shadow. Restrained border usage.
- **Responsive:** Mobile layout at all widths; two-column (basket + summary sidebar) at ≥ 768px.
- **Accessibility:** Color is never the sole indicator of status, priority, or match state; always paired with text label or icon.

---

## Components

### `LandingPage` (`app/page.tsx`)
Entry point. Renders `BudgetSetup`. Handles inline budget validation. On valid submission, creates the basket workspace session in React state; currency and budget are not placed in URL parameters.
PRD ref: `prd.md > Budget Setup`, `prd.md > Screens and Layout > Screen 1`.

### `BudgetSetup` (`components/BudgetSetup.tsx`)
Currency selector is exactly GBP, USD, EUR, and NGN; budget uses the shared strict decimal parser. Primary CTA "Start my basket". Secondary CTA calls `loadSampleBasket(selectedCurrency)` so its prices and calculations use the selected currency. Once an item exists, changing currency requires a new empty session.
PRD ref: `prd.md > Budget Setup`, `prd.md > Sample Basket`.

### `BasketPage` (`app/basket/page.tsx`)
Root component for the basket workspace. Reads and updates session state through `SessionProvider`: budget, currency, items, request revision, recommendations, rejection IDs, savings baseline, and accumulated savings. Computes totals from derived lines on every render. The reducer is the sole path for manual edits, recommendation acceptance, rejection, and response receipt; it redirects to setup if no session exists.
PRD ref: `prd.md > Screens and Layout > Screen 2`.

### `BudgetSummary` (`components/BudgetSummary.tsx`)
Persistent panel showing budget, current total, and remaining/over amount. Receives computed values as props — does no arithmetic itself. Renders the overspend warning (icon + text + numeric amount) or within-budget indicator. Optional progress bar as secondary visual cue.
PRD ref: `prd.md > Live Budget Summary`, `prd.md > Overspend Indicator`.

### `ItemEntryForm` (`components/ItemEntryForm.tsx`)
Controlled form: item name, quantity, unit/package size (optional display label), unit price, priority selector (segmented: Essential / Flexible / Optional; default Flexible). Blocks adding a 31st item. On submit, passes the raw item to the parent which runs `matchCatalogueItem(name, currency)` and adds the result to basket state.
PRD ref: `prd.md > Item Entry`, `prd.md > Priority System`.

### `BasketItemRow` (`components/BasketItemRow.tsx`)
Renders a single basket item: name, quantity, unit size, unit price, line total, priority label, and match status badge. Provides inline edit and remove actions. For every deterministic name match, it displays the catalogue name and package (for example, “Semi-skimmed milk, 1000 ml”) and asks “Is your price for this package?” Only clicking “Confirm match” sets `catalogueId` and `confirmedPackageSignature`; `unitSize` is display-only. “Keep as entered” leaves the item unmatched for recommendations.
PRD ref: `prd.md > Item Entry`, `prd.md > Catalogue and Matching`.

### `RecommendationsPanel` (`components/RecommendationsPanel.tsx`)
Appears below the basket list when triggered. Sends a UUID request ID and current `basketRevision`; only one request may be active. It aborts/supersedes an earlier request and discards a response whose request ID or revision no longer matches. It always renders locally generated valid candidate cards with fixed text when the provider request fails, aborts, returns 400/413/429, or hits a network error; 429 has a separate rate-limit notice. It shows loading, AI-explanations-unavailable, rate-limited, request-invalid, network/aborted, no-solution-among-evaluated-candidates, search-limit-reached, and reviewable-plan states.
PRD ref: `prd.md > Recommendations > Generation`, `prd.md > States and Boundaries`.

### `RecommendationCard` (`components/RecommendationCard.tsx`)
Renders one recommendation: proposed change, current vs. proposed (with unit/size differences), individual saving (displayed from app-calculated value on the `Recommendation` object), reason (AI-generated text), trade-off disclosure, and "Accept change" / "Reject" actions. Displays needs-review or applied states. Neither action is the default.
PRD ref: `prd.md > Recommendations > Recommendation cards`, `prd.md > Recommendations > Accepting`, `prd.md > Recommendations > Rejecting`.

---

## Data Model

### `CatalogueProduct`
```typescript
interface CatalogueProduct {
  id: string;               // stable slug, e.g. "milk-semi-1l"
  name: string;
  category: string;
  packageUnit: 'g' | 'ml' | 'count';
  packageSize: number;      // positive integer in `packageUnit`
  packageSignature: string; // exact `${packageUnit}:${packageSize}`; no conversion
  pricesMinor: Record<SupportedCurrency, number>; // illustrative, recorded per currency
  aliases: string[];        // normalised name variants for matching
  alternatives: string[]; // IDs of catalogue products that are plausible substitutes
}
```
`SupportedCurrency` is exactly `'GBP' | 'USD' | 'EUR' | 'NGN'`. Every catalogue product has an independently recorded illustrative minor-unit price for each of these currencies; these records are not exchange-rate conversions. Catalogue validation requires unique IDs, globally collision-free normalised aliases/names, valid alternative IDs, no self-alternatives, symmetric package-compatible alternatives, positive safe-integer prices, and a complete price record for all supported currencies.

Stored in `src/data/catalogue.json`. Loaded at module init. Never mutated at runtime. Approximately 25–30 products across 5–6 categories. The sample basket uses the user’s selected currency and the matching recorded catalogue price fixture; it never falls back to another currency. A user cannot change currency once items exist: the workspace sends them back to budget setup and requires starting a new empty session, preventing mixed-currency arithmetic.

### `BasketItem`
```typescript
interface BasketItem {
  id: string;              // local UUID (crypto.randomUUID())
  name: string;            // user-entered or catalogue display name
  quantityHundredths: number; // positive integer 1..999999; displayed as /100
  unitSize?: string;          // optional label, 1..30 characters when supplied
  unitPriceMinor: number;  // user-entered price per declared unit/package, stored in session currency minor units
  currency: SupportedCurrency;
  priority: 'essential' | 'flexible' | 'optional';
  matchStatus: 'needs-confirmation' | 'confirmed' | 'unmatched';
  catalogueId?: string;    // set only by explicit confirmation
  confirmedPackageSignature?: string; // set only by explicit confirmation
  pendingMatchId?: string; // set while awaiting user confirmation
}
```
`lineTotalMinor` is derived by `calculateLineTotalMinor()` and is never stored. Lives in React state in `BasketPage`. A quantity is the number of the declared units/packages; it is not a conversion instruction. A removal is an action, not a stored zero quantity. Item IDs are UUIDs and unique within the request/session.

### `Recommendation`
```typescript
interface Recommendation {
  id: string;
  basketItemId: string;
  type: 'substitution' | 'quantity-reduction' | 'removal';
  // Current item snapshot
  currentName: string;
  currentQuantityHundredths: number;
  currentUnitPriceMinor: number;
  // Proposed change
  proposedName: string;
  proposedCatalogueId?: string;
  proposedQuantityHundredths: number;
  proposedUnitPriceMinor: number; // recorded catalogue price; never supplied by AI
  // AI-generated text (display only; not used in arithmetic)
  reason: string;
  tradeOffs: string;
  // Lifecycle
  status: 'pending' | 'accepted' | 'rejected' | 'needs-review';
  generatedForRevision: number;
  // Relevant state snapshot at generation time
  snapshot: {
    quantityHundredths: number;
    unitPriceMinor: number;
    currency: SupportedCurrency;
    priority: BasketItem['priority'];
    catalogueId?: string;
    unitSize?: string;
    confirmedPackageSignature?: string;
  };
}
```
Current/proposed line totals and `savingMinor` are derived display values from the recommendation’s before-and-after item states; they are not stored fields.

### Session state
No persistent store. `BasketPage` holds:
- `currency: SupportedCurrency`
- `budgetMinor: number`
- `items: BasketItem[]`
- `basketRevision: number` — incremented after every basket or budget edit and accepted recommendation
- `accumulatedSavingsMinor: number` — starts at 0; each accepted recommendation adds total-before-accept minus total-after-accept; manual edits never change it
- `activeRecommendationRequestId?: string` and `activeRecommendationRevision?: number` — prevent concurrent/out-of-order responses from replacing newer state
- `recommendations: Recommendation[]`
- `rejectedCandidateIds: string[]` — excluded from the displayed set and bounded search until the user requests a fresh recommendation set
- `recommendationsStatus: 'idle' | 'loading' | 'loaded' | 'error'`

---

## Catalogue and Matching (`lib/catalogue.ts`)

Implements `prd.md > Catalogue and Matching`.

**`matchCatalogueItem(input: string, currency: SupportedCurrency): MatchResult`**

`formatPackage(product: CatalogueProduct): string` returns `${product.name}, ${product.packageSize} ${product.packageUnit}` for the explicit confirmation prompt and candidate-card comparison.

```typescript
type MatchResult =
  | { status: 'needs-confirmation'; candidate: CatalogueProduct }
  | { status: 'unmatched' };
```

Algorithm (deterministic; no AI):
1. Normalise input: lowercase, strip punctuation, collapse whitespace, remove common quantity words ("x2", "pack of").
2. Compare normalised input against each product's normalised `name` and each entry in `aliases`.
3. **Unique exact match:** normalised input equals a normalised name or alias → `needs-confirmation` with that candidate.
4. **Unique partial match:** normalised input is a substring of one product name/alias, or one alias is a substring of the normalised input → `needs-confirmation` with that candidate.
5. **Multiple candidates or no candidates → `unmatched`**.

Every unique catalogue name match requires the explicit package-confirmation action, even when `unitSize` is empty. The prompt shows `formatPackage(product)` — catalogue name plus package (for example, “Semi-skimmed milk, 1000 ml”) — and asks “Is your price for this package?” `unitSize` is a display label only: it is never parsed, compared to, or used to infer `packageSignature`. Only “Confirm match” sets `catalogueId`, `confirmedPackageSignature`, and `matchStatus: 'confirmed'`; before then, the item is `needs-confirmation` and ineligible. Editing an item name clears `catalogueId` and `confirmedPackageSignature`, then sets `needs-confirmation` for a new unique candidate or `unmatched` otherwise before rerunning matching. Editing `unitSize` does not change the confirmed catalogue association. `currency` is part of the confirmation signature so a match is never carried across currencies.

`loadSampleBasket(currency: SupportedCurrency): BasketItem[]` — returns a hardcoded list of illustrative items using prices recorded for `currency`; its catalogue-backed items still require explicit package confirmation before recommendations.

---

## Financial Arithmetic (`lib/basket.ts`)

Implements `prd.md > Live Budget Summary`, `prd.md > Financial calculations` (hard constraint).

All functions are pure, synchronous, and have no side effects. Currency values are stored and calculated in integer minor units (for example, 1,299 GBP pence); quantities are integer hundredths. Line totals are derived as `Math.round(quantityHundredths * unitPriceMinor / 100)` and basket totals are sums of derived lines. All intermediate values and results must be safe integers.

**Input and bounds contract:**
- Accepted budget, price, and quantity text is ASCII digits with an optional single decimal point: `^(?:0|[1-9]\d*)(?:\.\d{1,2})?$`. No sign, exponent, whitespace, grouping separator, `NaN`, `Infinity`, or locale-specific comma is accepted.
- Budget and unit price must parse to positive safe integers in the selected currency’s minor unit: GBP/USD/EUR permit at most two decimal places; NGN permits at most two for this PoC. Each is capped at `999,999,999` minor units.
- Quantity must parse to a positive integer number of hundredths from `1` through `999,999` (0.01 through 9,999.99). It is never represented as a floating point state value.
- Name is 1–80 trimmed characters; unit/package text is omitted or 1–30 trimmed characters. Values outside these bounds are rejected before state or request creation.
- A request contains at most 30 items. All IDs must be unique UUIDs. When more than six items are eligible, candidate generation selects the top six rather than rejecting the request. Invalid, negative, zero where prohibited, non-finite, excessive, or unsafe values are rejected with inline client validation and a 400 server response.

**Financial source and currency rules:**
- The existing basket line price is the user-entered `unitPriceMinor`, per user-declared unit/package, in the selected session currency.
- A substitution price is only `pricesMinor[sessionCurrency]` from the accepted catalogue product. The app never accepts an AI-provided price.
- A proposed line total is calculated from the proposed quantity and its recorded catalogue price. Savings and basket totals are calculated by comparing complete before-and-after basket states, never by summing AI claims.
- A substitution requires identical source and substitute `packageSignature`; no unit or package-size conversion exists in this MVP. The app never combines or compares totals in different currencies.

```typescript
calculateLineTotalMinor(quantityHundredths: number, unitPriceMinor: number): number
calculateBasketTotalMinor(items: BasketItem[]): number
calculateOverspendMinor(totalMinor: number, budgetMinor: number): number  // 0 if within budget
calculateRemainingMinor(totalMinor: number, budgetMinor: number): number  // 0 if over budget
formatCurrency(minorAmount: number, currency: SupportedCurrency): string   // uses Intl.NumberFormat
```

---

## Recommendation Engine (`lib/recommendations.ts`)

Implements `prd.md > Recommendations`.

### `buildRecommendationRequest(items: BasketItem[], budgetMinor: number, currency: SupportedCurrency, basketRevision: number): RecommendationRequest`

The browser sends the complete basket snapshot so the server can validate IDs and derive eligibility itself. It does **not** send candidate alternative IDs as authority. Both client and server run `generateCandidates()` against the same static catalogue:
- Eligible source item: `flexible` or `optional`, `matchStatus === 'confirmed'`, has `catalogueId` and `confirmedPackageSignature`, and currency equals the session currency.
- If more than six items are eligible, keep the six with the largest current derived line totals; break equal totals by ascending `basketItemId`. This is selection, not a request error, and runs identically on client and server.
- Substitutions: take the source product's explicit alternatives with the same `packageSignature`; include one only when `pricesMinor[sessionCurrency]` is strictly below the user-entered `unitPriceMinor`, then sort by price then ID. Retain the two cheapest for Flexible items or one cheapest for Optional items.
- Quantity reduction: if `quantityHundredths % 100 === 0`, create a candidate only when whole units are at least 2, with `proposedQuantityHundredths = floor(units / 2) * 100`. Otherwise create one candidate with `floor(quantityHundredths / 2)` when that result is positive.
- Removal: create one candidate only for Optional items.
- Per item, retain at most three candidates: Flexible gets up to two substitutions plus one reduction; Optional gets up to one substitution, one reduction, and one removal.
- Candidate IDs are stable: `${basketItemId}:${type}:${proposedCatalogueId ?? 'none'}`. `proposedCatalogueId` is present only for substitutions; reduction and removal use `none`.

The AI receives this server-generated candidate list and may only rank candidate IDs and supply bounded non-financial `reason` and `tradeOffs` text. It does not create, price, or remove candidates. The app creates one card for every server-built candidate regardless of whether the AI returns it; omitted/rejected provider text uses fixed fallback copy. A rejection adds the candidate ID to `rejectedCandidateIds`, excluding it from display and future searches until fresh recommendations are requested.

### `buildRecommendationCard(candidate: ServerBuiltCandidate, providerText?: ProviderText): Recommendation | null`

The client always runs `generateCandidates()` locally and calls this builder once for every locally generated candidate. A candidate is discarded only if the app-calculated saving is not positive, or its package/currency relationship fails validation. The builder derives all financial figures and an item-level snapshot.

Optional provider text is accepted only when it belongs to the same active request/revision and has no digits, currency symbols, or currency codes. Omitted, invalid, or rejected text never removes a candidate: the builder supplies fixed app-written reason and trade-off text. Cards are displayed in AI ranking order for IDs returned by the provider, followed by any remaining card IDs in ascending `candidateId` order.

The result has an item-level snapshot only. `generatedForRevision` identifies response freshness, not automatic invalidity of unrelated recommendations.

### `ServerBuiltCandidate`

```typescript
interface ServerBuiltCandidate {
  candidateId: string;
  type: 'substitution' | 'quantity-reduction' | 'removal';
  basketItemId: string;
  currentName: string;
  proposedName: string;
  proposedQuantityHundredths?: number;
  proposedCatalogueId?: string;
}
```

It contains no prices, savings, totals, or budget figures. The server sends these candidate descriptors to the provider; the client and server each derive financial values from trusted local basket/catalogue data.

### `revalidateRecommendation(rec: Recommendation, context: RecommendationContext): 'valid' | 'needs-review'`

The acceptance path and post-acceptance sweep both call this function. A recommendation needs review when its target item snapshot or validation fails:
- The target item no longer exists in the basket
- `quantityHundredths` has changed
- `unitPriceMinor` or `currency` has changed
- `priority` has changed
- `catalogueId` or `confirmedPackageSignature` has changed
- The source product's current alternatives no longer include the proposal
- The proposed catalogue product is unavailable or has a different currency
- The proposal no longer produces a positive saving

After every accepted or manual change, the component increments `basketRevision` and revalidates all remaining pending proposals. Unrelated proposals whose target snapshot remains valid stay pending. Any non-`valid` result is marked `status: 'needs-review'`, shown with a "Needs review" indicator, and has its accept action disabled. The user requests fresh recommendations to regenerate them; the app never applies a proposal automatically.

### `findBudgetSolution(items: BasketItem[], budgetMinor: number, candidates: EvaluatedCandidate[]): BudgetSearchResult`

This replaces the former greedy `canReachBudget()` claim. It is deterministic and does not rely on an AI assertion.

The search input is exactly the visible recommendation cards that are pending, not rejected, and `valid` after revalidation. Every server-built candidate becomes one visible, actionable card; the provider only enriches it with text or the fallback text. Candidates never conflict: each affects one item only, and a plan contains at most one candidate per item.

Algorithm:
1. Group displayed candidates by target item. For exact existence, choose the cheapest valid option per item (including no change) and sum those independent choices with all unchanged items.
2. If that exact minimum total exceeds `budgetMinor`, return `{ status: 'no-solution-among-evaluated-candidates' }`. This says nothing about unevaluated real-world options.
3. If it fits, enumerate plans only to select the least disruptive qualifying plan: enumerate all one-change plans, then all two-change plans, and so on. Within a size, sort by `basketItemId`, then `candidateId`; the no-change option is first in each item’s option order. Stop at `MAX_COMBINATIONS = 2,000`.
4. Stop at the first fully completed size containing a valid plan; it is the fewest-changes plan, with the lowest ID order as tie-breaker. If the limit is reached before a size completes, return `{ status: 'search-limit-reached', solution: cheapestPerItemPlan, leastDisruptive: 'may-not-be-least-disruptive' }`. Exact existence remains known.

The limits are `MAX_ELIGIBLE_ITEMS = 6`, `MAX_CANDIDATES_PER_ITEM = 3`, and `MAX_COMBINATIONS = 2,000`. A found combination is a reviewable plan, never a batch action. `no-solution-among-evaluated-candidates` never claims global infeasibility; `search-limit-reached` means only plan selection was incomplete after exact existence succeeded. Both statuses appear below the recommendation cards with the current shortfall. Provider failure never removes valid cards or changes budget-search status.

### `applyRecommendation(state: BasketState, recommendationId: string): BasketState`

`BasketPage` uses a reducer so acceptance is one atomic transition. It locates the pending recommendation, reruns `revalidateRecommendation()` against the target item and trusted catalogue, and either returns an unchanged state with `needs-review` or: (1) for substitution, sets name, catalogue ID, confirmed package signature, user-visible unit label, and `unitPriceMinor = proposedUnitPriceMinor`; (2) for reduction, changes only `quantityHundredths`; or (3) removes only the target item; then (4) derives the after-total, adds `totalBeforeAccept - totalAfterAccept` to `accumulatedSavingsMinor`, increments `basketRevision`, revalidates remaining proposals, and recalculates bounded search status. The total drop must equal the recommendation’s derived `savingMinor`. Accepted recommendations are retained as `accepted`; rejected recommendations are excluded from future searches. A manual basket or budget edit never changes `accumulatedSavingsMinor` and marks only proposals whose target item is affected for review.

---

## API Contract: `/api/recommendations`

Implements `prd.md > Recommendations > AI and application boundaries`.  
Route: `app/api/recommendations/route.ts`

### Request

`POST /api/recommendations`  
Content-Type: `application/json`

```typescript
interface RecommendationRequest {
  budgetMinor: number;
  currency: SupportedCurrency;
  basketRevision: number;
  requestId: string;          // UUID generated for this request
  items: Array<{
    basketItemId: string;
    name: string;
    quantityHundredths: number;
    unitSize?: string;
    unitPriceMinor: number;
    priority: 'essential' | 'flexible' | 'optional';
    matchStatus: 'needs-confirmation' | 'confirmed' | 'unmatched';
    catalogueId?: string;
    confirmedPackageSignature?: string;
  }>;
}
```

The server validates all fields and independently derives eligible candidates from the trusted catalogue. It ignores any client-supplied alternative/candidate IDs because none are accepted in this contract. It passes only server-derived non-essential candidates to the provider.

### Response (success)

```typescript
interface RecommendationResponse {
  requestId: string;
  basketRevision: number;
  proposals: Array<{
    candidateId: string;            // server allowlisted candidate ID
    reason: string;                 // AI-generated display text
    tradeOffs: string;              // AI-generated display text
  }>;
}
```

### Response (error)

```typescript
interface RecommendationErrorResponse {
  code: 'model_unavailable' | 'provider_failed' | 'invalid_request' | 'rate_limited';
  error: string;   // user-safe message
  retryable: boolean;
  requestId?: string;
  basketRevision?: number;
  fallbackCandidateIds?: string[]; // present for provider/model failures; client renders these with fixed text
}
```

### Route Handler behavior

1. Declare `export const runtime = 'nodejs'`; accept JSON bodies no larger than 32 KiB and at most 30 items. If more than six items are eligible, derive candidates only for the deterministic top six; do not return 400 for that condition.
2. Parse and validate the complete schema: UUID uniqueness, text lengths, enum values, current supported currency, positive safe-integer budget/price/quantity bounds, match fields, and session-currency consistency. Return 400 on invalid input.
3. Load the server's static catalogue; derive eligible items and candidate IDs solely from it. Reject missing/invalid catalogue IDs, package signatures, and any client state that purports to be confirmed but cannot be verified.
4. Check `process.env.OPENAI_API_KEY` and cached model verification. A missing key, rejected key, unavailable model, or unverified model returns 503 `{ code: 'model_unavailable', error: 'AI explanations are unavailable', retryable: true, fallbackCandidateIds }`.
5. Apply basic public-deployment rate limiting per IP (10 requests per 10 minutes); return 429 retryable when exceeded. The local demo may use the same in-memory limiter.
6. Build the prompt from server-allowlisted candidate IDs only. Cap prompt text, model output at 1,200 tokens, and request duration at 15 seconds using an abort signal. Call the Responses API with Structured Outputs (`text.format` JSON Schema).
7. Require a complete, non-refused, schema-valid provider response. Malformed, refused, incomplete, timed-out, or empty model output returns 502 `{ code: 'provider_failed', error: 'AI explanations are unavailable', retryable: true, fallbackCandidateIds }`. In both 502 and 503 cases, return server-built candidate IDs; the client renders the matching cards with fixed fallback text so valid cards remain visible and actionable.
8. Rebuild the response with an allowlist: preserve only server candidate IDs and 1–240 character text fields; reject reasons/trade-offs containing currency symbols, decimal/currency-number patterns, or financial assertions. Financial fields are never forwarded.
9. Echo only the validated `requestId` and `basketRevision`; log provider error detail server-side and never expose it to the client.

### AI prompt structure

The Route Handler builds a system prompt that:
- Provides the server-generated candidate IDs, names, quantity/package changes, and rank criteria — never prices, totals, or budget figures
- Instructs the AI to rank only these candidates and explain qualitative trade-offs
- Explicitly prohibits invented IDs and all financial claims, prices, savings, totals, and affordability statements
- Requests JSON output conforming to the `RecommendationResponse` schema

Prompt text is kept in `lib/ai/prompt.ts` for ease of iteration.

---

## AI Provider Adapter (`lib/ai/`)

Implements the learner's requirement for a replaceable server-side provider.

```typescript
// lib/ai/provider.ts
interface AIProvider {
  getRecommendations(candidates: ServerBuiltCandidate[]): Promise<Array<{
    candidateId: string;
    reason?: string;
    tradeOffs?: string;
  }>>;
}
```

Every module under `lib/ai/` begins with `import 'server-only'`. `lib/ai/openai.ts` implements this interface using the OpenAI Node SDK. To switch providers, create a new server-only file implementing `AIProvider` and update the import in the Route Handler — no other code changes needed.

---

## File Structure

```
basketbrain/
├── src/
│   ├── app/
│   │   ├── page.tsx                    # Landing screen
│   │   ├── basket/
│   │   │   └── page.tsx                # Basket workspace (owns all session state)
│   │   ├── api/
│   │   │   └── recommendations/
│   │   │       └── route.ts            # Server-side Route Handler
│   │   ├── layout.tsx                  # Root layout, fonts, global meta
│   │   ├── SessionProvider.tsx          # Client session state across setup/basket navigation
│   │   └── globals.css                 # CSS custom properties, reset, base styles
│   ├── components/
│   │   ├── BudgetSetup.tsx
│   │   ├── BudgetSummary.tsx
│   │   ├── ItemEntryForm.tsx
│   │   ├── BasketItemRow.tsx
│   │   ├── RecommendationsPanel.tsx
│   │   └── RecommendationCard.tsx
│   ├── lib/
│   │   ├── basket.ts                   # Pure arithmetic functions
│   │   ├── catalogue.ts                # Catalogue loader + matching logic
│   │   ├── recommendations.ts          # Candidate generation, validation, reducer helpers, bounded search
│   │   ├── currencies.ts               # Supported currency list + formatting
│   │   └── ai/
│   │       ├── provider.ts             # `import 'server-only'`; AIProvider interface
│   │       ├── openai.ts               # `import 'server-only'`; OpenAI implementation
│   │       └── prompt.ts               # `import 'server-only'`; prompt builder
│   ├── data/
│   │   └── catalogue.json              # ~25–30 products, 5–6 categories
│   └── types/
│       └── index.ts                    # Shared TypeScript types
├── __tests__/
│   ├── basket.test.ts
│   ├── catalogue.test.ts
│   ├── recommendations.test.ts
│   └── api-route.test.ts
├── devpost/
│   ├── learner-profile.md
│   ├── scope.md
│   ├── prd.md
│   └── spec.md
├── .env.example                        # Placeholder names only; committed
├── .gitignore                          # `.env`, `.env.*`, `!.env.example`
├── jest.config.ts
├── next.config.ts
├── tsconfig.json
└── package.json
```

---

## External Services and Dependencies

### OpenAI API
- **Runtime boundary:** Node.js Route Handler only; `lib/ai/openai.ts` is imported only by server code and uses no `NEXT_PUBLIC_*` variables.
- **Endpoint:** `https://api.openai.com/v1/responses`
- **Model:** `process.env.OPENAI_MODEL ?? 'gpt-6-luna'`
- **Auth:** Bearer token from `process.env.OPENAI_API_KEY` (server-side only)
- **Response format:** Structured Outputs via the Responses API `text.format` JSON Schema
- **Docs:** https://developers.openai.com/api/docs/models/gpt-6-luna and https://developers.openai.com/api/docs/guides/structured-outputs
- **Published pricing at specification review (2026-10-15):** $0.10 input / $0.50 output per 1M tokens for `gpt-6-luna`; recheck the pricing page at build start
- **Key required in:** `.env.local` (local) and Vercel environment variables (if deploying)

> **Required model-access verification:** `verifyOpenAIModelAccess()` uses a shared cached promise/result so concurrent cold starts do not issue duplicate probes. It runs on server startup (or first recommendation request), caches success for 15 minutes and failure for 60 seconds, and never sends credentials to the browser. It lists models for the configured account, checks that `OPENAI_MODEL` is present, then makes one minimal Structured Outputs request using the app schema. Until it returns `{ status: 'verified' }`, explanations use the `model_unavailable` 503 fallback path. This spec does not claim any account has been verified. The API key must have a monthly spend limit configured in the OpenAI dashboard.

**Deployment limit:** The MVP is specified for a local demo. The in-memory 10-per-10-minute limiter is not sufficient across Vercel instances; any public deployment must replace it with a shared durable rate-limit store before exposing the route.

---

## Important Failure Modes

- **`OPENAI_API_KEY` missing/rejected or model unavailable** → Route Handler uses 503 `model_unavailable` (`retryable: true`), returns server-built candidates with fixed text, and `RecommendationsPanel` shows “AI explanations are unavailable.” Basket, cards, and totals remain usable.

- **OpenAI returns malformed, refused, incomplete, empty, or timed-out output** → Route Handler uses 502 `provider_failed` (`retryable: true`), returns server-built candidates with fixed text, and preserves the basket. It does not remove cards or change the budget-search status.

- **Request exceeds limits, has duplicate/invalid IDs, or has invalid values** → Route Handler returns 400. A rate-limited public request returns 429 (`retryable: true`); a body exceeding 32 KiB returns 413.

- **Late recommendation response** → the client discards it when its request ID or basket revision differs from the active request; it cannot overwrite newer recommendations.

- **Bounded search ends without a plan** → recommendations panel explicitly distinguishes `no-solution-among-evaluated-candidates` from `search-limit-reached`; neither asserts that no real-world solution exists.

- **A recommendation becomes invalid after a basket edit or accepted change** → item-level revalidation marks only affected proposals `needs-review`. The card shows "This suggestion needs review" and disables acceptance. No remaining proposal is auto-applied.

---

## What Was Simplified and Why

- **No database** — basket state lives in React memory for the session. The PRD requires no cross-session persistence; a database would add infrastructure without proving the core idea.
- **No authentication** — the PRD explicitly requires no registration. Session state is anonymous and ephemeral.
- **Catalogue as a JSON file** — a fully dynamic catalogue with a database would require an ORM, migrations, and admin tooling. A static JSON file is sufficient to demonstrate matching, alternatives, and recommendation quality.
- **Deterministic matching only** — AI-assisted fuzzy matching would add a server round-trip on every item submission and complicate the match-status lifecycle. Deterministic normalisation is fast, testable, and honest about its limitations.
- **Single AI call per recommendation session** — one batch call per "Find ways to save" action keeps the architecture simple; per-item streaming would complicate stale detection.

---

## Testing

Implements `prd.md > Architecture principles > Testing`.

### `__tests__/basket.test.ts`
- Exact money parsing: accepted decimal grammar, currency minor-unit conversion, leading zero behavior, excess precision, signs, exponent notation, whitespace, commas, `NaN`, and `Infinity`
- Quantity parsing: hundredths boundaries (0.01 and 9,999.99), invalid zero/negative/excess precision, and safe-integer overflow
- `calculateLineTotalMinor`: correct integer arithmetic, half rounding, maximum permitted values, and overflow rejection
- `calculateBasketTotalMinor`: empty basket, single item, multiple items, derived-line behavior, and overflow rejection
- `calculateOverspendMinor`: within-budget returns 0, over-budget returns correct positive amount
- Savings state: `accumulatedSavingsMinor` is the success-state savings figure; each accepted change adds its realized before/after saving and manual edits do not change it
- Currency guard: four supported currencies only, mixed currency rejected, and no conversion path exists
- Item limit: a 31st item is blocked before it enters session state

### `__tests__/catalogue.test.ts`
- Exact name match → `needs-confirmation` with the correct candidate
- Normalised alias match → `needs-confirmation` with the correct candidate
- Single partial match → `needs-confirmation` with correct candidate
- Multiple plausible matches → `unmatched`
- No match → `unmatched`
- Catalogue integrity: unique IDs, collision-free normalised aliases, valid non-self alternative references, matching symmetric alternative references, same-package signatures, complete four-currency safe-integer price records
- Sample basket: every item matches the selected currency and no fallback price is used
- Explicit package confirmation: every unique name match, including empty `unitSize`, displays catalogue name/package and only Confirm sets `confirmedPackageSignature`; `unitSize` never affects the result
- Name edit: clears confirmed association and reruns matching; unit-size edit leaves a confirmed association unchanged

### `__tests__/recommendations.test.ts`
- Confirmed matching: only `matchStatus: 'confirmed'` with `catalogueId` and `confirmedPackageSignature` is eligible; a name edit resets to `needs-confirmation` or `unmatched`
- Candidate generation: only explicitly confirmed, non-essential, same-package, same-currency trusted catalogue alternatives; deterministic order and 2/1/1 per-item cap behavior
- Candidate selection: more than six eligible items keeps six largest current line totals, ties by `basketItemId`, identically on client and server
- Candidate generation: substitution requires catalogue price strictly below user-entered unit price; whole quantities reduce by whole units, non-whole quantities by floored hundredths
- Candidate IDs: exactly `${basketItemId}:${type}:${proposedCatalogueId ?? 'none'}` and stable across regeneration for unchanged input
- `buildRecommendationCard`: discards only non-positive-saving, package-invalid, or currency-invalid candidates; it derives the recorded same-currency price
- Card text: AI order first then candidate ID; omitted or rejected text (digits, currency symbols, or codes) uses fixed fallback copy without removing cards
- Recommendation action rules: substitution keeps quantity; reduction is allowed only as an exact positive hundredths candidate below source quantity; removal is Optional-only
- Item-level revalidation: changed target quantity, unit/package label, price, priority, catalogue ID, or missing target → `needs-review`; unrelated item edit remains pending
- Revision revalidation: unchanged current context → `valid`
- `applyRecommendation` reducer: substitution sets `unitPriceMinor` to `proposedUnitPriceMinor`; the basket total drops by exactly derived `savingMinor`
- `applyRecommendation` reducer: atomic valid acceptance adds realized saving to `accumulatedSavingsMinor`, increments revision, retains unrelated proposals, and never auto-applies another proposal
- `applyRecommendation` reducer: invalid target marks only that proposal `needs-review`; rejected IDs stay excluded
- Response freshness: stale revision, mismatched request ID, overlapping requests, and out-of-order responses cannot replace current state
- `findBudgetSolution`: exact cheapest-per-item existence uses only displayed, pending, valid, non-rejected cards; enumeration completes all 1-change, then 2-change plans, with item-ID/candidate-ID tie breaks
- `findBudgetSolution`: stops at the first completed valid size; if the cap occurs before a size completes, returns `search-limit-reached` with the cheapest-per-item plan labeled “may not be the least disruptive”
- RecommendationsPanel: failed, aborted, 400, 413, 429, and network requests preserve locally generated fallback cards; 429 shows the distinct rate-limit notice

### `__tests__/api-route.test.ts`
- Uses the `@jest-environment node` header.
- Missing API key → 503, retryable, no fabricated proposals
- Cached model verification: shared concurrent probe/cache hit; unavailable model and failed schema probe → 503 `model_unavailable` fallback cards; no account-access claim before a passing probe
- OpenAI throws, times out, refuses, is incomplete, malformed, or returns empty output → 502 `provider_failed` fallback cards, no fabricated empty success
- Server ignores client-supplied alternatives/candidates and derives the allowlist from its catalogue
- Request schema: body size, item/eligible counts, duplicate/non-UUID IDs, bad catalogue associations, unsupported currency, invalid quantity/price/budget, and excessive text → correct 400/413 states
- Allowlist response: unknown candidate IDs, price/saving fields, and financial claims in explanation text rejected; valid text is length-capped
- Rate limit → 429 retryable; Node runtime and 15-second abort behavior covered
- More than six eligible items: route accepts the request and client/server select the same top six by line total then item ID
- API key and model-verification details never appear in the response payload

---

## Decisions and Open Issues

**Learner-specified decisions:**
- Next.js + TypeScript — chosen; no tradeoff required, consistent with experience.
- Server-side API key — hard requirement; Route Handler pattern satisfies it.
- Deterministic arithmetic in `lib/basket.ts` — hard requirement; functions are pure and tested.
- Replaceable AI provider adapter — implemented via `AIProvider` interface.
- No database, no auth — explicit scope control decision.

**Resolved in this revision:**
- Candidate generation is deterministic and bounded: six eligible items, three candidates per item, 2,000 evaluated combinations, and a distinct `search-limit-reached` outcome.
- AI ranks and explains only server-derived candidate IDs; it cannot create candidates or financial claims. Rejected IDs are excluded until a fresh request.
- Substitutions require exact `packageSignature` equality. No package conversion or currency conversion exists.
- Price, quantity, IDs, text, safe-integer, request, and output limits are specified in the shared client/server contract.
- Proposal validity is item-snapshot-based; revision tags protect only against stale network responses. Reducer acceptance is atomic, preserves unrelated proposals, and resets the savings baseline after manual edits.
- The initial configured OpenAI default is `gpt-6-luna` through `OPENAI_MODEL`; one-time cached server verification is required before provider use and no account access is claimed here.

**Unresolved decisions (kept within the approved scope):**
- None that block a second specification review. Actual `OPENAI_MODEL` account access remains intentionally unverified until the server-side build-start probe runs with user-provided credentials.

**Carried over from `prd.md > Open Questions`:**
- **Currency list:** Supported currencies are exactly GBP (£), USD ($), EUR (€), and NGN (₦), formatted with `Intl.NumberFormat` from minor units. Every supported code has its own illustrative catalogue price record; adding another code requires catalogue integrity tests and does not authorize conversion.
- **AI provider confirmed pending account verification:** `OPENAI_MODEL` defaults to `gpt-6-luna`; `OPENAI_API_KEY` and `OPENAI_MODEL` remain server-only. The basket, server-built cards, and all calculations work without provider access; only AI-written ranking/explanations are unavailable and fixed app text is shown instead.
