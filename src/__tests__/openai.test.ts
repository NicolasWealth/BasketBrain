/** @jest-environment node */
import { OpenAIProvider, resetOpenAIModelVerificationForTests, verifyOpenAIModelAccess } from '../lib/ai/openai';

const candidate = { candidateId: 'item:quantity-reduction:none', type: 'quantity-reduction' as const, basketItemId: 'item', currentName: 'Milk', proposedName: 'Milk', proposedQuantityHundredths: 100 };
const response = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;

describe('OpenAI provider', () => {
  beforeEach(() => { process.env.OPENAI_API_KEY = 'test-key'; delete process.env.OPENAI_MODEL; resetOpenAIModelVerificationForTests(); });
  afterEach(() => { delete process.env.OPENAI_API_KEY; jest.restoreAllMocks(); });

  it('caches a successful configurable-model verification including the structured-output probe', async () => {
    process.env.OPENAI_MODEL = 'configured-model';
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(response({ data: [{ id: 'configured-model' }] })).mockResolvedValueOnce(response({ output_text: '{"proposals":[]}' }));
    await expect(verifyOpenAIModelAccess()).resolves.toBe(true);
    await expect(verifyOpenAIModelAccess()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][1]?.body)).toContain('configured-model');
  });

  it('reports unavailable configured models and failed probes as unavailable', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(response({ data: [{ id: 'other-model' }] }));
    await expect(verifyOpenAIModelAccess()).resolves.toBe(false);
    resetOpenAIModelVerificationForTests();
    jest.spyOn(global, 'fetch').mockReset().mockResolvedValueOnce(response({ data: [{ id: 'gpt-6-luna' }] })).mockResolvedValueOnce(response({ output_text: 'not json' }));
    await expect(verifyOpenAIModelAccess()).resolves.toBe(false);
  });

  it('rejects failed, malformed, and incomplete provider responses', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    fetchMock.mockResolvedValueOnce(response({}, false));
    await expect(new OpenAIProvider().getRecommendations([candidate])).rejects.toThrow('provider_failed');
    fetchMock.mockResolvedValueOnce(response({ output_text: 'not json' }));
    await expect(new OpenAIProvider().getRecommendations([candidate])).rejects.toThrow();
    fetchMock.mockResolvedValueOnce(response({ output_text: '{"proposals":[]}' }));
    await expect(new OpenAIProvider().getRecommendations([candidate])).rejects.toThrow('provider_failed');
    fetchMock.mockResolvedValueOnce(response({ status: 'incomplete', output_text: '{"proposals":[{}]}' }));
    await expect(new OpenAIProvider().getRecommendations([candidate])).rejects.toThrow('provider_failed');
    fetchMock.mockResolvedValueOnce(response({ status: 'completed', output: [{ content: [{ type: 'refusal', refusal: 'no' }] }], output_text: '{"proposals":[{}]}' }));
    await expect(new OpenAIProvider().getRecommendations([candidate])).rejects.toThrow('provider_failed');
    fetchMock.mockRejectedValueOnce(new Error('timeout'));
    await expect(new OpenAIProvider().getRecommendations([candidate])).rejects.toThrow('timeout');
  });
});
