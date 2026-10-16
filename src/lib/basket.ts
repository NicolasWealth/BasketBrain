export const SUPPORTED_CURRENCIES = ['GBP', 'USD', 'EUR', 'NGN'] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];
export type BasketItemPriority = 'essential' | 'flexible' | 'optional';
export type MatchStatus = 'needs-confirmation' | 'confirmed' | 'unmatched';

export interface BasketItem {
  id: string;
  name: string;
  quantityHundredths: number;
  unitSize?: string;
  unitPriceMinor: number;
  currency: SupportedCurrency;
  priority: BasketItemPriority;
  matchStatus: MatchStatus;
  catalogueId?: string;
  confirmedPackageSignature?: string;
  pendingMatchId?: string;
}

export interface BasketState {
  currency: SupportedCurrency;
  budgetMinor: number;
  items: BasketItem[];
  basketRevision: number;
  accumulatedSavingsMinor: number;
}

export const MAX_MONEY_MINOR = 999_999_999;
export const MAX_QUANTITY_HUNDREDTHS = 999_999;
export const MAX_BASKET_ITEMS = 30;

const DECIMAL_INPUT = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class BasketValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BasketValidationError';
  }
}

function assertSafeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new BasketValidationError(`${field} must be a safe integer.`);
  }
}

function assertPositiveMoney(value: number, field: string): void {
  assertSafeInteger(value, field);
  if (value < 1 || value > MAX_MONEY_MINOR) {
    throw new BasketValidationError(`${field} must be between 1 and ${MAX_MONEY_MINOR}.`);
  }
}

function assertNonNegativeMinor(value: number, field: string): void {
  assertSafeInteger(value, field);
  if (value < 0) {
    throw new BasketValidationError(`${field} must not be negative.`);
  }
}

function assertSupportedCurrency(currency: string): asserts currency is SupportedCurrency {
  if (!(SUPPORTED_CURRENCIES as readonly string[]).includes(currency)) {
    throw new BasketValidationError('Unsupported currency.');
  }
}

function parseDecimalToHundredths(input: string, field: string): number {
  if (!DECIMAL_INPUT.test(input)) {
    throw new BasketValidationError(`${field} must be a positive decimal amount with at most two decimal places.`);
  }

  const [whole, fraction = ''] = input.split('.');
  const wholeValue = Number(whole);
  if (!Number.isSafeInteger(wholeValue) || wholeValue > Math.floor(Number.MAX_SAFE_INTEGER / 100)) {
    throw new BasketValidationError(`${field} is too large.`);
  }

  const hundredths = wholeValue * 100 + Number(fraction.padEnd(2, '0'));
  assertSafeInteger(hundredths, field);
  return hundredths;
}

export function parseMoneyToMinor(input: string, currency: SupportedCurrency): number {
  assertSupportedCurrency(currency);
  const minorAmount = parseDecimalToHundredths(input, 'Money amount');
  assertPositiveMoney(minorAmount, 'Money amount');
  return minorAmount;
}

export function parseQuantityToHundredths(input: string): number {
  const quantityHundredths = parseDecimalToHundredths(input, 'Quantity');
  if (quantityHundredths < 1 || quantityHundredths > MAX_QUANTITY_HUNDREDTHS) {
    throw new BasketValidationError(`Quantity must be between 0.01 and ${MAX_QUANTITY_HUNDREDTHS / 100}.`);
  }
  return quantityHundredths;
}

export function parseName(input: string): string {
  const name = input.trim();
  if (name.length < 1 || name.length > 80) {
    throw new BasketValidationError('Name must be between 1 and 80 characters.');
  }
  return name;
}

export function parseUnitSize(input: string | undefined): string | undefined {
  if (input === undefined || input === '') {
    return undefined;
  }

  const unitSize = input.trim();
  if (unitSize.length < 1 || unitSize.length > 30) {
    throw new BasketValidationError('Unit size must be between 1 and 30 characters.');
  }
  return unitSize;
}

export function calculateLineTotalMinor(quantityHundredths: number, unitPriceMinor: number): number {
  if (!Number.isSafeInteger(quantityHundredths) || quantityHundredths < 1 || quantityHundredths > MAX_QUANTITY_HUNDREDTHS) {
    throw new BasketValidationError('Quantity must be a valid positive number of hundredths.');
  }
  assertPositiveMoney(unitPriceMinor, 'Unit price');

  const product = quantityHundredths * unitPriceMinor;
  assertSafeInteger(product, 'Line total intermediate');
  const lineTotal = Math.round(product / 100);
  assertSafeInteger(lineTotal, 'Line total');
  return lineTotal;
}

export function validateBasketItem(item: BasketItem, sessionCurrency?: SupportedCurrency): void {
  if (!UUID.test(item.id)) {
    throw new BasketValidationError('Item ID must be a UUID.');
  }
  if (item.name !== parseName(item.name)) {
    throw new BasketValidationError('Item name must be trimmed.');
  }
  if (item.unitSize !== undefined && item.unitSize !== parseUnitSize(item.unitSize)) {
    throw new BasketValidationError('Unit size must be trimmed.');
  }
  assertSupportedCurrency(item.currency);
  if (sessionCurrency !== undefined && item.currency !== sessionCurrency) {
    throw new BasketValidationError('Basket items must use the session currency.');
  }
  if (!['essential', 'flexible', 'optional'].includes(item.priority)) {
    throw new BasketValidationError('Invalid item priority.');
  }
  if (!['needs-confirmation', 'confirmed', 'unmatched'].includes(item.matchStatus)) {
    throw new BasketValidationError('Invalid match status.');
  }
  if (item.matchStatus === 'confirmed' && (!item.catalogueId || !item.confirmedPackageSignature)) {
    throw new BasketValidationError('Confirmed items require a catalogue and package confirmation.');
  }
  calculateLineTotalMinor(item.quantityHundredths, item.unitPriceMinor);
}

export function calculateBasketTotalMinor(items: BasketItem[]): number {
  let total = 0;
  let currency: SupportedCurrency | undefined;
  const itemIds = new Set<string>();

  if (items.length > MAX_BASKET_ITEMS) {
    throw new BasketValidationError(`A basket can contain at most ${MAX_BASKET_ITEMS} items.`);
  }

  for (const item of items) {
    if (itemIds.has(item.id)) {
      throw new BasketValidationError('Basket item IDs must be unique.');
    }
    itemIds.add(item.id);
    validateBasketItem(item, currency);
    currency ??= item.currency;
    const lineTotal = calculateLineTotalMinor(item.quantityHundredths, item.unitPriceMinor);
    const nextTotal = total + lineTotal;
    assertSafeInteger(nextTotal, 'Basket total');
    total = nextTotal;
  }

  return total;
}

export function calculateOverspendMinor(totalMinor: number, budgetMinor: number): number {
  assertNonNegativeMinor(totalMinor, 'Total');
  assertPositiveMoney(budgetMinor, 'Budget');
  return totalMinor > budgetMinor ? totalMinor - budgetMinor : 0;
}

export function calculateRemainingMinor(totalMinor: number, budgetMinor: number): number {
  assertNonNegativeMinor(totalMinor, 'Total');
  assertPositiveMoney(budgetMinor, 'Budget');
  return totalMinor < budgetMinor ? budgetMinor - totalMinor : 0;
}

export function formatCurrency(minorAmount: number, currency: SupportedCurrency): string {
  assertSupportedCurrency(currency);
  assertNonNegativeMinor(minorAmount, 'Currency amount');
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minorAmount / 100);
}

export function createBasketState(currency: SupportedCurrency, budgetMinor: number): BasketState {
  assertSupportedCurrency(currency);
  assertPositiveMoney(budgetMinor, 'Budget');
  return {
    currency,
    budgetMinor,
    items: [],
    basketRevision: 0,
    accumulatedSavingsMinor: 0,
  };
}

function validateBasketState(state: BasketState): void {
  assertSupportedCurrency(state.currency);
  assertPositiveMoney(state.budgetMinor, 'Budget');
  if (!Number.isSafeInteger(state.basketRevision) || state.basketRevision < 0) {
    throw new BasketValidationError('Basket revision must be a non-negative safe integer.');
  }
  if (!Number.isSafeInteger(state.accumulatedSavingsMinor) || state.accumulatedSavingsMinor < 0) {
    throw new BasketValidationError('Accumulated savings must be a non-negative safe integer.');
  }
  for (const item of state.items) {
    validateBasketItem(item, state.currency);
  }
  calculateBasketTotalMinor(state.items);
}

function withRevisedItems(state: BasketState, items: BasketItem[], budgetMinor = state.budgetMinor): BasketState {
  return {
    ...state,
    budgetMinor,
    items: [...items],
    basketRevision: state.basketRevision + 1,
  };
}

export function addBasketItem(state: BasketState, item: BasketItem): BasketState {
  validateBasketState(state);
  if (state.items.length >= MAX_BASKET_ITEMS) {
    throw new BasketValidationError(`A basket can contain at most ${MAX_BASKET_ITEMS} items.`);
  }
  if (state.items.some((existingItem) => existingItem.id === item.id)) {
    throw new BasketValidationError('Basket item IDs must be unique.');
  }
  validateBasketItem(item, state.currency);
  return withRevisedItems(state, [...state.items, item]);
}

export function applyManualBasketEdit(state: BasketState, items: BasketItem[], budgetMinor = state.budgetMinor): BasketState {
  validateBasketState(state);
  assertPositiveMoney(budgetMinor, 'Budget');
  for (const item of items) {
    validateBasketItem(item, state.currency);
  }
  calculateBasketTotalMinor(items);
  return withRevisedItems(state, items, budgetMinor);
}

export function applyAcceptedBasketChange(state: BasketState, items: BasketItem[]): BasketState {
  validateBasketState(state);
  const totalBeforeAccept = calculateBasketTotalMinor(state.items);
  const updatedState = applyManualBasketEdit(state, items);
  const totalAfterAccept = calculateBasketTotalMinor(updatedState.items);
  const realizedSaving = totalBeforeAccept - totalAfterAccept;

  if (realizedSaving <= 0) {
    throw new BasketValidationError('Accepted changes must reduce the basket total.');
  }

  const accumulatedSavingsMinor = state.accumulatedSavingsMinor + realizedSaving;
  assertSafeInteger(accumulatedSavingsMinor, 'Accumulated savings');
  return { ...updatedState, accumulatedSavingsMinor };
}
