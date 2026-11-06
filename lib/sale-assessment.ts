import {saleImpact,partialQuantity,profitFingerprint,DEFAULT_TRADE_POLICY} from './trade-policy';
export function saleAssessment(h:any,p:any,technical:any,policy=DEFAULT_TRADE_POLICY,intent='recommended',quantity?:number|null){
 if(h.nonDiscretionary)return {kind:'locked',justified:false,reviewable:false,illustrative:true,impact:null,reasons:['This employer share-plan holding is excluded from selling and re-entry proposals.'],checks:[] as string[],thesisNotes:[],outlook:'Holding restriction takes priority.'};
 const price=technical.price,profit=h.profitReview,review=['Trim review','Exit review'].includes(h.baseAction||h.action);
 const kind=intent==='exit'?'manual':h.action==='Trim'?'concentration':h.action==='Profit review'?'profit':review?'financial':'none';
 const q=quantity??(['profit','financial'].includes(kind)?partialQuantity(h,policy):null),impact=q?saleImpact(h,p,q,price):null;
 const reasons=[],checks=[];
 let justified=false,reviewable=false;
 if(kind==='concentration'){justified=true;reasons.push('Reduce the holding to the 15% portfolio limit. This limits the damage one company can do to the portfolio, even if selling realises a loss.');checks.push('The business outlook has not been proven negative. The reason for this sale is concentration risk.');}
 else if(kind==='manual'){justified=true;reasons.push('This full-exit scenario was selected by you. It is not an independently verified recommendation to exit.');}
 else if(kind==='profit'){
  reasons.push(`The gain reached your ${policy.gainThresholdPct}% review threshold. That alone is not a reason to sell.`);
  const currentGain=h.avg>0?(price/h.avg-1)*100:null;
  if(currentGain===null||currentGain+1e-8<policy.gainThresholdPct)checks.push('The refreshed price no longer reaches your profit-review threshold.');
  // Satellite profit-taking needs over-extension on the daily/weekly structure, not just a gain.
  const ext=technical.extension,extended=ext?ext.stage>0:technical.rsi14>=70||(technical.atr14>0&&technical.sma20>0&&price-technical.sma20>=2*technical.atr14);
  if(!extended)checks.push('No over-extension signal (200-day extension ≥ 25%, weekly RSI ≥ 75, daily RSI ≥ 75 at a 52-week high, or climax volume). Keep holding instead of trimming solely because of the gain.');
  else reasons.push(ext?`Over-extended: ${ext.signals.join(' ')} Staged trim: ${ext.trimPct}% of the shares. A pullback is not guaranteed.`:`The price is extended: RSI ${technical.rsi14}; price ${price}, 20-day average ${technical.sma20}, daily ATR ${technical.atr14}. A partial sale can reduce the amount exposed to a pullback; a pullback is not guaranteed.`);
  if(profit?.cooldownUntil)checks.push('A recent recorded trade is still within your waiting period. Wait before another profit-taking sale.');
  if(!impact||impact.grossPnl<=0)checks.push('This proposed FIFO sale does not show a positive profit, or its cost basis cannot be verified.');
  if(!p?.complete||h.invalid||h.quote?.stale)checks.push('Current prices and reconciled portfolio records are required.');
  reviewable=extended&&!checks.length;
  justified=reviewable&&!!profit?.approved;
  if(reviewable&&!profit?.approved)checks.push('Review the company outlook and approve this specific profit-taking assessment before enabling a sale plan.');
 }
 else if(kind==='financial'){reasons.push('The financial concern needs investigation before a sale is justified. A single annual cash-flow ratio does not establish that the investment case has failed.');checks.push(...h.reasons.filter((r:string)=>!/Latest annual evidence/.test(r)));}
 else reasons.push('No sale is proposed by the current checks.');
 if(['concentration','manual'].includes(kind)&&!impact){justified=false;checks.push('FIFO cost basis is incomplete; reconcile the purchase records before selling.');}
 if(impact&&impact.grossPnl<0)checks.push('This sale would realise a loss. The justification must be the risk reduction or a changed investment case—not an assumption that the price will recover after selling.');
 if(kind!=='none'){checks.push('Forward returns and recovery prices are not established by these figures. Stored thesis conditions have not been verified automatically.');}
 return {reviewToken:profitFingerprint(h,policy),kind,justified,reviewable,illustrative:!justified,impact,reasons,checks,thesisNotes:(h.notes||[]).slice(-3),outlook:'Current financial evidence and flagged events are available; a complete forward business outlook is unverified.'};
}
