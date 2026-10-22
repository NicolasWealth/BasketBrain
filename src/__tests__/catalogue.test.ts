import {
  applyMatchResult,
  catalogue,
  confirmCatalogueMatch,
  editBasketItemName,
  editBasketItemUnitSize,
  forceConfirmCatalogueMatch,
  formatPackage,
  loadSampleBasket,
  matchCatalogueItem,
  normaliseCatalogueName,
  validateCatalogue,
} from '../lib/catalogue';
import { BasketItem, BasketValidationError, SUPPORTED_CURRENCIES } from '../lib/basket';

const item: BasketItem = {
  id: '4d02f50e-c5e8-47d0-91dc-79257f0d0a01',
  name: 'Semi skim milk',
  quantityHundredths: 100,
  unitPriceMinor: 150,
  currency: 'GBP',
  priority: 'flexible',
  matchStatus: 'unmatched',
};

describe('catalogue matching', () => {
  it('returns needs-confirmation for exact, normalised alias, and unique partial matches', () => {
    expect(matchCatalogueItem('Semi-skimmed milk', 'GBP')).toMatchObject({ status: 'needs-confirmation', candidate: { id: 'milk-semi-1l' } });
    expect(normaliseCatalogueName('Pack of semi skim milk x2')).toBe('semi skim milk');
    expect(matchCatalogueItem('Semi Skim Milk!', 'GBP')).toMatchObject({ status: 'needs-confirmation', candidate: { id: 'milk-semi-1l' } });
    expect(matchCatalogueItem('semi skim', 'GBP')).toMatchObject({ status: 'needs-confirmation', candidate: { id: 'milk-semi-1l' } });
  });

  // BUG-2 regression: ambiguous names must return 'ambiguous' with all candidates, not 'unmatched'
  it('returns ambiguous for names that match multiple catalogue entries', () => {
    const result = matchCatalogueItem('milk', 'GBP');
    expect(result.status).toBe('ambiguous');
    if (result.status === 'ambiguous') {
      expect(result.candidates.length).toBeGreaterThan(1);
      const ids = result.candidates.map((c) => c.id);
      expect(ids).toContain('milk-semi-1l');
      expect(ids).toContain('milk-whole-1l');
    }
  });

  it('returns unmatched for genuinely unknown products', () => {
    expect(matchCatalogueItem('plantain', 'GBP')).toEqual({ status: 'unmatched' });
    expect(matchCatalogueItem('dragon fruit', 'GBP')).toEqual({ status: 'unmatched' });
  });

  // BUG-2 regression: 'unmatched' should no longer be returned for 'milk'
  it('does not return unmatched for ambiguous names', () => {
    const result = matchCatalogueItem('milk', 'GBP');
    expect(result.status).not.toBe('unmatched');
  });
});

describe('catalogue integrity', () => {
  it('has valid package-compatible alternatives and four currency prices', () => {
    expect(catalogue).toHaveLength(24);
    expect(() => validateCatalogue(catalogue)).not.toThrow();
    for (const product of catalogue) for (const currency of SUPPORTED_CURRENCIES) expect(product.pricesMinor[currency]).toBeGreaterThan(0);
  });

  it('rejects invalid alternatives and globally duplicated labels', () => {
    expect(() => validateCatalogue([{ ...catalogue[0], alternatives: [catalogue[0].id] }])).toThrow(BasketValidationError);
    const duplicate = catalogue.map((product, index) => index === 1 ? { ...product, aliases: [catalogue[0].name] } : product);
    expect(() => validateCatalogue(duplicate)).toThrow(BasketValidationError);
  });
});

describe('package confirmation', () => {
  it('shows the catalogue package and confirms even with no unit size', () => {
    const product = catalogue.find((candidate) => candidate.id === 'milk-semi-1l')!;
    const pending = applyMatchResult({ ...item, unitSize: undefined }, matchCatalogueItem(item.name, item.currency));
    expect(formatPackage(product)).toBe('Semi-skimmed milk, 1000 ml');
    expect(pending).toMatchObject({ matchStatus: 'needs-confirmation', pendingMatchId: product.id, catalogueId: undefined, confirmedPackageSignature: undefined });
    expect(confirmCatalogueMatch(pending, product)).toMatchObject({ matchStatus: 'confirmed', catalogueId: product.id, confirmedPackageSignature: 'ml:1000', pendingMatchId: undefined });
  });

  it('resets a confirmed association on a name edit but not a unit-size edit', () => {
    const product = catalogue.find((candidate) => candidate.id === 'milk-semi-1l')!;
    const confirmed = confirmCatalogueMatch(applyMatchResult(item, matchCatalogueItem(item.name, item.currency)), product);
    expect(editBasketItemUnitSize(confirmed, 'display-only')).toMatchObject({ matchStatus: 'confirmed', catalogueId: product.id, confirmedPackageSignature: 'ml:1000' });
    expect(editBasketItemName(confirmed, 'Plantain')).toMatchObject({ name: 'Plantain', matchStatus: 'unmatched', catalogueId: undefined, confirmedPackageSignature: undefined });
  });

  // BUG-2 regression: applyMatchResult must propagate ambiguous candidates list
  it('sets ambiguousCandidateIds on ambiguous items and clears it on confirm', () => {
    const ambiguousItem = { ...item, name: 'milk' };
    const pending = applyMatchResult(ambiguousItem, matchCatalogueItem('milk', 'GBP'));
    expect(pending.matchStatus).toBe('needs-confirmation');
    expect(pending.ambiguousCandidateIds).toBeDefined();
    expect(pending.ambiguousCandidateIds!.length).toBeGreaterThan(1);
    expect(pending.ambiguousCandidateIds).toContain('milk-semi-1l');
    expect(pending.ambiguousCandidateIds).toContain('milk-whole-1l');

    // forceConfirmCatalogueMatch must work for an ambiguous item
    const semiSkimProduct = catalogue.find((p) => p.id === 'milk-semi-1l')!;
    const confirmed = forceConfirmCatalogueMatch(pending, semiSkimProduct);
    expect(confirmed.matchStatus).toBe('confirmed');
    expect(confirmed.catalogueId).toBe('milk-semi-1l');
    expect(confirmed.confirmedPackageSignature).toBe('ml:1000');
    expect(confirmed.ambiguousCandidateIds).toBeUndefined();
    expect(confirmed.pendingMatchId).toBeUndefined();
  });

  // BUG-2 regression: forceConfirmCatalogueMatch rejects unknown products
  it('forceConfirmCatalogueMatch rejects products not in catalogue', () => {
    const fakeProd = { id: 'fake-id', name: 'Fake', category: 'fake', packageUnit: 'g' as const, packageSize: 100, packageSignature: 'g:100', pricesMinor: { GBP: 100, USD: 100, EUR: 100, NGN: 100 }, aliases: [], alternatives: [] };
    expect(() => forceConfirmCatalogueMatch(item, fakeProd)).toThrow(BasketValidationError);
  });

  it('forceConfirmCatalogueMatch rejects catalogue products outside the ambiguous match set', () => {
    const ambiguous = applyMatchResult({ ...item, name: 'milk' }, matchCatalogueItem('milk', 'GBP'));
    const unrelated = catalogue.find((product) => product.id === 'bread-white-800g')!;
    expect(() => forceConfirmCatalogueMatch(ambiguous, unrelated)).toThrow(BasketValidationError);
  });
});

describe('sample basket', () => {
  it.each(SUPPORTED_CURRENCIES)('uses only requested %s prices and leaves matches unconfirmed', (currency) => {
    const items = loadSampleBasket(currency);
    expect(items).toHaveLength(4);
    expect(items.every((sampleItem) => sampleItem.currency === currency && sampleItem.catalogueId === undefined)).toBe(true);
    expect(items.filter((sampleItem) => sampleItem.matchStatus === 'needs-confirmation')).toHaveLength(3);
    expect(items.some((sampleItem) => sampleItem.matchStatus === 'unmatched')).toBe(true);
  });
});
