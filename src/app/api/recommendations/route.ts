import { NextRequest, NextResponse } from 'next/server';
import { BasketItem, calculateBasketTotalMinor, SUPPORTED_CURRENCIES, SupportedCurrency, validateBasketItem } from '../../../lib/basket';
import { catalogue, matchCatalogueItem } from '../../../lib/catalogue';
import { generateCandidates } from '../../../lib/recommendations';
import { OpenAIProvider } from '../../../lib/ai/openai';
export const runtime = 'nodejs';
const hits = new Map<string, number[]>();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const error = (code: 'model_unavailable'|'provider_failed'|'invalid_request'|'rate_limited', status: number, requestId?: string, basketRevision?: number) => NextResponse.json({ code, error: code === 'rate_limited' ? 'Too many requests.' : code === 'invalid_request' ? 'Invalid recommendation request.' : 'AI explanations are unavailable', retryable: code !== 'invalid_request', requestId, basketRevision }, { status });
export async function POST(request: NextRequest) {
  if (Number(request.headers.get('content-length') ?? 0) > 32768) return error('invalid_request', 413);
  let data: { requestId?: string; basketRevision?: number; currency?: SupportedCurrency; budgetMinor?: number; items?: BasketItem[] };
  try { data = await request.json(); } catch { return error('invalid_request', 400); }
  const ip = request.headers.get('x-forwarded-for') ?? 'local'; const now = Date.now(); const window = (hits.get(ip) ?? []).filter((time) => now - time < 600000);
  if (window.length >= 10) return error('rate_limited', 429, data.requestId, data.basketRevision); hits.set(ip, [...window, now]);
  if (!uuid.test(data.requestId ?? '') || !Number.isSafeInteger(data.basketRevision) || data.basketRevision! < 0 || !data.currency || !SUPPORTED_CURRENCIES.includes(data.currency) || !Number.isSafeInteger(data.budgetMinor) || data.budgetMinor! < 1 || data.budgetMinor! > 999999999 || !Array.isArray(data.items) || data.items.length > 30) return error('invalid_request', 400, data.requestId, data.basketRevision);
  try { const ids = new Set<string>(); for (const item of data.items) { validateBasketItem(item, data.currency); if (ids.has(item.id)) throw new Error('duplicate'); ids.add(item.id); if (item.matchStatus === 'confirmed') { const match = matchCatalogueItem(item.name, data.currency); const product = catalogue.find((entry) => entry.id === item.catalogueId); if (match.status !== 'needs-confirmation' || match.candidate.id !== item.catalogueId || !product || product.packageSignature !== item.confirmedPackageSignature) throw new Error('tampered'); } } calculateBasketTotalMinor(data.items); } catch { return error('invalid_request', 400, data.requestId, data.basketRevision); }
  const candidates = generateCandidates(data.items, data.currency);
  if (!process.env.OPENAI_API_KEY) return error('model_unavailable', 503, data.requestId, data.basketRevision);
  try { const proposals = await new OpenAIProvider().getRecommendations(candidates); const allowed = new Set(candidates.map((candidate) => candidate.candidateId)); const valid = proposals.filter((proposal) => allowed.has(proposal.candidateId) && proposal.reason && proposal.tradeOffs && proposal.reason.length <= 240 && proposal.tradeOffs.length <= 240 && !/[\d$£€₦]|\b(?:GBP|USD|EUR|NGN)\b/i.test(`${proposal.reason} ${proposal.tradeOffs}`)); return NextResponse.json({ requestId: data.requestId, basketRevision: data.basketRevision, proposals: valid }); } catch { return error('provider_failed', 502, data.requestId, data.basketRevision); }
}
