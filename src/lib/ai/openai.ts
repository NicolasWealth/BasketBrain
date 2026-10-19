import 'server-only';
import { AIProvider } from './provider';
import { ServerBuiltCandidate, ProviderText } from '../recommendations';
import { buildPrompt } from './prompt';

const responseSchema = {
  type: 'object',
  properties: {
    proposals: {
      type: 'array',
      items: {
        type: 'object',
        properties: { candidateId: { type: 'string' }, reason: { type: 'string' }, tradeOffs: { type: 'string' } },
        required: ['candidateId', 'reason', 'tradeOffs'],
        additionalProperties: false,
      },
    },
  },
  required: ['proposals'],
  additionalProperties: false,
};
let cachedVerification: { promise: Promise<boolean>; expiresAt: number } | undefined;
export function resetOpenAIModelVerificationForTests(): void {
  cachedVerification = undefined;
}
export function verifyOpenAIModelAccess(): Promise<boolean> {
  if (cachedVerification && cachedVerification.expiresAt > Date.now()) return cachedVerification.promise;
  const promise = (async () => {
    const key = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL ?? 'gpt-6-luna';
    if (!key) return false;
    try {
      const models = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } });
      const modelData = await models.json() as { data?: Array<{ id?: string }> };
      if (!models.ok || !modelData.data?.some((entry) => entry.id === model)) return false;
      const probe = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input: 'Return an empty proposal list.', max_output_tokens: 32, text: { format: { type: 'json_schema', name: 'recommendations_probe', strict: true, schema: responseSchema } } }),
      });
      const probeData = await probe.json() as { output_text?: string };
      const parsed = JSON.parse(probeData.output_text ?? '{}') as { proposals?: unknown };
      return probe.ok && Array.isArray(parsed.proposals);
    } catch { return false; }
  })();
  cachedVerification = { promise, expiresAt: Date.now() + 60_000 };
  promise.then((ok) => { if (cachedVerification?.promise === promise) cachedVerification.expiresAt = Date.now() + (ok ? 900_000 : 60_000); });
  return promise;
}

export class OpenAIProvider implements AIProvider {
  async getRecommendations(candidates: ServerBuiltCandidate[]): Promise<ProviderText[]> {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('model_unavailable');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ model: process.env.OPENAI_MODEL ?? 'gpt-6-luna', input: buildPrompt(candidates), max_output_tokens: 1200, text: { format: { type: 'json_schema', name: 'recommendations', strict: true, schema: responseSchema } } }),
      });
      if (!response.ok) throw new Error('provider_failed');
      const data = await response.json() as { output_text?: string };
      const parsed = JSON.parse(data.output_text ?? '{}') as { proposals?: ProviderText[] };
      if (!Array.isArray(parsed.proposals) || parsed.proposals.length === 0) throw new Error('provider_failed');
      return parsed.proposals;
    } finally { clearTimeout(timeout); }
  }
}
