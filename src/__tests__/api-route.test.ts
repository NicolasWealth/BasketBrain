/** @jest-environment node */
import { NextRequest } from 'next/server';
import { POST } from '../app/api/recommendations/route';
import { resetOpenAIModelVerificationForTests } from '../lib/ai/openai';

const item = { id: '123e4567-e89b-42d3-a456-426614174000', name: 'Semi skim milk', quantityHundredths: 100, unitPriceMinor: 200, currency: 'GBP', priority: 'flexible', matchStatus: 'confirmed', catalogueId: 'milk-semi-1l', confirmedPackageSignature: 'ml:1000' };
// An item whose name is ambiguous but the user force-confirmed to milk-semi-1l
const forceConfirmedItem = { id: '123e4567-e89b-42d3-a456-426614174001', name: 'milk', quantityHundredths: 100, unitPriceMinor: 200, currency: 'GBP', priority: 'flexible', matchStatus: 'confirmed', catalogueId: 'milk-semi-1l', confirmedPackageSignature: 'ml:1000', ambiguousCandidateIds: ['milk-semi-1l', 'milk-whole-1l'] };

const makeBody = (items = [item]) => ({ requestId: '123e4567-e89b-42d3-a456-426614174999', basketRevision: 0, currency: 'GBP', budgetMinor: 1000, items });
const request = (body: unknown, ip = 'test') => new NextRequest('http://localhost/api/recommendations', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(body) });

describe('recommendations route', () => {
  beforeEach(() => { delete process.env.OPENAI_API_KEY; resetOpenAIModelVerificationForTests(); jest.restoreAllMocks(); });

  it('returns retryable fallback status with no API key', async () => {
    const response = await POST(request(makeBody()));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'model_unavailable', retryable: true });
  });

  it('rejects tampered catalogue confirmation and duplicate IDs', async () => {
    const tampered = await POST(request(makeBody([{ ...item, confirmedPackageSignature: 'g:1' }])));
    const duplicate = await POST(request(makeBody([item, item])));
    expect(tampered.status).toBe(400);
    expect(duplicate.status).toBe(400);
  });

  it('rejects actual oversized bodies even without content-length', async () => {
    const response = await POST(request({ ...makeBody(), padding: 'x'.repeat(33000) }));
    expect(response.status).toBe(413);
  });

  it('rejects malformed JSON and unsupported currencies', async () => {
    const malformed = await POST(new NextRequest('http://localhost/api/recommendations', { method: 'POST', body: '{' }));
    const currency = await POST(request({ ...makeBody(), currency: 'CAD' }));
    expect(malformed.status).toBe(400);
    expect(currency.status).toBe(400);
  });

  it('accepts more than six eligible items and applies the server candidate cap', async () => {
    const items = Array.from({ length: 7 }, (_, index) => ({ ...item, id: `123e4567-e89b-42d3-a456-426614174${String(index + 10).padStart(3, '0')}` }));
    const response = await POST(request(makeBody(items), 'more-than-six'));
    expect(response.status).toBe(503);
  });

  it('returns fallback status for unknown IDs and invalid explanation text', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const fetchMock = jest.spyOn(global, 'fetch');
    const providerOutput = (proposal: object) =>
      fetchMock
        .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ id: 'gpt-6-luna' }] }) } as Response)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ output_text: '{"proposals":[]}' }) } as Response)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ output_text: JSON.stringify({ proposals: [proposal] }) }) } as Response);
    providerOutput({ candidateId: 'unknown', reason: 'A safe change', tradeOffs: 'Different choice' });
    expect((await POST(request(makeBody(), 'unknown-provider'))).status).toBe(502);
    resetOpenAIModelVerificationForTests();
    fetchMock.mockReset();
    providerOutput({ candidateId: '123e4567-e89b-42d3-a456-426614174000:substitution:milk-whole-1l', reason: 'Save 2', tradeOffs: 'Different choice' });
    expect((await POST(request(makeBody(), 'invalid-text'))).status).toBe(502);
  });

  it('rejects a provider response that omits an eligible candidate ID', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ id: 'gpt-6-luna' }] }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ output_text: '{"proposals":[]}' }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ output_text: '{"proposals":[{"candidateId":"123e4567-e89b-42d3-a456-426614174000:substitution:milk-whole-1l","reason":"A safer choice","tradeOffs":"Different product"}]}' }) } as Response);
    expect((await POST(request(makeBody([{ ...item, quantityHundredths: 200, unitPriceMinor: 300 }]), 'incomplete-provider'))).status).toBe(502);
  });

  it('rate limits the eleventh request', async () => {
    for (let index = 0; index < 10; index++) await POST(request({ ...makeBody(), requestId: `123e4567-e89b-42d3-a456-426614174${String(index).padStart(3, '0')}` }, 'limit'));
    expect((await POST(request({ ...makeBody(), requestId: '123e4567-e89b-42d3-a456-426614174111' }, 'limit'))).status).toBe(429);
  });

  // BUG-2 regression: force-confirmed items (ambiguous name) must be accepted by the server
  it('accepts force-confirmed items with ambiguous names', async () => {
    const response = await POST(request(makeBody([forceConfirmedItem]), 'force-confirm-test'));
    // Without OPENAI_API_KEY, should return 503 (model_unavailable) – not 400 (invalid_request)
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.code).toBe('model_unavailable');
  });

  // BUG-2 regression: tampered force-confirmed item (wrong catalogue ID) must be rejected
  it('rejects force-confirmed items with wrong catalogueId', async () => {
    const tampered = { ...forceConfirmedItem, catalogueId: 'bread-white-800g', confirmedPackageSignature: 'g:800' };
    const response = await POST(request(makeBody([tampered]), 'tampered-force-confirm'));
    expect(response.status).toBe(400);
  });

  // BUG-2 regression: force-confirmed item with invalid packageSignature must be rejected
  it('rejects force-confirmed items with wrong packageSignature', async () => {
    const tampered = { ...forceConfirmedItem, confirmedPackageSignature: 'g:999' };
    const response = await POST(request(makeBody([tampered]), 'bad-sig-force-confirm'));
    expect(response.status).toBe(400);
  });
});
