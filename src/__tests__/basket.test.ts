import {
  addBasketItem,
  applyAcceptedBasketChange,
  applyManualBasketEdit,
  BasketItem,
  BasketValidationError,
  calculateBasketTotalMinor,
  calculateLineTotalMinor,
  calculateOverspendMinor,
  calculateRemainingMinor,
  createBasketState,
  formatCurrency,
  MAX_MONEY_MINOR,
  MAX_QUANTITY_HUNDREDTHS,
  parseName,
  parseMoneyToMinor,
  parseQuantityToHundredths,
  parseUnitSize,
} from '../lib/basket';

const milk: BasketItem = {
  id: '123e4567-e89b-42d3-a456-426614174000',
  name: 'Milk',
  quantityHundredths: 250,
  unitSize: '1 l',
  unitPriceMinor: 199,
  currency: 'GBP',
  priority: 'flexible',
  matchStatus: 'unmatched',
};

const bread: BasketItem = {
  id: '123e4567-e89b-42d3-a456-426614174001',
  name: 'Bread',
  quantityHundredths: 100,
  unitPriceMinor: 150,
  currency: 'GBP',
  priority: 'essential',
  matchStatus: 'unmatched',
};

describe('money parsing', () => {
  it.each([
    ['0.01', 1],
    ['12', 1200],
    ['12.3', 1230],
    ['9999999.99', MAX_MONEY_MINOR],
  ])('parses %s into integer minor units', (input, expected) => {
    expect(parseMoneyToMinor(input, 'GBP')).toBe(expected);
  });

  it.each(['00.10', '01', '.50', '1.', '1.234', '-1', '+1', '1e2', ' 1', '1 ', '1,000', 'NaN', 'Infinity', '0'])(
    'rejects invalid money input %s',
    (input) => {
      expect(() => parseMoneyToMinor(input, 'GBP')).toThrow(BasketValidationError);
    },
  );

  it('rejects values above the configured safe money bound', () => {
    expect(() => parseMoneyToMinor('10000000', 'GBP')).toThrow(BasketValidationError);
  });

  it('allows the four supported currencies only', () => {
    expect(parseMoneyToMinor('1.25', 'USD')).toBe(125);
    expect(parseMoneyToMinor('1.25', 'EUR')).toBe(125);
    expect(parseMoneyToMinor('1.25', 'NGN')).toBe(125);
    expect(() => parseMoneyToMinor('1', 'JPY' as never)).toThrow(BasketValidationError);
  });
});

describe('quantity parsing', () => {
  it('parses the supported inclusive quantity bounds', () => {
    expect(parseQuantityToHundredths('0.01')).toBe(1);
    expect(parseQuantityToHundredths('9999.99')).toBe(999_999);
  });

  it.each(['0', '0.00', '-1', '1.234', '10000', '1e2', ' 1', '1,5'])('rejects invalid quantity %s', (input) => {
    expect(() => parseQuantityToHundredths(input)).toThrow(BasketValidationError);
  });

  it('rejects safe-integer overflow before converting to state', () => {
    expect(() => parseQuantityToHundredths('9007199254740992')).toThrow(BasketValidationError);
  });
});

describe('item field validation', () => {
  it('trims valid names and unit labels', () => {
    expect(parseName(' Milk ')).toBe('Milk');
    expect(parseUnitSize(' 1 litre ')).toBe('1 litre');
    expect(parseUnitSize(undefined)).toBeUndefined();
  });

  it('rejects names and unit labels outside their bounds', () => {
    expect(() => parseName('   ')).toThrow(BasketValidationError);
    expect(() => parseName('a'.repeat(81))).toThrow(BasketValidationError);
    expect(() => parseUnitSize('   ')).toThrow(BasketValidationError);
    expect(() => parseUnitSize('a'.repeat(31))).toThrow(BasketValidationError);
  });
});

describe('financial arithmetic', () => {
  it('calculates derived line and basket totals with integer arithmetic', () => {
    expect(calculateLineTotalMinor(250, 199)).toBe(498);
    expect(calculateBasketTotalMinor([milk, bread])).toBe(648);
  });

  it('rounds half minor units up', () => {
    expect(calculateLineTotalMinor(50, 1)).toBe(1);
  });

  it('calculates at the maximum permitted quantity and unit price', () => {
    expect(calculateLineTotalMinor(MAX_QUANTITY_HUNDREDTHS, MAX_MONEY_MINOR)).toBe(
      Math.round((MAX_QUANTITY_HUNDREDTHS * MAX_MONEY_MINOR) / 100),
    );
  });

  it('rejects values that would overflow safe arithmetic before calculating a line', () => {
    expect(() => calculateLineTotalMinor(999_999, Number.MAX_SAFE_INTEGER)).toThrow(BasketValidationError);
    expect(() => calculateBasketTotalMinor([{ ...milk, unitPriceMinor: Number.MAX_SAFE_INTEGER }])).toThrow(BasketValidationError);
  });

  it('calculates remaining budget and overspend without negative values', () => {
    expect(calculateRemainingMinor(648, 1000)).toBe(352);
    expect(calculateOverspendMinor(648, 1000)).toBe(0);
    expect(calculateRemainingMinor(1200, 1000)).toBe(0);
    expect(calculateOverspendMinor(1200, 1000)).toBe(200);
    expect(() => calculateRemainingMinor(-1, 1000)).toThrow(BasketValidationError);
  });

  it('formats amounts using the selected currency', () => {
    expect(formatCurrency(12345, 'GBP')).toBe('£123.45');
    expect(formatCurrency(12345, 'NGN')).toContain('123.45');
  });
});

describe('basket state transitions', () => {
  it('blocks adding a thirty-first item before it enters session state', () => {
    const state = createBasketState('GBP', 100_000);
    const items = Array.from({ length: 30 }, (_, index) => ({
      ...milk,
      id: `123e4567-e89b-42d3-a456-${String(426614174000 + index).padStart(12, '0')}`,
    }));
    const fullState = applyManualBasketEdit(state, items);
    expect(() => addBasketItem(fullState, { ...milk, id: '123e4567-e89b-42d3-a456-426614174999' })).toThrow(BasketValidationError);
  });

  it('rejects mixed currencies without conversion', () => {
    expect(() => calculateBasketTotalMinor([milk, { ...bread, currency: 'USD' }])).toThrow(BasketValidationError);
  });

  it('adds realized accepted-change savings and drops the total by that exact amount', () => {
    const state = applyManualBasketEdit(createBasketState('GBP', 10_000), [milk, bread]);
    const substitutedMilk = { ...milk, name: 'Value milk', unitPriceMinor: 99 };
    const nextState = applyAcceptedBasketChange(state, [substitutedMilk, bread]);

    expect(calculateBasketTotalMinor(state.items) - calculateBasketTotalMinor(nextState.items)).toBe(250);
    expect(nextState.accumulatedSavingsMinor).toBe(250);
    expect(nextState.basketRevision).toBe(state.basketRevision + 1);
  });

  it('does not change accumulated savings for a manual edit', () => {
    const state = applyAcceptedBasketChange(
      applyManualBasketEdit(createBasketState('GBP', 10_000), [milk]),
      [{ ...milk, unitPriceMinor: 99 }],
    );
    const editedState = applyManualBasketEdit(state, [{ ...state.items[0], quantityHundredths: 100 }], 9_000);

    expect(editedState.accumulatedSavingsMinor).toBe(state.accumulatedSavingsMinor);
    expect(editedState.budgetMinor).toBe(9_000);
  });
});
