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
      return (JSON.parse(data.output_text ?? '{}') as { proposals?: ProviderText[] }).proposals ?? [];
    } finally { clearTimeout(timeout); }
  }
}
