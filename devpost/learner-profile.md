---
doc: learner-profile
status: complete
---

# Learner Profile

## Initial Idea

BasketBrain — a budget-aware shopping assistant. The user enters a fixed budget and a shopping basket (items, quantities, prices); the app calculates totals deterministically and uses AI to recommend substitutions or quantity reductions when the basket exceeds the budget. The user reviews and accepts or rejects each proposed change. The revised basket total is always calculated by application code, never by AI arithmetic.

Intended users: everyday consumers managing household or grocery expenses on a fixed budget.

Quality bar stated upfront: credible and polished, complete user flow, transparent calculations, no fake functionality or placeholder features.

## Demonstrated Technical and Agent Experience

Practical experience building software projects: web applications, APIs, software testing, debugging, and GitHub. Has used Claude Code, Codex, and Antigravity. Workflow: AI-assisted planning and implementation, followed by code review, behavioral testing, and root-cause fixes — not accepting a passing build as proof of correctness.

Evidence: "Verify claims against the actual code and behavior, investigate root causes instead of stacking patches."

## Planning-Workflow Experience

Familiar. Has used planning and structured implementation workflows across multiple projects. Self-identified improvement area: **applying requirements definition and technical specification more consistently before coding begins**. Explicitly committed to that discipline for BasketBrain.

Evidence: "I'm still improving how consistently I define requirements and technical specifications before coding. For BasketBrain, I want to work plan-first."

## Desired Learning Outcome

Getting more consistent at defining requirements and a technical spec before writing code — and holding that discipline through the build, not just acknowledging it.

Evidence: stated directly; also reflected in the explicit sequencing requirement (scope → PRD → spec → build, no skipping).

## Learning Moments

None yet. `5-build` should look for a real moment where holding the spec line changed a build decision.

## Interests, Inspirations, and Goals

Goal for BasketBrain: a credible, distinctive product that performs well against hackathon judging criteria. Not a prototype — a finished, honest product. The AI-generated substitutions + deterministic arithmetic split is the core differentiator and must be preserved.

Multi-tool workflow the learner has defined:
1. ChatGPT — product strategy, brainstorming, architecture, critical review
2. Claude — senior review of major decisions, blockers, implementation quality
3. Antigravity — implementation, debugging, UI refinement
4. Self — final product decisions, testing, approval

Devpost skills lead the interview and generate planning documents. No skipping planning; no building UI before scope, PRD, and spec are reviewed.

## Vocabulary and Concepts Likely to Need Explanation

Comfortable with: web apps, APIs, testing, debugging, GitHub, AI agent workflows, plan-first development.

Brief explanations welcome for: unfamiliar technical trade-offs at decision points. No need to define standard web or software terms.

## Collaboration and Communication Preferences

- **Concise explanations.** No preamble, no progress updates that don't require a decision or action.
- **Grouped questions acceptable** where closely related.
- **Walk through important trade-offs and challenge weak assumptions.** Don't decide for the learner; don't turn every small decision into a question.
- **Specific actions or copy-paste prompts** when something needs to be done.
- **Challenge decisions that weaken the product** — don't simply agree.

## Areas Where the Learner Wants Ownership

Product vision, key product decisions, final approval on all planning documents and builds. Antigravity handles implementation; the learner handles testing and sign-off.

## Likely Support Needs

- Trade-off explanations at architecture and spec decision points.
- Pushback when a decision weakens product credibility or honesty.
- Discipline prompts if planning is being skipped or compressed.

## Review Format

not established

## Notes and Open Questions

- Currency and price data: user-entered prices only for MVP; no live price sources. Currency formatting must be consistent.
- The AI-calculates-substitutions / app-calculates-totals split is a hard constraint, not a preference.
- No payments, retailer integrations, live scraping, or user accounts in MVP.
- Sample data must be clearly labeled as sample data, never presented as real prices.
