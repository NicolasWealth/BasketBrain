import { BasketItem } from '../lib/basket';
import { confirmCatalogueMatch, catalogue } from '../lib/catalogue';
import { buildRecommendationCard, findBudgetSolution, generateCandidates } from '../lib/recommendations';

const item: BasketItem = confirmCatalogueMatch({id:'123e4567-e89b-42d3-a456-426614174000',name:'Semi skim milk',quantityHundredths:200,unitPriceMinor:300,currency:'GBP',priority:'flexible',matchStatus:'needs-confirmation',pendingMatchId:'milk-semi-1l'},catalogue.find(p=>p.id==='milk-semi-1l')!);
describe('recommendation engine',()=>{
  it('generates deterministic confirmed candidates with stable IDs',()=>{const candidates=generateCandidates([item],'GBP');expect(candidates.map(c=>c.candidateId)).toEqual(['123e4567-e89b-42d3-a456-426614174000:substitution:milk-whole-1l','123e4567-e89b-42d3-a456-426614174000:quantity-reduction:none']);});
  it('uses app-calculated fallback text and saving',()=>{const candidate=generateCandidates([item],'GBP')[0];const card=buildRecommendationCard(candidate,[item],'GBP',0);expect(card?.savingMinor).toBe(322);expect(card?.reason).not.toMatch(/[\d£$]/);});
  it('reports already-within-budget without searching',()=>expect(findBudgetSolution([item],1000,[])).toEqual({status:'already-within-budget'}));
  it('finds the fewest-change valid solution',()=>{const card=buildRecommendationCard(generateCandidates([item],'GBP')[0],[item],'GBP',0)!;const evaluated={candidate:card,proposedItems:[item],savingMinor:card.savingMinor};expect(findBudgetSolution([item],300,[evaluated])).toMatchObject({status:'solution-found',leastDisruptive:'confirmed',solution:[evaluated]});});
});
