'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  addBasketItem,
  applyAcceptedBasketChange,
  applyManualBasketEdit,
  BasketItem,
  calculateBasketTotalMinor,
  calculateOverspendMinor,
  formatCurrency,
  parseMoneyToMinor,
  parseQuantityToHundredths,
} from '../../lib/basket';
import {
  applyMatchResult,
  catalogue,
  CatalogueProduct,
  confirmCatalogueMatch,
  editBasketItemName,
  editBasketItemUnitSize,
  forceConfirmCatalogueMatch,
  formatPackage,
  matchCatalogueItem,
} from '../../lib/catalogue';
import {
  applyRecommendationToItems,
  buildRecommendationCard,
  describeSavingsAvailability,
  findBudgetSolution,
  generateCandidates,
  isCurrentRecommendationRequest,
  revalidateRecommendation,
} from '../../lib/recommendations';
import { useSession } from '../SessionProvider';

interface ItemEditState {
  name: string;
  quantity: string;
  price: string;
  unitSize: string;
  priority: BasketItem['priority'];
  savedAt?: number;
}

function editStateFor(item: BasketItem): ItemEditState {
  return {
    name: item.name,
    quantity: (item.quantityHundredths / 100).toString(),
    price: (item.unitPriceMinor / 100).toFixed(2),
    unitSize: item.unitSize ?? '',
    priority: item.priority,
  };
}

function itemStatus(item: BasketItem): string {
  if (item.matchStatus === 'confirmed') return 'Ready for savings ideas';
  if (item.matchStatus === 'needs-confirmation') return 'Needs a product check';
  return 'Price included; savings ideas unavailable for this grocery';
}

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
  const [searchedCandidateCount, setSearchedCandidateCount] = useState<number | undefined>();
  const [editStates, setEditStates] = useState<Record<string, ItemEditState>>({});
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  useEffect(() => { if (!session) router.replace('/'); }, [router, session]);
  useEffect(() => { latestRevision.current = session?.basketRevision ?? -1; }, [session?.basketRevision]);
  useEffect(() => {
    if (!session) return;
    setEditStates((previous) => Object.fromEntries(session.items.map((item) => [item.id, previous[item.id] ?? editStateFor(item)])));
  }, [session?.items]);

  if (!session) return null;

  const state = session;
  const total = calculateBasketTotalMinor(state.items);
  const overspend = calculateOverspendMinor(total, state.budgetMinor);
  const savingsAvailability = describeSavingsAvailability(state.items, state.currency);
  const activeCandidateCount = generateCandidates(state.items, state.currency).filter((candidate) => !state.rejected.includes(candidate.candidateId)).length;
  const evaluated = state.recommendations
    .filter((recommendation) => recommendation.status === 'pending' && !state.rejected.includes(recommendation.id) && revalidateRecommendation(recommendation, state.items, state.currency) === 'valid')
    .map((recommendation) => ({ candidate: recommendation, proposedItems: state.items, savingMinor: recommendation.savingMinor }));
  const budgetSearch = findBudgetSolution(state.items, state.budgetMinor, evaluated);

  function saveManual(items: BasketItem[]) {
    setSearchedCandidateCount(undefined);
    const updated = applyManualBasketEdit(state, items);
    activeRequest.current = '';
    latestRevision.current = updated.basketRevision;
    setLoading(false);
    dispatch({ type: 'replace', state: updated });
  }

  function updateEdit(itemId: string, field: keyof ItemEditState, value: string) {
    setEditStates((previous) => ({ ...previous, [itemId]: { ...previous[itemId], [field]: value } }));
  }

  function add(event: FormEvent) {
    event.preventDefault();
    setStatus('');
    try {
      const item = applyMatchResult({ id: crypto.randomUUID(), name: name.trim(), quantityHundredths: parseQuantityToHundredths(quantity), unitPriceMinor: parseMoneyToMinor(price, state.currency), currency: state.currency, priority: 'flexible', matchStatus: 'unmatched' }, matchCatalogueItem(name, state.currency));
      saveManual(addBasketItem(state, item).items);
      setName('');
      setPrice('');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Check the grocery details.');
    }
  }

  function save(item: BasketItem, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = editStates[item.id];
    if (!fields) return;
    setEditErrors((previous) => ({ ...previous, [item.id]: '' }));
    try {
      const namedItem = editBasketItemName(item, fields.name);
      const updated = editBasketItemUnitSize({ ...namedItem, quantityHundredths: parseQuantityToHundredths(fields.quantity), unitPriceMinor: parseMoneyToMinor(fields.price, state.currency), priority: fields.priority }, fields.unitSize || undefined);
      saveManual(state.items.map((entry) => entry.id === item.id ? updated : entry));
      setEditStates((previous) => ({ ...previous, [item.id]: { ...editStateFor(updated), savedAt: Date.now() } }));
    } catch (error) {
      setEditErrors((previous) => ({ ...previous, [item.id]: error instanceof Error ? error.message : 'Check the grocery details.' }));
    }
  }

  function confirmProduct(item: BasketItem, product: CatalogueProduct) {
    try {
      let confirmed: BasketItem;
      try { confirmed = confirmCatalogueMatch(item, product); } catch { confirmed = forceConfirmCatalogueMatch(item, product); }
      saveManual(state.items.map((entry) => entry.id === item.id ? confirmed : entry));
      setEditStates((previous) => ({ ...previous, [item.id]: editStateFor(confirmed) }));
    } catch (error) {
      setEditErrors((previous) => ({ ...previous, [item.id]: error instanceof Error ? error.message : 'Could not confirm this product.' }));
    }
  }

  async function recommend() {
    const requestId = crypto.randomUUID();
    const revision = state.basketRevision;
    activeRequest.current = requestId;
    setLoading(true);
    setStatus('');
    const candidates = generateCandidates(state.items, state.currency).filter((candidate) => !state.rejected.includes(candidate.candidateId));
    setSearchedCandidateCount(candidates.length);
    let texts = new Map<string, { candidateId: string; reason?: string; tradeOffs?: string }>();
    try {
      const response = await fetch('/api/recommendations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requestId, basketRevision: revision, budgetMinor: state.budgetMinor, currency: state.currency, items: state.items }) });
      if (!isCurrentRecommendationRequest(activeRequest.current, latestRevision.current, requestId, revision)) return;
      if (response.ok) {
        const body = await response.json() as { requestId: string; basketRevision: number; proposals: Array<{ candidateId: string; reason?: string; tradeOffs?: string }> };
        if (body.requestId === requestId && body.basketRevision === revision) texts = new Map(body.proposals.map((proposal) => [proposal.candidateId, proposal]));
      } else {
        setStatus(response.status === 429 ? 'Too many requests; showing app-written savings explanations instead.' : 'AI-written explanations are unavailable; showing app-written savings explanations instead.');
      }
    } catch {
      setStatus('AI-written explanations are unavailable; showing app-written savings explanations instead.');
    } finally {
      if (activeRequest.current === requestId) setLoading(false);
    }
    if (!isCurrentRecommendationRequest(activeRequest.current, latestRevision.current, requestId, revision)) return;
    dispatch({ type: 'recommendations', recommendations: candidates.map((candidate) => buildRecommendationCard(candidate, state.items, state.currency, revision, texts.get(candidate.candidateId))).filter((card): card is NonNullable<typeof card> => !!card) });
  }

  function accept(id: string) {
    const recommendation = state.recommendations.find((entry) => entry.id === id);
    if (!recommendation || revalidateRecommendation(recommendation, state.items, state.currency) !== 'valid') return;
    const updated = applyAcceptedBasketChange(state, applyRecommendationToItems(recommendation, state.items));
    activeRequest.current = '';
    latestRevision.current = updated.basketRevision;
    setLoading(false);
    dispatch({ type: 'replace', state: updated, recommendations: state.recommendations.map((entry) => entry.id === id ? { ...entry, status: 'accepted' } : revalidateRecommendation(entry, updated.items, state.currency) === 'valid' ? entry : { ...entry, status: 'needs-review' }) });
    const changedItem = updated.items.find((item) => item.id === recommendation.basketItemId);
    if (changedItem) setEditStates((previous) => ({ ...previous, [changedItem.id]: editStateFor(changedItem) }));
  }

  return (
    <main>
      <header>
        <b>BasketBrain</b>
        <button onClick={() => router.push('/')}>Start over</button>
      </header>
      {state.sample && <p className="notice">Sample prices are illustrative, not current store prices.</p>}
      <section className="summary">
        Budget {formatCurrency(state.budgetMinor, state.currency)} &middot; Total {formatCurrency(total, state.currency)} &middot; {overspend ? `Over by ${formatCurrency(overspend, state.currency)}` : `Within budget; saved ${formatCurrency(state.accumulatedSavingsMinor, state.currency)}`}
      </section>
      <section className="card">
        <h1>Your grocery basket</h1>
        <p>Enter the prices you actually paid. Savings ideas use illustrative replacement prices, not live store prices.</p>
        <form onSubmit={add}>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Grocery name" aria-label="Grocery name" />
          <input value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="Quantity" aria-label="Quantity" inputMode="decimal" />
          <input value={price} onChange={(event) => setPrice(event.target.value)} placeholder="Price paid" aria-label="Price paid" inputMode="decimal" />
          <button>Add grocery</button>
        </form>
        <ul>
          {state.items.map((item) => {
            const fields = editStates[item.id] ?? editStateFor(item);
            const pendingProduct = item.pendingMatchId ? catalogue.find((product) => product.id === item.pendingMatchId) : undefined;
            const choices = item.ambiguousCandidateIds?.map((id) => catalogue.find((product) => product.id === id)).filter((product): product is CatalogueProduct => !!product) ?? [];

            return (
              <li key={item.id}>
                <form onSubmit={(event) => save(item, event)}>
                  <input value={fields.name} onChange={(event) => updateEdit(item.id, 'name', event.target.value)} aria-label={`${item.id}-name`} />
                  <input value={fields.quantity} onChange={(event) => updateEdit(item.id, 'quantity', event.target.value)} aria-label={`${item.id}-quantity`} inputMode="decimal" />
                  <input value={fields.price} onChange={(event) => updateEdit(item.id, 'price', event.target.value)} aria-label={`${item.id}-price`} inputMode="decimal" />
                  <input value={fields.unitSize} onChange={(event) => updateEdit(item.id, 'unitSize', event.target.value)} placeholder="Package label" aria-label={`${item.id}-package`} />
                  <select value={fields.priority} onChange={(event) => updateEdit(item.id, 'priority', event.target.value)} aria-label={`${item.id}-priority`}>
                    <option value="essential">Essential</option>
                    <option value="flexible">Flexible</option>
                    <option value="optional">Optional</option>
                  </select>
                  <button type="submit">Save item</button>
                  <button type="button" onClick={() => saveManual(state.items.filter((entry) => entry.id !== item.id))}>Remove</button>
                  {editStates[item.id]?.savedAt && Date.now() - editStates[item.id].savedAt! < 3000 && <span aria-live="polite">Saved</span>}
                  {editErrors[item.id] && <span role="alert">{editErrors[item.id]}</span>}
                  {item.matchStatus === 'needs-confirmation' && pendingProduct && choices.length < 2 && <span>We found {formatPackage(pendingProduct)}. Is your price for this package? <button type="button" onClick={() => confirmProduct(item, pendingProduct)}>Yes, this is my product</button></span>}
                  {item.matchStatus === 'needs-confirmation' && choices.length > 1 && <span>Which product and package is your price for? {choices.map((product) => <button key={product.id} type="button" onClick={() => confirmProduct(item, product)}>{formatPackage(product)}</button>)}</span>}
                  <em>{itemStatus(item)}</em>
                </form>
              </li>
            );
          })}
        </ul>
        {overspend > 0 && savingsAvailability.kind === 'suggestions-ready' && activeCandidateCount > 0 && <p role="status">You are over budget. Find savings ideas to compare the confirmed groceries in your basket.</p>}
        {overspend > 0 && savingsAvailability.kind !== 'suggestions-ready' && <p role="status">{savingsAvailability.message}</p>}
        {overspend > 0 && savingsAvailability.kind === 'suggestions-ready' && activeCandidateCount === 0 && <p role="status">You have dismissed the available savings ideas for this basket. Start a new basket to see them again.</p>}
        {overspend > 0 && <button onClick={recommend} disabled={loading}>{loading ? 'Finding savings ideas' : 'Find ways to save'}</button>}
      </section>
      {status && <p role="status">{status}</p>}
      {budgetSearch.status === 'already-within-budget' && <p role="status">Your basket is within budget.</p>}
      {overspend > 0 && searchedCandidateCount !== undefined && searchedCandidateCount > 0 && budgetSearch.status === 'solution-found' && <p role="status">A plan using the fewest changes can meet your budget.</p>}
      {overspend > 0 && searchedCandidateCount !== undefined && searchedCandidateCount > 0 && budgetSearch.status === 'no-solution-among-evaluated-candidates' && <p role="status">The available changes still do not bring this basket within budget.</p>}
      {overspend > 0 && searchedCandidateCount !== undefined && searchedCandidateCount > 0 && budgetSearch.status === 'search-limit-reached' && <p role="status">A possible plan was found, but it may not use the fewest changes.</p>}
      <section className="card">
        {state.recommendations.map((recommendation) => (
          <article key={recommendation.id}>
            <b>{recommendation.proposedName}</b>
            <p>Save {formatCurrency(recommendation.savingMinor, state.currency)}. {recommendation.reason}</p>
            <p>{recommendation.tradeOffs}</p>
            <p>{recommendation.status}</p>
            {recommendation.status === 'pending' && <><button onClick={() => accept(recommendation.id)}>Accept change</button><button onClick={() => dispatch({ type: 'reject', id: recommendation.id })}>Reject</button></>}
          </article>
        ))}
      </section>
    </main>
  );
}
