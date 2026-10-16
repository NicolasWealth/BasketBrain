---
doc: scope
status: approved
---

# BasketBrain

A budget-aware shopping assistant that helps users build a useful basket without exceeding a fixed budget — by recommending grounded, explainable substitutions and letting the user decide every trade-off.

## The Unique Kernel

Every substitution BasketBrain suggests is anchored to a real catalogue relationship or a confirmed user-supplied alternative. Every total, saving, and budget figure is calculated by application code — never by AI arithmetic. The user controls which items are protected, which are flexible, and which can be cut. Nothing is optimised silently.

## Who It's For

A household shopper — someone managing a weekly grocery run on a fixed budget. They write a list, get to the checkout, and it's over budget. Today they either put items back at random or mentally shuffle prices on the spot. BasketBrain gives them a structured way to make that decision before they shop.

## The Core Loop

They open the app, set a currency and budget, and add their items with quantities, prices, and a priority (essential / flexible / optional). The app shows the running total and flags the overspend. They ask for recommendations. BasketBrain proposes catalogue-backed substitutions or quantity reductions — each with a reason and a saving. They accept some, reject others. The app recalculates after every change. They end with a basket that fits their budget, or a clear explanation of why it can't.

## Inspiration & Identity

No specific reference provided. The feel should be calm and trustworthy — a practical tool, not a gamified experience. Transparent by default: calculations always visible, trade-offs always named.

## Why This Matters to the Learner

BasketBrain is the vehicle for practicing rigorous plan-first development — scope before PRD, PRD before spec, spec before code. The product itself must be credible enough to judge on its own merits: complete user flow, honest calculations, no placeholder features.

## What "Working" Looks Like

A user sets a £25 budget and adds a basket that totals more — with at least one essential item, one flexible, and one optional. BasketBrain shows the overspend clearly. They request recommendations. At least one catalogue-backed substitution is shown with an explanation and a saving. They accept one recommendation, reject another, and watch the basket update in real time. The app recalculates the revised total, total savings, and remaining budget using application code. The final basket is within budget — or, if no valid solution exists, the app states the shortfall honestly rather than claiming success.

The demo moment: the visible transition from an over-budget basket to a user-approved, affordable basket, with every change and every number explainable.

## The POC Boundary

**In:**
- Currency selector + budget entry
- Item entry: free-form name, quantity, price, priority (essential / flexible / optional)
- Running total calculated by application code; overspend flagged clearly
- Catalogue of ~25–30 grocery products across 5–6 categories, each with a stable ID, name, category, unit/package size, sample price, and explicit alternative relationships; all prices labelled as illustrative
- Catalogue matching: deterministic normalised-string matching against category and name; ambiguous matches surfaced for user confirmation; no silent mismatches
- Recommendations engine: AI ranks valid catalogue alternatives and quantity reductions for flexible/optional items; AI explains trade-offs; app code calculates all savings and totals
- Essential item protection: essential items excluded from automatic recommendations unless the user explicitly overrides
- Per-recommendation accept/reject with immediate basket recalculation
- Honest failure state: if no valid solution exists within budget, the app explains the shortfall
- Unmatched items: included in the basket total; no fabricated substitutions offered
- Responsive, clear UI with loading, error, empty, and success states

**Not required for PoC:**
- Live price data or retailer integrations
- User accounts, saved baskets, or history
- Payments
- More than one simultaneous optimisation pass

## Later

- Expanded catalogue with more categories and richer alternative relationships
- User-supplied alternative suggestions (e.g. "I know a cheaper version of this")
- Export or share basket
- Saved shopping lists

## Explicitly Cut

- **Live price scraping**: no verified price source exists; using it would misrepresent the data. Sample prices only, clearly labelled.
- **Retailer integrations**: out of scope for a PoC; adds dependency without proving the core idea.
- **User accounts**: the core loop doesn't require persistence across sessions.
- **Payments**: entirely unrelated to the shopping optimisation problem.
- **AI-calculated totals**: hard constraint, not a cut — app code owns all arithmetic, always.
