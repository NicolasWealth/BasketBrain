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
  findBudgetSolution,
  generateCandidates,
  isCurrentRecommendationRequest,
  revalidateRecommendation,
} from '../../lib/recommendations';
import { useSession } from '../SessionProvider';

// Per-item edit state (controlled form fields + save feedback)
interface ItemEditState {
  name: string;
  quantity: string;
  price: string;
  unitSize: string;
  priority: BasketItem['priority'];
  savedAt?: number; // timestamp of last successful save
}

function initEditState(item: BasketItem): ItemEditState {
  return {
    name: item.name,
    quantity: (item.quantityHundredths / 100).toString(),
    price: (item.unitPriceMinor / 100).toFixed(2),
    unitSize: item.unitSize ?? '',
    priority: item.priority,
  };
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
  // Per-item controlled form state: keyed by item id
  const [editStates, setEditStates] = useState<Record<string, ItemEditState>>({});
  // Per-item error state
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  useEffect(() => { if (!session) router.replace('/'); }, [router, session]);
  useEffect(() => { latestRevision.current = session?.basketRevision ?? -1; }, [session?.basketRevision]);

  // Sync controlled edit state when items change externally (add / accept recommendation / etc.)
  useEffect(() => {
    if (!session) return;
    setEditStates((prev) => {
      const next: Record<string, ItemEditState> = {};
      for (const item of session.items) {
        // Preserve unsaved edits unless the item was externally changed (catalogueId, price etc.)
        const existing = prev[item.id];
        if (existing) {
          next[item.id] = { ...existing, savedAt: prev[item.id]?.savedAt };
        } else {
          next[item.id] = initEditState(item);
        }
      }
      return next;
    });
  }, [session?.items]);

  if (!session) return null;
  const state = session;
  const total = calculateBasketTotalMinor(state.items);
  const overspend = calculateOverspendMinor(total, state.budgetMinor);
  const evaluated = state.recommendations
    .filter(
      (recommendation) =>
        recommendation.status === 'pending' &&
        !state.rejected.includes(recommendation.id) &&
        revalidateRecommendation(recommendation, state.items, state.currency) === 'valid',
    )
    .map((recommendation) => ({
      candidate: recommendation,
      proposedItems: state.items,
      savingMinor: recommendation.savingMinor,
    }));
  const budgetSearch = findBudgetSolution(state.items, state.budgetMinor, evaluated);

  const saveManual = (items: typeof state.items) => {
    setSearchedCandidateCount(undefined);
    dispatch({ type: 'replace', state: applyManualBasketEdit(state, items) });
  };

  function updateEditField(itemId: string, field: keyof ItemEditState, value: string) {
    setEditStates((prev) => ({ ...prev, [itemId]: { ...prev[itemId], [field]: value } }));
  }

  function add(event: FormEvent) {
    event.preventDefault();
    setStatus('');
    try {
      const item = applyMatchResult(
        {
          id: crypto.randomUUID(),
          name: name.trim(),
          quantityHundredths: parseQuantityToHundredths(quantity),
          unitPriceMinor: parseMoneyToMinor(price, state.currency),
          currency: state.currency,
          priority: 'flexible' as const,
          matchStatus: 'unmatched' as const,
        },
        matchCatalogueItem(name, state.currency),
      );
      saveManual(addBasketItem(state, item).items);
      setName('');
      setPrice('');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Check the item details.');
    }
  }

  function save(item: BasketItem, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = editStates[item.id];
    if (!fields) return;
    setEditErrors((prev) => ({ ...prev, [item.id]: '' }));
    try {
      const renamed = editBasketItemName(item, fields.name);
      const updated = editBasketItemUnitSize(
        { ...renamed, quantityHundredths: parseQuantityToHundredths(fields.quantity), unitPriceMinor: parseMoneyToMinor(fields.price, state.currency), priority: fields.priority as typeof item.priority },
        fields.unitSize || undefined,
      );
      saveManual(state.items.map((entry) => (entry.id === item.id ? updated : entry)));
      // Reset edit state to reflect what was saved (in case matching changed name etc.)
      setEditStates((prev) => ({ ...prev, [item.id]: { ...initEditState(updated), savedAt: Date.now() } }));
    } catch (err) {
      setEditErrors((prev) => ({ ...prev, [item.id]: err instanceof Error ? err.message : 'Check the item details.' }));
    }
  }

  function confirmMatch(item: BasketItem, product: CatalogueProduct) {
    try {
      const confirmed = confirmCatalogueMatch(item, product);
      const items = state.items.map((entry) => (entry.id === item.id ? confirmed : entry));
      saveManual(items);
      setEditStates((prev) => ({ ...prev, [item.id]: initEditState(confirmed) }));
    } catch {
      // Fallback: force-confirm (for ambiguous items the user manually selected)
      try {
        const confirmed = forceConfirmCatalogueMatch(item, product);
        const items = state.items.map((entry) => (entry.id === item.id ? confirmed : entry));
        saveManual(items);
        setEditStates((prev) => ({ ...prev, [item.id]: initEditState(confirmed) }));
      } catch (err) {
        setEditErrors((prev) => ({ ...prev, [item.id]: err instanceof Error ? err.message : 'Could not confirm match.' }));
      }
    }
  }

  async function recommend() {
    const requestId = crypto.randomUUID();
    const revision = state.basketRevision;
    activeRequest.current = requestId;
    setLoading(true);
    setStatus('');
    const candidates = generateCandidates(state.items, state.currency).filter(
      (candidate) => !state.rejected.includes(candidate.candidateId),
    );
    setSearchedCandidateCount(candidates.length);
    let texts = new Map<string, { candidateId: string; reason?: string; tradeOffs?: string }>();
    try {
      const response = await fetch('/api/recommendations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestId, basketRevision: revision, budgetMinor: state.budgetMinor, currency: state.currency, items: state.items }),
      });
      if (!isCurrentRecommendationRequest(activeRequest.current, latestRevision.current, requestId, revision)) return;
      if (response.ok) {
        const body = (await response.json()) as {
          requestId: string;
          basketRevision: number;
          proposals: Array<{ candidateId: string; reason?: string; tradeOffs?: string }>;
        };
        if (body.requestId === requestId && body.basketRevision === revision)
          texts = new Map(body.proposals.map((proposal) => [proposal.candidateId, proposal]));
      } else {
        setStatus(
          response.status === 429
            ? 'Too many requests; using app-written explanations.'
            : 'AI explanations are unavailable; using app-written explanations.',
        );
      }
    } catch {
      setStatus('AI explanations are unavailable; using app-written explanations.');
    } finally {
      if (activeRequest.current === requestId) setLoading(false);
    }
    if (!isCurrentRecommendationRequest(activeRequest.current, latestRevision.current, requestId, revision)) return;
    dispatch({
      type: 'recommendations',
      recommendations: candidates
        .map((candidate) =>
          buildRecommendationCard(candidate, state.items, state.currency, revision, texts.get(candidate.candidateId)),
        )
        .filter((card): card is NonNullable<typeof card> => !!card),
    });
  }

  function accept(id: string) {
    const rec = state.recommendations.find((entry) => entry.id === id);
    if (!rec || revalidateRecommendation(rec, state.items, state.currency) !== 'valid') return;
    const items = applyRecommendationToItems(rec, state.items);
    const updated = applyAcceptedBasketChange(state, items);
    dispatch({
      type: 'replace',
      state: updated,
      recommendations: state.recommendations.map((entry) =>
        entry.id === id
          ? { ...entry, status: 'accepted' as const }
          : revalidateRecommendation(entry, items, state.currency) === 'valid'
            ? entry
            : { ...entry, status: 'needs-review' as const },
      ),
    });
  }

  const confirmedCount = state.items.filter((i) => i.matchStatus === 'confirmed').length;
  const needsConfirmationCount = state.items.filter((i) => i.matchStatus === 'needs-confirmation').length;

  return (
    <main>
      <header>
        <b>BasketBrain</b>
        <button onClick={() => router.push('/')}>New basket</button>
      </header>
      {state.sample && <p className="notice">Illustrative sample prices — not current market prices.</p>}
      <section className="summary">
        Budget {formatCurrency(state.budgetMinor, state.currency)} · Total {formatCurrency(total, state.currency)} ·{' '}
        {overspend
          ? `Over by ${formatCurrency(overspend, state.currency)}`
          : `Within budget; saved ${formatCurrency(state.accumulatedSavingsMinor, state.currency)}`}
      </section>

      <section className="card">
        <h1>Your basket</h1>

        <form onSubmit={add}>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Item name" />
          <input value={quantity} onChange={(event) => setQuantity(event.target.value)} />
          <input value={price} onChange={(event) => setPrice(event.target.value)} placeholder="Unit price" />
          <button>Add item</button>
        </form>

        <ul>
          {state.items.map((item) => {
            const fields = editStates[item.id] ?? initEditState(item);
            const itemError = editErrors[item.id];
            const savedAt = editStates[item.id]?.savedAt;
            // Resolve the single pending candidate (for unique match)
            const pendingProduct = item.pendingMatchId ? catalogue.find((p) => p.id === item.pendingMatchId) : undefined;
            // Resolve ambiguous candidates (for name that matches multiple products)
            const ambiguousCandidates: CatalogueProduct[] =
              item.matchStatus === 'needs-confirmation' && item.ambiguousCandidateIds && item.ambiguousCandidateIds.length > 1
                ? (item.ambiguousCandidateIds.map((cid) => catalogue.find((p) => p.id === cid)).filter(Boolean) as CatalogueProduct[])
                : [];

            return (
              <li key={item.id}>
                <form onSubmit={(event) => save(item, event)}>
                  <input
                    name="name"
                    value={fields.name}
                    onChange={(e) => updateEditField(item.id, 'name', e.target.value)}
                    aria-label={`${item.id}-name`}
                  />
                  <input
                    name="quantity"
                    value={fields.quantity}
                    onChange={(e) => updateEditField(item.id, 'quantity', e.target.value)}
                    aria-label={`${item.id}-quantity`}
                  />
                  <input
                    name="price"
                    value={fields.price}
                    onChange={(e) => updateEditField(item.id, 'price', e.target.value)}
                    aria-label={`${item.id}-price`}
                  />
                  <input
                    name="unitSize"
                    value={fields.unitSize}
                    onChange={(e) => updateEditField(item.id, 'unitSize', e.target.value)}
                    placeholder="Package label"
                  />
                  <select
                    name="priority"
                    value={fields.priority}
                    onChange={(e) => updateEditField(item.id, 'priority', e.target.value)}
                  >
                    <option value="essential">Essential</option>
                    <option value="flexible">Flexible</option>
                    <option value="optional">Optional</option>
                  </select>

                  <button type="submit">Save item</button>
                  <button type="button" onClick={() => saveManual(state.items.filter((entry) => entry.id !== item.id))}>
                    Remove
                  </button>

                  {/* Saved confirmation flash */}
                  {savedAt && Date.now() - savedAt < 3000 && <span aria-live="polite"> ✓ Saved</span>}

                  {/* Per-item error */}
                  {itemError && <span role="alert" style={{ color: 'var(--error, red)' }}> {itemError}</span>}

                  {/* Unique catalogue match — confirm or dismiss */}
                  {item.matchStatus === 'needs-confirmation' && pendingProduct && ambiguousCandidates.length === 0 && (
                    <span>
                      {' '}
                      Match: {formatPackage(pendingProduct)}{' '}
                      <button type="button" onClick={() => confirmMatch(item, pendingProduct)}>
                        Confirm match
                      </button>
                    </span>
                  )}

                  {/* Ambiguous catalogue match — let user pick */}
                  {item.matchStatus === 'needs-confirmation' && ambiguousCandidates.length > 1 && (
                    <span>
                      {' '}
                      Multiple matches found — select one:{' '}
                      {ambiguousCandidates.map((product) => (
                        <button key={product.id} type="button" onClick={() => confirmMatch(item, product)}>
                          {formatPackage(product)}
                        </button>
                      ))}
                    </span>
                  )}

                  <em> {item.matchStatus}</em>
                </form>
              </li>
            );
          })}
        </ul>

        {/* Hint when there are pending matches or all items are unmatched */}
        {needsConfirmationCount > 0 && (
          <p role="status">
            {needsConfirmationCount} item{needsConfirmationCount > 1 ? 's' : ''} need{needsConfirmationCount === 1 ? 's' : ''} a catalogue match confirmation before savings can be found.
          </p>
        )}
        {overspend > 0 && confirmedCount === 0 && needsConfirmationCount === 0 && (
          <p role="status">Confirm catalogue matches to unlock savings recommendations.</p>
        )}

        {overspend > 0 && (
          <button onClick={recommend} disabled={loading}>
            {loading ? 'Finding ways to save…' : 'Find ways to save'}
          </button>
        )}
      </section>

      {status && <p role="status">{status}</p>}
      {budgetSearch.status === 'already-within-budget' && <p role="status">Your basket is within budget.</p>}
      {overspend > 0 && searchedCandidateCount === 0 && (
        <p role="status">No valid savings candidates are available for the current confirmed basket.</p>
      )}
      {overspend > 0 && searchedCandidateCount !== undefined && searchedCandidateCount > 0 && budgetSearch.status === 'solution-found' && (
        <p role="status">A plan using the fewest changes can meet your budget.</p>
      )}
      {overspend > 0 && searchedCandidateCount !== undefined && searchedCandidateCount > 0 && budgetSearch.status === 'no-solution-among-evaluated-candidates' && (
        <p role="status">No solution was found among the evaluated recommendations.</p>
      )}
      {overspend > 0 && searchedCandidateCount !== undefined && searchedCandidateCount > 0 && budgetSearch.status === 'search-limit-reached' && (
        <p role="status">A possible plan was found, but it may not be the least disruptive.</p>
      )}

      <section className="card">
        {state.recommendations.map((rec) => (
          <article key={rec.id}>
            <b>{rec.proposedName}</b>
            <p>
              Save {formatCurrency(rec.savingMinor, state.currency)}. {rec.reason}
            </p>
            <p>{rec.tradeOffs}</p>
            <p>{rec.status}</p>
            {rec.status === 'pending' && (
              <>
                <button onClick={() => accept(rec.id)}>Accept change</button>
                <button onClick={() => dispatch({ type: 'reject', id: rec.id })}>Reject</button>
              </>
            )}
          </article>
        ))}
      </section>
    </main>
  );
}
