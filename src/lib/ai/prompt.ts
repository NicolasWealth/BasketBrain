import 'server-only';
import { ServerBuiltCandidate } from '../recommendations';
export const buildPrompt=(candidates:ServerBuiltCandidate[])=>`Rank only these candidate IDs and give qualitative, non-financial reasons and trade-offs. Never mention prices, totals, savings, currency, or affordability. ${JSON.stringify(candidates)}`;
