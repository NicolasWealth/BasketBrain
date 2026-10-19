import { NextRequest, NextResponse } from 'next/server';
import { BasketItem, calculateBasketTotalMinor, SUPPORTED_CURRENCIES, SupportedCurrency, validateBasketItem } from '../../../lib/basket';
import { catalogue, matchCatalogueItem } from '../../../lib/catalogue';
import { generateCandidates } from '../../../lib/recommendations';
import { OpenAIProvider, verifyOpenAIModelAccess } from '../../../lib/ai/openai';

export const runtime = 'nodejs';

const BODY_LIMIT_BYTES = 32 * 1024;
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const hits = new Map<string, number[]>();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const invalidProviderText = /[\d$£€₦]|\b(?:GBP|USD|EUR|NGN)\b/i;

type RequestBody = {
  requestId?: string;
  basketRevision?: number;
  currency?: SupportedCurrency;
  budgetMinor?: number;
  items?: BasketItem[];
};
type ErrorCode = 'model_unavailable' | 'provider_failed' | 'invalid_request' | 'rate_limited';

function error(code: ErrorCode, status: number, requestId?: string, basketRevision?: number) {
  return NextResponse.json({
    code,
    error: code === 'rate_limited' ? 'Too many requests.' : code === 'invalid_request' ? 'Invalid recommendation request.' : 'AI explanations are unavailable',
    retryable: code !== 'invalid_request',
    requestId,
    basketRevision,
  }, { status });
}

function isRateLimited(request: NextRequest): boolean {
  const ip = request.headers.get('x-forwarded-for') ?? 'local';
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((time) => now - time < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) return true;
  hits.set(ip, [...recent, now]);
  return false;
}

function validateTrustedBasket(data: Required<RequestBody>): void {
  if (!uuid.test(data.requestId) || !Number.isSafeInteger(data.basketRevision) || data.basketRevision < 0) throw new Error('request');
  if (!SUPPORTED_CURRENCIES.includes(data.currency) || !Number.isSafeInteger(data.budgetMinor) || data.budgetMinor < 1 || data.budgetMinor > 999_999_999) throw new Error('budget');
  if (data.items.length > 30) throw new Error('items');
  const ids = new Set<string>();
  for (const item of data.items) {
    validateBasketItem(item, data.currency);
    if (ids.has(item.id)) throw new Error('duplicate');
    ids.add(item.id);
    const match = matchCatalogueItem(item.name, data.currency);
    if (item.matchStatus === 'confirmed') {
      const product = catalogue.find((entry) => entry.id === item.catalogueId);
      if (match.status !== 'needs-confirmation' || match.candidate.id !== item.catalogueId || !product || product.packageSignature !== item.confirmedPackageSignature) throw new Error('tampered-confirmation');
    } else if (item.matchStatus === 'needs-confirmation') {
      if (match.status !== 'needs-confirmation' || item.pendingMatchId !== match.candidate.id || item.catalogueId || item.confirmedPackageSignature) throw new Error('tampered-pending-match');
    } else if (item.catalogueId || item.confirmedPackageSignature || item.pendingMatchId) {
      throw new Error('tampered-unmatched-item');
    }
  }
  calculateBasketTotalMinor(data.items);
}

export async function POST(request: NextRequest) {
  if (Number(request.headers.get('content-length') ?? 0) > BODY_LIMIT_BYTES) return error('invalid_request', 413);

  let data: RequestBody;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > BODY_LIMIT_BYTES) return error('invalid_request', 413);
    data = JSON.parse(raw) as RequestBody;
  } catch {
    return error('invalid_request', 400);
  }

  if (isRateLimited(request)) return error('rate_limited', 429, data.requestId, data.basketRevision);
  if (!data.requestId || data.basketRevision === undefined || !data.currency || data.budgetMinor === undefined || !Array.isArray(data.items)) return error('invalid_request', 400, data.requestId, data.basketRevision);
  try {
    validateTrustedBasket(data as Required<RequestBody>);
  } catch {
    return error('invalid_request', 400, data.requestId, data.basketRevision);
  }

  const candidates = generateCandidates(data.items, data.currency);
  if (candidates.length === 0) return NextResponse.json({ requestId: data.requestId, basketRevision: data.basketRevision, proposals: [] });
  if (!process.env.OPENAI_API_KEY || !await verifyOpenAIModelAccess()) return error('model_unavailable', 503, data.requestId, data.basketRevision);

  try {
    const proposals = await new OpenAIProvider().getRecommendations(candidates);
    const allowed = new Set(candidates.map((candidate) => candidate.candidateId));
    const valid = proposals.filter((proposal) => allowed.has(proposal.candidateId)
      && typeof proposal.reason === 'string' && proposal.reason.length >= 1 && proposal.reason.length <= 240
      && typeof proposal.tradeOffs === 'string' && proposal.tradeOffs.length >= 1 && proposal.tradeOffs.length <= 240
      && !invalidProviderText.test(`${proposal.reason} ${proposal.tradeOffs}`));
    if (valid.length === 0 || valid.length !== proposals.length) return error('provider_failed', 502, data.requestId, data.basketRevision);
    return NextResponse.json({ requestId: data.requestId, basketRevision: data.basketRevision, proposals: valid });
  } catch {
    return error('provider_failed', 502, data.requestId, data.basketRevision);
  }
}
