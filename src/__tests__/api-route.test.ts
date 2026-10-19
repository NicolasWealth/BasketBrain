/** @jest-environment node */
import { NextRequest } from 'next/server';
import { POST } from '../app/api/recommendations/route';
const item = { id: '123e4567-e89b-42d3-a456-426614174000', name: 'Semi skim milk', quantityHundredths: 100, unitPriceMinor: 200, currency: 'GBP', priority: 'flexible', matchStatus: 'confirmed', catalogueId: 'milk-semi-1l', confirmedPackageSignature: 'ml:1000' };
const makeBody = (items = [item]) => ({ requestId: '123e4567-e89b-42d3-a456-426614174999', basketRevision: 0, currency: 'GBP', budgetMinor: 1000, items });
const request = (body: unknown, ip = 'test') => new NextRequest('http://localhost/api/recommendations', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(body) });
describe('recommendations route', () => {
  beforeEach(() => { delete process.env.OPENAI_API_KEY; });
  it('returns retryable fallback status with no API key', async () => { const response = await POST(request(makeBody())); expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ code: 'model_unavailable', retryable: true }); });
  it('rejects tampered catalogue confirmation and duplicate IDs', async () => { const tampered = await POST(request(makeBody([{ ...item, confirmedPackageSignature: 'g:1' }]))); const duplicate = await POST(request(makeBody([item, item]))); expect(tampered.status).toBe(400); expect(duplicate.status).toBe(400); });
  it('rejects actual oversized bodies even without content-length', async () => { const response = await POST(request({ ...makeBody(), padding: 'x'.repeat(33000) })); expect(response.status).toBe(413); });
  it('rejects malformed JSON and unsupported currencies', async () => { const malformed = await POST(new NextRequest('http://localhost/api/recommendations', { method: 'POST', body: '{' })); const currency = await POST(request({ ...makeBody(), currency: 'CAD' })); expect(malformed.status).toBe(400); expect(currency.status).toBe(400); });
  it('rate limits the eleventh request', async () => { for (let index = 0; index < 10; index++) await POST(request({ ...makeBody(), requestId: `123e4567-e89b-42d3-a456-426614174${String(index).padStart(3, '0')}` }, 'limit')); expect((await POST(request({ ...makeBody(), requestId: '123e4567-e89b-42d3-a456-426614174111' }, 'limit'))).status).toBe(429); });
});
