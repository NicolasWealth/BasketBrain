'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addBasketItem, applyAcceptedBasketChange, applyManualBasketEdit, calculateBasketTotalMinor, calculateOverspendMinor, formatCurrency, parseMoneyToMinor, parseQuantityToHundredths } from '../../lib/basket';
import { applyMatchResult, catalogue, confirmCatalogueMatch, editBasketItemName, editBasketItemUnitSize, formatPackage, matchCatalogueItem } from '../../lib/catalogue';
import { buildRecommendationCard, findBudgetSolution, generateCandidates, revalidateRecommendation } from '../../lib/recommendations';
import { useSession } from '../SessionProvider';

export default function BasketPage() {
  const { state: session, dispatch } = useSession();
  const router = useRouter();
  const activeRequest = useRef('');
  const latestRevision = useRef(-1);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [price, setPrice] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => { if (!session) router.replace('/'); }, [router, session]);
  useEffect(() => { latestRevision.current = session?.basketRevision ?? -1; }, [session?.basketRevision]);
  if (!session) return null;
  const state = session;
  const total = calculateBasketTotalMinor(state.items);
  const overspend = calculateOverspendMinor(total, state.budgetMinor);
  const evaluated = state.recommendations
    .filter((recommendation) => recommendation.status === 'pending' && !state.rejected.includes(recommendation.id) && revalidateRecommendation(recommendation, state.items, state.currency) === 'valid')
    .map((recommendation) => ({ candidate: recommendation, proposedItems: state.items, savingMinor: recommendation.savingMinor }));
  const budgetSearch = findBudgetSolution(state.items, state.budgetMinor, evaluated);
  const saveManual = (items: typeof state.items) => dispatch({ type: 'replace', state: applyManualBasketEdit(state, items) });

  function add(event: FormEvent) {
    event.preventDefault();
    try {
      const item = applyMatchResult({ id: crypto.randomUUID(), name: name.trim(), quantityHundredths: parseQuantityToHundredths(quantity), unitPriceMinor: parseMoneyToMinor(price, state.currency), currency: state.currency, priority: 'flexible' as const, matchStatus: 'unmatched' as const }, matchCatalogueItem(name, state.currency));
      saveManual(addBasketItem(state, item).items); setName(''); setPrice('');
    } catch { setStatus('Check the item details.'); }
  }
  function edit(item: typeof state.items[number], event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const values = new FormData(event.currentTarget);
      const renamed = editBasketItemName(item, String(values.get('name') ?? ''));
      const updated = editBasketItemUnitSize({ ...renamed, quantityHundredths: parseQuantityToHundredths(String(values.get('quantity') ?? '')), unitPriceMinor: parseMoneyToMinor(String(values.get('price') ?? ''), state.currency), priority: String(values.get('priority')) as typeof item.priority }, String(values.get('unitSize') ?? ''));
      saveManual(state.items.map((entry) => entry.id === item.id ? updated : entry));
    } catch { setStatus('Check the item details.'); }
  }
  async function recommend() {
    const requestId = crypto.randomUUID(); const revision = state.basketRevision;
    activeRequest.current = requestId; setLoading(true); setStatus('');
    const candidates = generateCandidates(state.items, state.currency).filter((candidate) => !state.rejected.includes(candidate.candidateId));
    let texts = new Map<string, { candidateId: string; reason?: string; tradeOffs?: string }>();
    try {
      const response = await fetch('/api/recommendations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requestId, basketRevision: revision, budgetMinor: state.budgetMinor, currency: state.currency, items: state.items }) });
      if (activeRequest.current !== requestId || latestRevision.current !== revision) return;
      if (response.ok) {
        const body = await response.json() as { requestId: string; basketRevision: number; proposals: Array<{ candidateId: string; reason?: string; tradeOffs?: string }> };
        if (body.requestId === requestId && body.basketRevision === revision) texts = new Map(body.proposals.map((proposal) => [proposal.candidateId, proposal]));
      } else setStatus(response.status === 429 ? 'Too many requests; using app-written explanations.' : 'AI explanations are unavailable; using app-written explanations.');
    } catch { setStatus('AI explanations are unavailable; using app-written explanations.'); }
    finally { if (activeRequest.current === requestId) setLoading(false); }
    if (activeRequest.current !== requestId || latestRevision.current !== revision) return;
    dispatch({ type: 'recommendations', recommendations: candidates.map((candidate) => buildRecommendationCard(candidate, state.items, state.currency, revision, texts.get(candidate.candidateId))).filter((card): card is NonNullable<typeof card> => !!card) });
  }
  function accept(id: string) {
    const rec = state.recommendations.find((entry) => entry.id === id);
    if (!rec || revalidateRecommendation(rec, state.items, state.currency) !== 'valid') return;
    const item = state.items.find((entry) => entry.id === rec.basketItemId)!;
    const items = rec.type === 'removal' ? state.items.filter((entry) => entry.id !== item.id) : state.items.map((entry) => entry.id !== item.id ? entry : rec.type === 'substitution' ? { ...entry, name: rec.proposedName, unitPriceMinor: rec.proposedUnitPriceMinor, catalogueId: rec.proposedCatalogueId, confirmedPackageSignature: catalogue.find((product) => product.id === rec.proposedCatalogueId)?.packageSignature } : { ...entry, quantityHundredths: rec.proposedQuantityHundredths! });
    const updated = applyAcceptedBasketChange(state, items);
    dispatch({ type: 'replace', state: updated, recommendations: state.recommendations.map((entry) => entry.id === id ? { ...entry, status: 'accepted' as const } : revalidateRecommendation(entry, items, state.currency) === 'valid' ? entry : { ...entry, status: 'needs-review' as const }) });
  }
  return <main><header><b>BasketBrain</b><button onClick={() => router.push('/')}>New basket</button></header>
    {state.sample && <p className="notice">Illustrative sample prices — not current market prices.</p>}
    <section className="summary">Budget {formatCurrency(state.budgetMinor, state.currency)} · Total {formatCurrency(total, state.currency)} · {overspend ? `Over by ${formatCurrency(overspend, state.currency)}` : `Within budget; saved ${formatCurrency(state.accumulatedSavingsMinor, state.currency)}`}</section>
    <section className="card"><h1>Your basket</h1><form onSubmit={add}><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Item name" /><input value={quantity} onChange={(event) => setQuantity(event.target.value)} /><input value={price} onChange={(event) => setPrice(event.target.value)} placeholder="Unit price" /><button>Add item</button></form>
      <ul>{state.items.map((item) => <li key={item.id}><form onSubmit={(event) => edit(item, event)}><input name="name" defaultValue={item.name} aria-label={`${item.id}-name`} /><input name="quantity" defaultValue={(item.quantityHundredths / 100).toString()} aria-label={`${item.id}-quantity`} /><input name="price" defaultValue={(item.unitPriceMinor / 100).toFixed(2)} aria-label={`${item.id}-price`} /><input name="unitSize" defaultValue={item.unitSize ?? ''} placeholder="Package label" /><select name="priority" defaultValue={item.priority}><option value="essential">Essential</option><option value="flexible">Flexible</option><option value="optional">Optional</option></select><button>Save item</button><button type="button" onClick={() => saveManual(state.items.filter((entry) => entry.id !== item.id))}>Remove</button>{item.matchStatus === 'needs-confirmation' && <span> {formatPackage(catalogue.find((product) => product.id === item.pendingMatchId)!)} <button type="button" onClick={() => saveManual(state.items.map((entry) => entry.id === item.id ? confirmCatalogueMatch(entry, catalogue.find((product) => product.id === item.pendingMatchId)!) : entry))}>Confirm match</button></span>}<em>{item.matchStatus}</em></form></li>)}</ul>
      {overspend > 0 && <button onClick={recommend} disabled={loading}>{loading ? 'Finding ways to save' : 'Find ways to save'}</button>}</section>
    {status && <p role="status">{status}</p>}
    {budgetSearch.status === 'already-within-budget' && <p role="status">Your basket is within budget.</p>}
    {overspend > 0 && budgetSearch.status === 'solution-found' && <p role="status">A plan using the fewest changes can meet your budget.</p>}
    {overspend > 0 && budgetSearch.status === 'no-solution-among-evaluated-candidates' && <p role="status">No solution was found among the evaluated recommendations.</p>}
    {overspend > 0 && budgetSearch.status === 'search-limit-reached' && <p role="status">A possible plan was found, but it may not be the least disruptive.</p>}
    <section className="card">{state.recommendations.map((rec) => <article key={rec.id}><b>{rec.proposedName}</b><p>Save {formatCurrency(rec.savingMinor, state.currency)}. {rec.reason}</p><p>{rec.tradeOffs}</p><p>{rec.status}</p>{rec.status === 'pending' && <><button onClick={() => accept(rec.id)}>Accept change</button><button onClick={() => dispatch({ type: 'reject', id: rec.id })}>Reject</button></>}</article>)}</section>
  </main>;
}
