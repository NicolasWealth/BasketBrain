// BasketBrain demo fix. Run once from the project root:  node apply-demo-fix.mjs
// Edits 4 files in place. Safe to re-run: it stops if a change is already applied.
import fs from 'node:fs';

function edit(file, fn) {
  const raw = fs.readFileSync(file, 'utf8');
  const crlf = raw.includes('\r\n');
  const out = fn(raw.replace(/\r\n/g, '\n'));
  fs.writeFileSync(file, crlf ? out.replace(/\n/g, '\r\n') : out);
  console.log('updated', file);
}
function must(text, find, label) {
  if (!text.includes(find)) { console.error(`STOP: could not find ${label} (already applied or file changed).`); process.exit(1); }
}

// 1. Nigerian naira prices were 100x too small (milk showed as N22.50).
edit('src/data/catalogue.json', (t) => {
  if (!/"NGN"\s*:\s*2250\b/.test(t)) { console.error('STOP: could not find old NGN prices (already applied or file changed).'); process.exit(1); }
  return t.replace(/("NGN"\s*:\s*)(\d+)/g, (_m, key, n) => `${key}${Number(n) * 100}`);
});

// 2. New sample basket: 4 savings opportunities, 2 essentials, 1 unmatched item.
edit('src/lib/catalogue.ts', (t) => {
  const start = t.indexOf('const SAMPLE_ITEMS = [');
  must(t, 'const SAMPLE_ITEMS = [', 'SAMPLE_ITEMS');
  const end = t.indexOf('];', start) + 2;
  const block = `const SAMPLE_ITEMS = [
  { id: '45c9b9b7-a337-44a8-b5b4-27a0fd72a001', name: 'Basmati rice', productId: 'rice-basmati-1kg', quantityHundredths: 100, unitSize: '1 kg', priority: 'flexible' as const },
  { id: '45c9b9b7-a337-44a8-b5b4-27a0fd72a002', name: 'Free range eggs', productId: 'eggs-free-range-12', quantityHundredths: 100, unitSize: '12 eggs', priority: 'flexible' as const },
  { id: '45c9b9b7-a337-44a8-b5b4-27a0fd72a003', name: 'Greek yoghurt', productId: 'yoghurt-greek-500g', quantityHundredths: 100, unitSize: '500 g', priority: 'flexible' as const },
  { id: '45c9b9b7-a337-44a8-b5b4-27a0fd72a004', name: 'Wholemeal bread', productId: 'bread-wholemeal-800g', quantityHundredths: 100, unitSize: '800 g', priority: 'essential' as const },
  { id: '45c9b9b7-a337-44a8-b5b4-27a0fd72a005', name: 'Whole milk', productId: 'milk-whole-1l', quantityHundredths: 100, unitSize: '1 litre', priority: 'essential' as const },
  { id: '45c9b9b7-a337-44a8-b5b4-27a0fd72a006', name: 'Penne pasta', productId: 'pasta-penne-500g', quantityHundredths: 200, unitSize: '500 g', priority: 'flexible' as const },
  { id: '45c9b9b7-a337-44a8-b5b4-27a0fd72a007', name: 'Plantain', quantityHundredths: 100, priority: 'optional' as const, illustrativePrices: { GBP: 150, USD: 199, EUR: 175, NGN: 240000 } },
];`;
  return t.slice(0, start) + block + t.slice(end);
});

// 3. Landing page + plan highlight on the basket screen.
edit('src/app/page.tsx', (t) => {
  const old = "{ GBP: '4.00', USD: '5.50', EUR: '5.00', NGN: '7500' }";
  must(t, old, 'old sample budgets');
  return t.replace(old, "{ GBP: '11.00', USD: '16.00', EUR: '14.50', NGN: '19000' }");
});
edit('src/app/basket/page.tsx', (t) => {
  const a = '  const remainingShortfallMinor = Math.max(0, overspend - calculateBestAvailableSavingMinor(evaluated));\n';
  must(t, a, 'shortfall line');
  t = t.replace(a, a + "  const planned = budgetSearch.status === 'solution-found' || budgetSearch.status === 'search-limit-reached' ? budgetSearch.solution : [];\n  const plannedIds = new Set(planned.map((entry) => entry.candidate.candidateId));\n  const plannedSavingMinor = planned.reduce((sum, entry) => sum + entry.savingMinor, 0);\n");
  const b = '<p role="status">A plan using the fewest changes can meet your budget.</p>';
  must(t, b, 'plan sentence');
  t = t.replace(b, '<p role="status"><strong>Fastest route to your budget:</strong> {planned.length} {planned.length === 1 ? \'change\' : \'changes\'} marked &ldquo;In your plan&rdquo; below would lower your total to {formatCurrency(total - plannedSavingMinor, state.currency)}, within your {formatCurrency(state.budgetMinor, state.currency)} budget.</p>');
  const c = '<p>{recommendationStatus(recommendation.status)}</p>';
  must(t, c, 'status line');
  return t.replace(c, "{plannedIds.has(recommendation.id) && recommendation.status === 'pending' && <p><strong>In your plan</strong></p>}\n            " + c);
});

// 4. Update the old sample-basket test (4 items / 3 confirmed -> 7 items / 6 confirmed).
edit('src/__tests__/catalogue.test.ts', (t) => {
  must(t, "filter((sampleItem) => sampleItem.matchStatus === 'confirmed')).toHaveLength(3)", 'old test count');
  return t.replace('expect(items).toHaveLength(4);', 'expect(items).toHaveLength(7);')
          .replace("filter((sampleItem) => sampleItem.matchStatus === 'confirmed')).toHaveLength(3)", "filter((sampleItem) => sampleItem.matchStatus === 'confirmed')).toHaveLength(6)")
          .replace("filter((sampleItem) => sampleItem.catalogueId && sampleItem.confirmedPackageSignature)).toHaveLength(3)", "filter((sampleItem) => sampleItem.catalogueId && sampleItem.confirmedPackageSignature)).toHaveLength(6)");
});
console.log('\nDone. Now run: npm test   then: npm run build');
