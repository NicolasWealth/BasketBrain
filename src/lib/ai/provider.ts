import 'server-only';
import { ServerBuiltCandidate, ProviderText } from '../recommendations';
export interface AIProvider { getRecommendations(candidates: ServerBuiltCandidate[]): Promise<ProviderText[]>; }
