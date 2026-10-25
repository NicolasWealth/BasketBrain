import rawCatalogue from '../data/catalogue.json';
import { BasketItem, BasketValidationError, parseName, parseUnitSize, SUPPORTED_CURRENCIES, SupportedCurrency } from './basket';

export interface CatalogueProduct {
  id: string;
  name: string;
  category: string;
  packageUnit: 'g' | 'ml' | 'count';
  packageSize: number;
  packageSignature: string;
  pricesMinor: Record<SupportedCurrency, number>;
  aliases: string[];
  alternatives: string[];
}

export type MatchResult =
  | { status: 'needs-confirmation'; candidate: CatalogueProduct }
  | { status: 'ambiguous'; candidates: CatalogueProduct[] }
  | { status: 'unmatched' };

const PACKAGE_UNITS = ['g', 'ml', 'count'] as const;

function assertCurrency(currency: string): asserts currency is SupportedCurrency {
  if (!(SUPPORTED_CURRENCIES as readonly string[]).includes(currency)) throw new BasketValidationError('Unsupported currency.');
}

export function normaliseCatalogueName(input: string): string {
  return input.toLowerCase().replace(/\bpack\s+of\b/gu, ' ').replace(/\bx\s*\d+\b/gu, ' ').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/gu, ' ').trim();
}

export function formatPackage(product: CatalogueProduct): string {
  return `${product.name}, ${product.packageSize} ${product.packageUnit}`;
}

function assertPositiveSafeInteger(value: unknown, field: string): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new BasketValidationError(`${field} must be a positive safe integer.`);
}

export function validateCatalogue(products: CatalogueProduct[]): void {
  const ids = new Set<string>();
  const labels = new Set<string>();
  for (const product of products) {
    if (!product.id || ids.has(product.id)) throw new BasketValidationError('Catalogue product IDs must be unique.');
    ids.add(product.id);
    if (!product.name || !product.category || !PACKAGE_UNITS.includes(product.packageUnit)) throw new BasketValidationError('Catalogue product metadata is invalid.');
    assertPositiveSafeInteger(product.packageSize, 'Package size');
    if (product.packageSignature !== `${product.packageUnit}:${product.packageSize}`) throw new BasketValidationError('Catalogue package signature is invalid.');
    if (!Array.isArray(product.aliases) || !Array.isArray(product.alternatives)) throw new BasketValidationError('Catalogue aliases and alternatives must be arrays.');
    for (const label of [product.name, ...product.aliases]) {
      const normalised = normaliseCatalogueName(label);
      if (!normalised || labels.has(normalised)) throw new BasketValidationError('Catalogue names and aliases must be globally collision-free.');
      labels.add(normalised);
    }
    for (const currency of SUPPORTED_CURRENCIES) assertPositiveSafeInteger(product.pricesMinor?.[currency], `Catalogue price for ${currency}`);
  }
  for (const product of products) for (const alternativeId of product.alternatives) {
    if (alternativeId === product.id) throw new BasketValidationError('Catalogue products cannot reference themselves as alternatives.');
    const alternative = products.find((candidate) => candidate.id === alternativeId);
    if (!alternative || !alternative.alternatives.includes(product.id)) throw new BasketValidationError('Catalogue alternatives must reference each other.');
    if (alternative.packageSignature !== product.packageSignature) throw new BasketValidationError('Catalogue alternatives must have matching package signatures.');
  }
}

export const catalogue = rawCatalogue as CatalogueProduct[];
validateCatalogue(catalogue);

function matchingProducts(input: string, predicate: (label: string, value: string) => boolean): CatalogueProduct[] {
  const value = normaliseCatalogueName(input);
  if (!value) return [];
  return catalogue.filter((product) => [product.name, ...product.aliases].some((label) => predicate(normaliseCatalogueName(label), value)));
}

export function matchCatalogueItem(input: string, currency: SupportedCurrency): MatchResult {
  assertCurrency(currency);
  const exact = matchingProducts(input, (label, value) => label === value);
  if (exact.length === 1) return { status: 'needs-confirmation', candidate: exact[0] };
  if (exact.length > 1) return { status: 'ambiguous', candidates: exact };
  const partial = matchingProducts(input, (label, value) => label.includes(value) || value.includes(label));
  if (partial.length === 1) return { status: 'needs-confirmation', candidate: partial[0] };
  if (partial.length > 1) return { status: 'ambiguous', candidates: partial };
  return { status: 'unmatched' };
}

export function applyMatchResult(item: BasketItem, match: MatchResult): BasketItem {
  if (match.status === 'needs-confirmation') {
    return { ...item, matchStatus: 'needs-confirmation', catalogueId: undefined, confirmedPackageSignature: undefined, pendingMatchId: match.candidate.id };
  }
  if (match.status === 'ambiguous') {
    // Store first candidate as pending; UI will prompt user to pick from all candidates.
    return { ...item, matchStatus: 'needs-confirmation', catalogueId: undefined, confirmedPackageSignature: undefined, pendingMatchId: match.candidates[0].id, ambiguousCandidateIds: match.candidates.map((c) => c.id) };
  }
  return { ...item, matchStatus: 'unmatched', catalogueId: undefined, confirmedPackageSignature: undefined, pendingMatchId: undefined, ambiguousCandidateIds: undefined };
}

/**
 * Confirms a catalogue match where the item name produces a unique match.
 * Throws if the match is not currently unique or the product doesn't match.
 */
export function confirmCatalogueMatch(item: BasketItem, product: CatalogueProduct): BasketItem {
  const match = matchCatalogueItem(item.name, item.currency);
  if (match.status !== 'needs-confirmation' || match.candidate.id !== product.id || product.pricesMinor[item.currency] === undefined) throw new BasketValidationError('The product is not the current unique catalogue match.');
  return { ...item, matchStatus: 'confirmed', catalogueId: product.id, confirmedPackageSignature: product.packageSignature, pendingMatchId: undefined, ambiguousCandidateIds: undefined };
}

/**
 * Force-confirms a catalogue match for ambiguous or manually-selected products.
 * Used when the user explicitly picks from a list of candidates.
 * The product must exist in the catalogue with a valid price for the item's currency.
 */
export function forceConfirmCatalogueMatch(item: BasketItem, product: CatalogueProduct): BasketItem {
  const knownProduct = catalogue.find((p) => p.id === product.id);
  if (!knownProduct || knownProduct.pricesMinor[item.currency] === undefined) throw new BasketValidationError('The selected product is not in the catalogue.');
  const match = matchCatalogueItem(item.name, item.currency);
  if (match.status !== 'ambiguous' || !match.candidates.some((candidate) => candidate.id === product.id)) throw new BasketValidationError('The selected product is not a valid match for this item.');
  return { ...item, matchStatus: 'confirmed', catalogueId: product.id, confirmedPackageSignature: product.packageSignature, pendingMatchId: undefined, ambiguousCandidateIds: undefined };
}

export function editBasketItemName(item: BasketItem, name: string): BasketItem {
  const updated = { ...item, name: parseName(name) };
  return applyMatchResult(updated, matchCatalogueItem(updated.name, updated.currency));
}

export function editBasketItemUnitSize(item: BasketItem, unitSize: string | undefined): BasketItem {
  return { ...item, unitSize: parseUnitSize(unitSize) };
}

const SAMPLE_ITEMS = [
  { id: '45c9b9b7-a337-44a8-b5b4-27a0fd72a001', name: 'Basmati rice', productId: 'rice-basmati-1kg', quantityHundredths: 100, unitSize: '1 kg', priority: 'flexible' as const },
  { id: '45c9b9b7-a337-44a8-b5b4-27a0fd72a002', name: 'Free range eggs', productId: 'eggs-free-range-12', quantityHundredths: 100, unitSize: '12 eggs', priority: 'flexible' as const },
  { id: '45c9b9b7-a337-44a8-b5b4-27a0fd72a003', name: 'Greek yoghurt', productId: 'yoghurt-greek-500g', quantityHundredths: 100, unitSize: '500 g', priority: 'flexible' as const },
  { id: '45c9b9b7-a337-44a8-b5b4-27a0fd72a004', name: 'Wholemeal bread', productId: 'bread-wholemeal-800g', quantityHundredths: 100, unitSize: '800 g', priority: 'essential' as const },
  { id: '45c9b9b7-a337-44a8-b5b4-27a0fd72a005', name: 'Whole milk', productId: 'milk-whole-1l', quantityHundredths: 100, unitSize: '1 litre', priority: 'essential' as const },
  { id: '45c9b9b7-a337-44a8-b5b4-27a0fd72a006', name: 'Penne pasta', productId: 'pasta-penne-500g', quantityHundredths: 200, unitSize: '500 g', priority: 'flexible' as const },
  { id: '45c9b9b7-a337-44a8-b5b4-27a0fd72a007', name: 'Plantain', quantityHundredths: 100, priority: 'optional' as const, illustrativePrices: { GBP: 150, USD: 199, EUR: 175, NGN: 240000 } },
];

export function loadSampleBasket(currency: SupportedCurrency): BasketItem[] {
  assertCurrency(currency);
  return SAMPLE_ITEMS.map((sample) => {
    const product = 'productId' in sample ? catalogue.find((candidate) => candidate.id === sample.productId) : undefined;
    if ('productId' in sample && !product) throw new BasketValidationError('Sample item references an unknown catalogue product.');
    const { productId: _productId, illustrativePrices, ...itemDetails } = sample;
    if (!product && !illustrativePrices) throw new BasketValidationError('Sample item has no illustrative price.');
    const item: BasketItem = { ...itemDetails, unitPriceMinor: product ? product.pricesMinor[currency] : illustrativePrices![currency], currency, matchStatus: 'unmatched' };
    // The explicit sample-basket action loads curated demo products with known package identities.
    // These seeded products are pre-confirmed so the demo reaches savings without repetitive setup;
    // manually entered products still follow the normal confirmation flow.
    return product
      ? { ...item, matchStatus: 'confirmed', catalogueId: product.id, confirmedPackageSignature: product.packageSignature }
      : applyMatchResult(item, matchCatalogueItem(item.name, currency));
  });
}
