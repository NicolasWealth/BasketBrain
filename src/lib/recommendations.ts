import { BasketItem, calculateBasketTotalMinor, calculateLineTotalMinor, SupportedCurrency } from './basket';
import { catalogue } from './catalogue';

export const MAX_ELIGIBLE_ITEMS = 6;
export const MAX_CANDIDATES_PER_ITEM = 3;
export const MAX_COMBINATIONS = 2000;
export type CandidateType = 'substitution' | 'quantity-reduction' | 'removal';
export interface ServerBuiltCandidate { candidateId: string; type: CandidateType; basketItemId: string; currentName: string; proposedName: string; proposedQuantityHundredths?: number; proposedCatalogueId?: string; }
export interface Recommendation extends ServerBuiltCandidate { id: string; proposedUnitPriceMinor: number; savingMinor: number; reason: string; tradeOffs: string; status: 'pending'|'accepted'|'rejected'|'needs-review'; generatedForRevision: number; snapshot: Pick<BasketItem,'quantityHundredths'|'unitPriceMinor'|'currency'|'priority'|'catalogueId'|'unitSize'|'confirmedPackageSignature'>; }
export interface EvaluatedCandidate { candidate: ServerBuiltCandidate; proposedItems: BasketItem[]; savingMinor: number; }
export type BudgetSearchResult = {status:'already-within-budget'}|{status:'solution-found';solution:EvaluatedCandidate[];leastDisruptive:'confirmed'}|{status:'no-solution-among-evaluated-candidates'}|{status:'search-limit-reached';solution:EvaluatedCandidate[];leastDisruptive:'may-not-be-least-disruptive'};
export interface ProviderText { candidateId: string; reason?: string; tradeOffs?: string; }

const fallback = (candidate: ServerBuiltCandidate) => candidate.type === 'substitution'
  ? { reason: 'This recorded catalogue alternative costs less for the same package.', tradeOffs: 'The product choice changes.' }
  : candidate.type === 'removal'
    ? { reason: 'Removing this optional item lowers the basket total.', tradeOffs: 'This item will no longer be in the basket.' }
    : { reason: 'A smaller quantity lowers the basket total.', tradeOffs: 'You will have less of this item.' };
const candidateId = (itemId:string,type:CandidateType,productId?:string) => `${itemId}:${type}:${productId ?? 'none'}`;
const isEligible = (item:BasketItem,currency:SupportedCurrency) => item.currency===currency && item.matchStatus==='confirmed' && !!item.catalogueId && !!item.confirmedPackageSignature && item.priority!=='essential';

export function generateCandidates(items: BasketItem[], currency: SupportedCurrency): ServerBuiltCandidate[] {
  const eligible=items.filter((item)=>isEligible(item,currency)).sort((a,b)=>calculateLineTotalMinor(b.quantityHundredths,b.unitPriceMinor)-calculateLineTotalMinor(a.quantityHundredths,a.unitPriceMinor)||a.id.localeCompare(b.id)).slice(0,MAX_ELIGIBLE_ITEMS);
  return eligible.flatMap((item) => {
    const source=catalogue.find((product)=>product.id===item.catalogueId);
    if (!source || source.packageSignature!==item.confirmedPackageSignature) return [];
    const substitutions=source.alternatives.map((id)=>catalogue.find((p)=>p.id===id)).filter((p):p is NonNullable<typeof p>=>!!p&&p.packageSignature===source.packageSignature&&p.pricesMinor[currency]<item.unitPriceMinor).sort((a,b)=>a.pricesMinor[currency]-b.pricesMinor[currency]||a.id.localeCompare(b.id)).slice(0,item.priority==='flexible'?2:1).map((p)=>({candidateId:candidateId(item.id,'substitution',p.id),type:'substitution' as const,basketItemId:item.id,currentName:item.name,proposedName:p.name,proposedCatalogueId:p.id}));
    const reduced=item.quantityHundredths%100===0 ? (item.quantityHundredths>=200?Math.floor(item.quantityHundredths/200)*100:0) : Math.floor(item.quantityHundredths/2);
    const reduction=reduced>0?[{candidateId:candidateId(item.id,'quantity-reduction'),type:'quantity-reduction' as const,basketItemId:item.id,currentName:item.name,proposedName:item.name,proposedQuantityHundredths:reduced}]:[];
    const removal=item.priority==='optional'?[{candidateId:candidateId(item.id,'removal'),type:'removal' as const,basketItemId:item.id,currentName:item.name,proposedName:item.name,proposedQuantityHundredths:0}]:[];
    return [...substitutions,...reduction,...removal].slice(0,MAX_CANDIDATES_PER_ITEM);
  });
}

function validText(value?:string){ return !!value && value.length>=1 && value.length<=240 && !/[\d$£€₦]|\b(?:GBP|USD|EUR|NGN)\b/i.test(value); }
export function buildRecommendationCard(candidate:ServerBuiltCandidate,items:BasketItem[],currency:SupportedCurrency,revision:number,providerText?:ProviderText):Recommendation|null {
  const item=items.find((entry)=>entry.id===candidate.basketItemId); if(!item||!isEligible(item,currency)) return null;
  let next:BasketItem[]; let price=item.unitPriceMinor; let proposedName=item.name;
  if(candidate.type==='substitution'){const product=catalogue.find((p)=>p.id===candidate.proposedCatalogueId);if(!product||product.packageSignature!==item.confirmedPackageSignature||product.pricesMinor[currency]>=item.unitPriceMinor)return null; price=product.pricesMinor[currency];proposedName=product.name;next=items.map((entry)=>entry.id===item.id?{...entry,name:product.name,unitPriceMinor:price,catalogueId:product.id,confirmedPackageSignature:product.packageSignature}:entry);}
  else if(candidate.type==='quantity-reduction'){if(!candidate.proposedQuantityHundredths||candidate.proposedQuantityHundredths>=item.quantityHundredths)return null;next=items.map((entry)=>entry.id===item.id?{...entry,quantityHundredths:candidate.proposedQuantityHundredths!}:entry);}
  else {if(item.priority!=='optional')return null;next=items.filter((entry)=>entry.id!==item.id);}
  const saving=calculateBasketTotalMinor(items)-calculateBasketTotalMinor(next);if(saving<=0)return null;const text=validText(providerText?.reason)&&validText(providerText?.tradeOffs)?{reason:providerText!.reason!,tradeOffs:providerText!.tradeOffs!}:fallback(candidate);
  return {...candidate,id:candidate.candidateId,proposedName,proposedUnitPriceMinor:price,savingMinor:saving,...text,status:'pending',generatedForRevision:revision,snapshot:{quantityHundredths:item.quantityHundredths,unitPriceMinor:item.unitPriceMinor,currency:item.currency,priority:item.priority,catalogueId:item.catalogueId,unitSize:item.unitSize,confirmedPackageSignature:item.confirmedPackageSignature}};
}
export function revalidateRecommendation(rec:Recommendation,items:BasketItem[],currency:SupportedCurrency){const item=items.find((entry)=>entry.id===rec.basketItemId);if(!item)return 'needs-review' as const;for(const key of ['quantityHundredths','unitPriceMinor','currency','priority','catalogueId','unitSize','confirmedPackageSignature'] as const)if(item[key]!==rec.snapshot[key])return 'needs-review' as const;return buildRecommendationCard(rec,items,currency,rec.generatedForRevision)?'valid' as const:'needs-review' as const;}
export function findBudgetSolution(items:BasketItem[],budget:number,candidates:EvaluatedCandidate[]):BudgetSearchResult { const total=calculateBasketTotalMinor(items);if(total<=budget)return{status:'already-within-budget'};const grouped=Object.values(candidates.reduce<Record<string,EvaluatedCandidate[]>>((acc,c)=>{(acc[c.candidate.basketItemId]??=[]).push(c);return acc;},{}));const cheapest=grouped.map((group)=>[...group].sort((a,b)=>b.savingMinor-a.savingMinor||a.candidate.candidateId.localeCompare(b.candidate.candidateId))[0]);if(total-cheapest.reduce((sum,c)=>sum+c.savingMinor,0)>budget)return{status:'no-solution-among-evaluated-candidates'};let attempts=0;const ordered=[...candidates].sort((a,b)=>a.candidate.basketItemId.localeCompare(b.candidate.basketItemId)||a.candidate.candidateId.localeCompare(b.candidate.candidateId));for(let size=1;size<=grouped.length;size++){let found:EvaluatedCandidate[]|undefined;const visit=(start:number,plan:EvaluatedCandidate[])=>{if(found||attempts>=MAX_COMBINATIONS)return;if(plan.length===size){attempts++;if(total-plan.reduce((sum,c)=>sum+c.savingMinor,0)<=budget)found=plan;return;}for(let index=start;index<ordered.length;index++){if(plan.some((c)=>c.candidate.basketItemId===ordered[index].candidate.basketItemId))continue;visit(index+1,[...plan,ordered[index]]);}};visit(0,[]);if(found)return{status:'solution-found',solution:found,leastDisruptive:'confirmed'};if(attempts>=MAX_COMBINATIONS)return{status:'search-limit-reached',solution:cheapest,leastDisruptive:'may-not-be-least-disruptive'};}return{status:'search-limit-reached',solution:cheapest,leastDisruptive:'may-not-be-least-disruptive'};}
