---
doc: prd
status: approved
---

# BasketBrain — Product Requirements

A budget-aware shopping assistant for household consumers who need to manage a fixed shopping budget. Users build a basket, see their budget position in real time, and receive grounded, explainable substitution recommendations they can accept or reject one at a time.

Source: `scope.md > The Unique Kernel`, `scope.md > Who It's For`, `scope.md > The Core Loop`.

---

## The Core Journey

1. **Arrive.** The user opens BasketBrain and sees a clean landing screen with a budget input, a currency selector, and two actions: start their own basket or load a sample basket.
2. **Set the budget.** The user selects a currency and enters a positive numeric budget. The app validates the input inline before proceeding.
3. **Build the basket.** The user adds items one at a time using a compact entry form: item name, quantity, optional unit/package size, unit price, and priority (Essential / Flexible / Optional, defaulting to Flexible). Each submitted item appears as a row in the basket.
4. **See the position.** As items are added or edited, the live budget summary updates immediately — budget, total, and remaining or over-budget amount — using application code.
5. **Catalogue matching.** After each item is submitted, the app attempts a deterministic catalogue match and displays the result as a status label (Matched / Needs confirmation / Unmatched) inline with the item. Ambiguous matches prompt the user to confirm or dismiss without blocking basket entry.
6. **Trigger optimization.** When the basket exceeds the budget, a prominent "Find ways to save" action appears. If the basket is within budget, no optimization is forced.
7. **Review recommendations.** Tapping "Find ways to save" reveals an inline recommendations section below the basket. The app displays a loading state while generating suggestions, then shows recommendation cards — one per proposed change.
8. **Decide each change.** Each recommendation card shows the proposed change, the current versus proposed item (including unit/package size differences), the individual saving (calculated by application code), a specific reason, and any meaningful trade-off. The user accepts or rejects each card independently.
9. **See the result.** Accepted changes update the basket and budget summary immediately. The app recalculates all totals after each accepted change and invalidates any recommendations that are now stale or inconsistent.
10. **Reach a conclusion.** When the basket is within budget, a success state shows the final total, total savings, and remaining budget — all calculated by application code. If no valid solution exists, the app explains the shortfall honestly. It never claims the basket is affordable when the calculated total exceeds the budget.

---

## Screens and Layout

### Screen 1 — Landing

A single focused surface. No navigation to other parts of the app.

- **Header:** BasketBrain wordmark and a compact basket-inspired icon. No account controls or unrelated nav links.
- **Welcome area:** Heading and a two-sentence supporting statement. Concise; no long onboarding explanation.
- **Budget setup panel:** Currency selector and budget amount input, visually foregrounded. Primary action: "Start my basket." Secondary action: "Try a sample basket."
- **Validation:** Inline error messages for invalid or empty budget values. No modal interruptions.

### Screen 2 — Basket Workspace

The primary working surface. Reached after budget setup or sample basket load. No page navigation away from this screen during the optimization flow.

**On mobile (default layout — vertical stack):**
1. Budget summary bar (pinned near the top — always visible)
2. Item entry form
3. Basket item list
4. Recommendations section (revealed below the list on request)

**On desktop:**
- Budget summary panel in a prominent sidebar or sticky header
- Item entry form and basket list in the main content area
- Recommendations section below the basket list, full width

No wide spreadsheet layout. The basket must be fully usable on a small screen without horizontal scrolling.

---

## Look and Feel

Source: user-specified visual direction.

- **Palette:** Warm neutral background (off-white or light warm grey). Deep green as the primary accent color. Restrained warning color (amber or muted red) for overspend states. Calm success color (light green or teal-adjacent) for within-budget states. No bright primaries.
- **Typography:** Crisp, readable sans-serif. Generous line height and spacing. Item names and financial figures should be clearly legible at small sizes.
- **Visual detail:** A compact, purposeful basket illustration or icon — used sparingly. No generic AI gradients, no excessive glassmorphism, no decorative dashboard charts.
- **Spacing and borders:** Generous internal padding. Restrained use of borders and shadows — enough to separate sections without visual noise.
- **Tone:** Calm, trustworthy, practical. The design should feel like a well-made consumer-finance tool, not a gamified app or a marketing landing page.
- **Responsive:** Mobile-first. The desktop layout should feel natural and spacious, not a zoomed-in mobile view.
- **Color is never the sole indicator** of status, priority, or match state — always paired with a text label or icon.

---

## Features and Behavior

### Budget Setup

- The user selects a currency from a list. The selected currency symbol and formatting are applied consistently throughout the app for all displayed amounts.
- The budget input accepts positive numeric values only. Decimal values are permitted.
- Inline validation appears immediately on blur or submission: "Please enter a valid budget amount."
- The budget can be changed after basket entry begins. Changing it recalculates the budget summary immediately.
- Source: `scope.md > The POC Boundary`.

### Sample Basket

- "Try a sample basket" pre-populates the basket with a set of clearly labelled illustrative items and prices. A persistent notice — visible throughout the session — identifies the data as sample / illustrative prices, not current market pricing.
- Sample items are matched against the catalogue. Some are matched, some unmatched, to demonstrate both states.
- Sample data must never be presented as real or current prices.

### Item Entry

- Entry form fields: item name (text), quantity (positive numeric), unit/package size (optional text), unit price (positive numeric), priority (segmented selector: Essential / Flexible / Optional; default: Flexible).
- After submission, the item appears as a row or compact card in the basket list showing: name, quantity, unit/package size if entered, unit price, line total (quantity × unit price, calculated by application code), priority label, and catalogue match status.
- Line totals and the basket total update immediately after each addition, edit, or removal.
- Users can edit any field of an existing item in-place. Editing does not remove the item from the basket.
- Users can remove an item. Removing an item recalculates all totals immediately.
- Source: `scope.md > The POC Boundary`.

### Priority System

- **Essential:** The item is protected from automatic substitution, quantity reduction, or removal. It must not appear in recommendations unless the user explicitly edits its priority to Flexible or Optional.
- **Flexible:** The item may be substituted with a catalogue alternative or have its quantity reduced in recommendations.
- **Optional:** The item may be reduced in quantity or removed in recommendations when necessary.
- Priority is selectable at entry time and editable at any time after. Editing priority on an item that has an accepted recommendation does not retroactively undo the accepted change.
- A short explanation of the three priorities is displayed near the selector or as unobtrusive helper text. It does not repeat on every item row.
- Source: `scope.md > The POC Boundary`.

### Catalogue and Matching

**Catalogue structure:**
- Approximately 25–30 sample products across 5–6 grocery categories.
- Each product has: stable ID, human-readable name, category, unit/package size, illustrative sample price, and any explicit alternative relationships (e.g. "Brand A milk → Brand B milk, same unit").
- All prices are labelled as illustrative sample prices at the point of display.
- Source: `scope.md > The POC Boundary`.

**Matching behavior:**
- Matching is attempted immediately after the user submits an item, without blocking basket entry or requiring a round-trip before the item appears.
- Matching uses deterministic name normalization (e.g. lowercase, stripped punctuation, known aliases) against catalogue product names and category labels.
- **Clear match:** The item is associated with a catalogue entry. A subtle "Matched" label appears on the item row.
- **Ambiguous match:** The item is added to the basket normally, and a compact inline prompt appears: "Did you mean [catalogue product name]?" with two explicit actions — "Confirm match" and "Keep as entered." Neither is pre-selected.
- **No match:** The item is added and labelled "No catalogue match." No unrelated product is suggested, and the user is not blocked.
- Matching status does not affect basket arithmetic. Every item contributes its full line total regardless of match status.
- The user can confirm, change, or clear a match by editing the item at any time. Clearing a match does not remove the item from the basket.
- If a confirmed match becomes invalid (e.g. unit mismatch discovered later), the association is invalidated and the item returns to "Needs confirmation" before being used in recommendations.

**Match status labels (always text + optional icon; never color alone):**
- **Matched** — catalogue association confirmed.
- **Needs confirmation** — plausible match awaiting user confirmation.
- **Unmatched** — no defensible catalogue match found.

### Live Budget Summary

- Displayed: budget, current basket total, and either remaining budget (when within budget) or overspend amount (when over budget).
- All values calculated by application code.
- Updates immediately whenever the budget is changed, any item is added, edited, or removed, or any accepted recommendation changes the basket.
- When over budget: a restrained warning indicator (icon + text + numeric overspend amount, e.g. "You're £6.40 over budget"). A progress bar or budget meter may appear as a secondary visual cue but must not replace the numeric display.
- When within budget: a calm success indicator and the remaining amount.
- Source: `scope.md > The Core Loop`.

### Recommendations

**Triggering:**
- "Find ways to save" appears prominently when the basket total exceeds the budget.
- The button does not appear or pressure the user when the basket is within budget.

**Generation:**
- A loading state is displayed while recommendations are being prepared.
- The AI ranks eligible catalogue alternatives for Flexible and Optional items with confirmed catalogue matches, and may suggest quantity reductions for Optional items.
- Essential items are excluded from recommendations unless their priority has been changed by the user.
- Unmatched and unconfirmed items are excluded from catalogue-based recommendations. Their exclusion is briefly explained (e.g. "No catalogue alternatives available for [item name]").
- The AI must not invent products, prices, or catalogue relationships. It may generate explanatory text for recommendations.
- Application code validates each proposed change, enforces priority constraints, and calculates all displayed savings and totals.

**Recommendation cards:**
Each card contains:
- Proposed change (e.g. "Replace [item A] with [item B]" or "Reduce [item] from 3 to 2")
- Current vs. proposed: item names, quantities, and unit/package sizes where relevant
- Individual saving: calculated by application code
- Reason: a short, specific explanation of why this change is appropriate
- Trade-off disclosure: any meaningful difference in product or quantity is explicitly stated
- Two actions: "Accept change" and "Reject" — neither is the default

**Accepting:**
- The change is applied to the basket immediately.
- Application code recalculates the basket total, total savings, and remaining budget.
- The recommendation card is marked "Applied."
- Any other recommendation cards that are now stale or inconsistent with the updated basket are marked "Needs review" rather than applied automatically.

**Rejecting:**
- The basket is unchanged.
- The card is marked "Rejected" and removed from the active suggestions. The same recommendation is not re-presented in the current session.

**No batch approval:** The user acts on each recommendation independently. They are never required to approve a full plan before seeing any change applied.

**Savings arithmetic:** Individual savings from separate recommendations are never summed unless they apply to independent items with no interactions. After each accepted change, totals are recalculated from the basket state; the displayed total saving is the difference between the original basket total and the current basket total.

### Completion and Outcome States

**Success:** When the revised basket total is at or below the budget, display: final basket total, total saving (original total minus current total, calculated by application code), and remaining budget. All three are displayed as explicit numbers.

**Partial progress:** If recommendations remain after some are accepted/rejected, they stay available. The budget summary reflects the current state.

**Honest failure:** If all recommendations are exhausted and the basket is still over budget, the app states the remaining shortfall explicitly and does not claim the basket is affordable. If no valid alternatives exist from the outset, this is explained clearly.

**Recommendation service failure:** The basket and its current totals are preserved. An error message is shown with a retry action. The user can continue editing the basket normally.

---

## States and Boundaries

- **First visit / empty basket:** Landing screen with empty budget input. No prefilled items or phantom basket data.
- **Invalid budget:** Inline validation prevents proceeding. No modal.
- **Within-budget basket:** Calm success indicator in the budget summary. No optimization prompt.
- **Over-budget basket:** Warning indicator in the budget summary; "Find ways to save" CTA visible.
- **Loading recommendations:** A visible loading state below the basket. The basket remains readable and editable.
- **No recommendations available:** The section explains why (e.g. no matched items eligible for substitution) and preserves the current basket.
- **Partial recommendation set:** Some items have no catalogue match; their exclusion is explained per item in the recommendations section.
- **Stale recommendation:** A recommendation is marked "Needs review" if an earlier accepted change makes it inconsistent. It is not applied automatically.
- **All recommendations resolved:** Either success state or honest failure — never a silent end.
- **Session persistence:** No cross-session persistence in the PoC. Refreshing the page resets the basket. (The sample basket can always be reloaded.)
- **Essential item safeguard:** Essential items do not appear in the recommendations list unless the user changes their priority. The UI does not offer a workaround that silently bypasses this.

---

## Product Decisions

- **Flexible as default priority** — keeps entry fast; users only need to act when an item should be essential or optional.
- **Inline matching, non-blocking** — matching improves recommendation quality but must never interrupt basket building or affect arithmetic.
- **Per-recommendation accept/reject, no batch** — the user understands each change and its effect before the next recommendation is considered; recommended savings are never summed across independent changes without recalculation.
- **Recommendations inline below the basket, not a separate screen** — the user keeps the basket in view while reviewing suggestions; no context switch required.
- **Honest failure over silent failure** — if no valid solution exists, the app says so; it never displays a within-budget state when the calculated total exceeds the budget.
- **Sample basket clearly labelled** — sample/illustrative pricing is disclosed persistently throughout the session, not just at load time.
- **AI generates text; application code owns all arithmetic** — hard constraint inherited from scope; applies to every displayed financial figure without exception.
- **No registration required** — the PoC is fully functional without an account.

---

## What We're Building

- Landing screen: wordmark, welcome copy, currency selector, budget input, "Start my basket" and "Try a sample basket" actions, inline budget validation.
- Basket workspace: item entry form (name, quantity, unit size, unit price, priority), item list with live line totals, editable and removable items, priority labels and help text.
- Catalogue: ~25–30 products, 5–6 categories, illustrative prices, explicit alternative relationships, stable IDs, clearly labelled as sample data.
- Deterministic catalogue matching: immediate post-submission, three states with text labels, inline confirmation UI, non-blocking.
- Live budget summary: budget, total, remaining/over-budget — recalculated by application code on every basket change.
- Overspend indicator with numeric amount; within-budget success indicator; progress bar as secondary cue.
- "Find ways to save" trigger (over-budget only).
- Recommendations section: loading state, recommendation cards with change details / savings / reason / trade-offs / accept-reject actions; applied and rejected states; stale-recommendation handling; honest failure and success states.
- Responsive mobile-first layout; accessible text labels for all status indicators; no color-only communication.

---

## Deferred From the POC

- **Cross-session persistence / saved baskets** — requires storage infrastructure not needed to prove the core loop.
- **User accounts** — no authenticated state in the PoC; not needed for the demo.
- **User-supplied alternatives at entry time** — scope allows this but the PoC uses catalogue alternatives only; user-entered alternatives are a later enhancement.
- **Live or verified price data** — no real price source; all prices are illustrative by design.
- **Expanded catalogue** — the PoC catalogue is sized to demonstrate the flow, not to cover all grocery categories.

---

## Possible Later Enhancements

- User-supplied alternative suggestions (e.g. "I know a cheaper version of this").
- Saved and named shopping lists with cross-session persistence.
- Export or share basket (plain text or PDF).
- Expanded catalogue with richer alternative relationships and more categories.
- Optional: real price integration if a verified, free-to-use source is identified.

---

## Non-Goals

- **AI-calculated totals** — application code owns all arithmetic. Hard constraint.
- **Live price scraping or retailer integrations** — no verified price source; would misrepresent data.
- **Payments** — unrelated to the shopping optimization problem.
- **User accounts or registration** — not needed for the PoC flow.
- **Invented product equivalences** — the app does not claim two products are equivalent without a defensible catalogue relationship.

---

## Open Questions

- **Currency list:** The specific currencies to include in the selector are not yet defined. This can be resolved in `4-spec` — a short list of common currencies (GBP, USD, EUR, NGN, others as appropriate) is sufficient for the PoC; does not block PRD approval.
- **AI service:** The technical mechanism for AI-generated recommendation text and ranking (e.g. a specific API, a local model, or a structured prompt) is a `4-spec` decision. The PRD specifies only what AI is permitted to do and what it is not permitted to do.
