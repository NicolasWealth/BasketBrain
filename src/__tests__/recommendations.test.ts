import { BasketItem } from '../lib/basket';
import { confirmCatalogueMatch, forceConfirmCatalogueMatch, catalogue } from '../lib/catalogue';
import {
  applyRecommendationToItems,
  buildRecommendationCard,
  findBudgetSolution,
  generateCandidates,
  isCurrentRecommendationRequest,
  revalidateRecommendation,
} from '../lib/recommendations';

const item: BasketItem = confirmCatalogueMatch(
  { id: '123e4567-e89b-42d3-a456-426614174000', name: 'Semi skim milk', quantityHundredths: 200, unitPriceMinor: 300, currency: 'GBP', priority: 'flexible', matchStatus: 'needs-confirmation', pendingMatchId: 'milk-semi-1l' },
  catalogue.find((p) => p.id === 'milk-semi-1l')!,
);

describe('recommendation engine', () => {
  it('generates deterministic confirmed candidates with stable IDs', () => {
    const candidates = generateCandidates([item], 'GBP');
    expect(candidates.map((c) => c.candidateId)).toEqual([
      '123e4567-e89b-42d3-a456-426614174000:substitution:milk-whole-1l',
      '123e4567-e89b-42d3-a456-426614174000:quantity-reduction:none',
    ]);
  });

  it('uses app-calculated fallback text and saving', () => {
    const candidate = generateCandidates([item], 'GBP')[0];
    const card = buildRecommendationCard(candidate, [item], 'GBP', 0);
    expect(card?.savingMinor).toBe(322);
    expect(card?.reason).not.toMatch(/[\d£$]/);
  });

  it('reports already-within-budget without searching', () =>
    expect(findBudgetSolution([item], 1000, [])).toEqual({ status: 'already-within-budget' }));

  it('finds the fewest-change valid solution', () => {
    const card = buildRecommendationCard(generateCandidates([item], 'GBP')[0], [item], 'GBP', 0)!;
    const evaluated = { candidate: card, proposedItems: [item], savingMinor: card.savingMinor };
    expect(findBudgetSolution([item], 300, [evaluated])).toMatchObject({ status: 'solution-found', leastDisruptive: 'confirmed', solution: [evaluated] });
  });

  it('marks package-label edits as needing review', () => {
    const card = buildRecommendationCard(generateCandidates([item], 'GBP')[0], [item], 'GBP', 0)!;
    expect(revalidateRecommendation(card, [{ ...item, unitSize: 'different label' }], 'GBP')).toBe('needs-review');
  });

  it('uses the trusted replacement package label when accepting a substitution', () => {
    const card = buildRecommendationCard(generateCandidates([item], 'GBP')[0], [{ ...item, unitSize: 'old label' }], 'GBP', 0)!;
    const accepted = applyRecommendationToItems(card, [{ ...item, unitSize: 'old label' }])[0];
    expect(accepted).toMatchObject({ name: 'Whole milk', unitSize: '1000 ml', catalogueId: 'milk-whole-1l', confirmedPackageSignature: 'ml:1000', unitPriceMinor: 139 });
  });

  it('rejects stale revisions and overlapping recommendation responses', () => {
    expect(isCurrentRecommendationRequest('new', 2, 'old', 1)).toBe(false);
    expect(isCurrentRecommendationRequest('new', 2, 'old', 2)).toBe(false);
    expect(isCurrentRecommendationRequest('new', 2, 'new', 1)).toBe(false);
    expect(isCurrentRecommendationRequest('new', 2, 'new', 2)).toBe(true);
  });

  it('reports no solution when the cheapest choice per item cannot meet the budget', () => {
    const card = buildRecommendationCard(generateCandidates([item], 'GBP')[0], [item], 'GBP', 0)!;
    const evaluated = { candidate: card, proposedItems: [item], savingMinor: card.savingMinor };
    expect(findBudgetSolution([item], 1, [evaluated])).toEqual({ status: 'no-solution-among-evaluated-candidates' });
  });

  // BUG-3 regression: unmatched and needs-confirmation items must not generate candidates
  it('generates zero candidates for unmatched items', () => {
    const unmatchedItem: BasketItem = { ...item, matchStatus: 'unmatched', catalogueId: undefined, confirmedPackageSignature: undefined };
    expect(generateCandidates([unmatchedItem], 'GBP')).toHaveLength(0);
  });

  it('generates zero candidates for needs-confirmation items', () => {
    const pendingItem: BasketItem = { ...item, matchStatus: 'needs-confirmation', catalogueId: undefined, confirmedPackageSignature: undefined, pendingMatchId: 'milk-semi-1l' };
    expect(generateCandidates([pendingItem], 'GBP')).toHaveLength(0);
  });

  // BUG-3 regression: confirmed force-matched (ambiguous) items DO generate candidates
  it('generates candidates for force-confirmed ambiguous-name items', () => {
    const ambiguousPending: BasketItem = {
      ...item,
      name: 'milk',
      matchStatus: 'needs-confirmation',
      catalogueId: undefined,
      confirmedPackageSignature: undefined,
      pendingMatchId: 'milk-semi-1l',
      ambiguousCandidateIds: ['milk-semi-1l', 'milk-whole-1l'],
    };
    const product = catalogue.find((p) => p.id === 'milk-semi-1l')!;
    const forceConfirmed = forceConfirmCatalogueMatch(ambiguousPending, product);
    const candidates = generateCandidates([forceConfirmed], 'GBP');
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.some((c) => c.type === 'substitution')).toBe(true);
  });

  // BUG-3 regression: findBudgetSolution with no confirmed items produces no-solution
  it('returns no-solution-among-evaluated-candidates when candidates is empty and basket is over budget', () => {
    const overspendItem: BasketItem = { ...item, matchStatus: 'unmatched', catalogueId: undefined, confirmedPackageSignature: undefined, unitPriceMinor: 50000 };
    const result = findBudgetSolution([overspendItem], 100, []);
    expect(result.status).toBe('no-solution-among-evaluated-candidates');
  });
});
