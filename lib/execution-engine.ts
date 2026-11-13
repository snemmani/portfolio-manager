import {fundamentalCheck} from './fundamental-policy';
import {saleAssessment} from './sale-assessment';
import {partialQuantity,decisionAction,DEFAULT_TRADE_POLICY} from './trade-policy';
import {eventSafetyFor} from './event-policy';
import {recheckCandidate} from './discovery-review';
import {pricePlan} from './technicals';
import {planDiscovery} from './discovery';
const result=(data:any,httpStatus=200)=>httpStatus===200?data:{...data,httpStatus};
export function executionFromContext(context:any,technical:any,{ticker,portfolio,intent='recommended',budget}:any){
 const now=Date.now(),sessionKnown=Number.isFinite(technical.sessionStart)&&Number.isFinite(technical.sessionEnd);
 technical={...technical,sessionOpen:sessionKnown?now/1000>=technical.sessionStart&&now/1000<technical.sessionEnd:technical.sessionOpen,fresh:technical.fresh&&now/1000-technical.quoteTime<=1200&&now/1000-technical.quoteTime>=-60&&(!technical.lastBarTime||now/1000-(technical.lastBarTime+300)<=1200)};
 const {snap,report,live,rulesBased}=context;let h=snap.holdings.find((h:any)=>h.ticker===ticker&&h.portfolio===portfolio);const p=snap.portfolios.find((p:any)=>p.name===portfolio);
 const discovery=live?.discovery||(report?.discovery_json?JSON.parse(report.discovery_json):null),rawCandidate=discovery?.candidates?.find((c:any)=>c.ticker===ticker),c=rawCandidate?recheckCandidate(rawCandidate,rulesBased):null;
 if(!h&&!c)return result({error:'Select a current holding or a screened candidate.'},404);
 if(intent==='exit'&&!h)return result({error:'An exit scenario requires an existing holding in the selected portfolio.'},400);
 if(intent==='profit'){
  if(!h||decisionAction(h)!=='Profit review'||h.nonDiscretionary||h.invalid)return result({error:'There is no current profit-taking review for this holding.'},409);
  h={...h,action:'Profit review'};
 }
 const expected=h?.currency||c?.currency;
 if(technical.currency!==expected)return result({error:'Market currency mismatch; no order draft.'},502);
 const recs=JSON.parse(report?.recommendations_json||'[]'),ideas=JSON.parse(report?.new_stock_ideas_json||'[]'),idea=ideas.find((i:any)=>i.portfolio===portfolio&&i.ticker===ticker);
 const researchFresh=report?.as_of&&Date.now()-Date.parse(report.as_of)<=6*3600000;
 let side='none',authorized=false,quantity:number|null=null,reason='No verified trade action for this position.';
 if(h){
 if(intent==='exit'){side='sell';authorized=!h.invalid&&!h.nonDiscretionary;quantity=h.shares;reason='Full-exit scenario explicitly selected by you.';}
 else if(h.action==='Trim'){side='sell';authorized=!h.invalid&&p?.complete;const rate=h.fx;const currentValue=rate&&technical.price?h.shares*technical.price*rate:null;const total=currentValue!==null?p.value+(currentValue-(h.value||0)):null;const excess=total!==null&&currentValue!==null?Math.max(0,currentValue-total*.15):0;const unit=technical.price&&rate?technical.price*rate:null;const raw=unit?excess/unit:0;quantity=Math.min(h.shares,h.currency==='INR'?Math.ceil(raw):Math.ceil(raw*10000)/10000);reason='Verified concentration trim toward the 15% position cap.';}
 else if(['Profit review','Trim review','Exit review'].includes(h.action)){side='sell';const policy=snap.tradePolicy||DEFAULT_TRADE_POLICY,stagePct=h.action==='Profit review'&&technical.extension?.trimPct?Math.min(policy.trimPct,technical.extension.trimPct):policy.trimPct;quantity=partialQuantity(h,{...policy,trimPct:stagePct});reason='Review scenario only; a sale requires a supported justification.';}
 else if(h.action==='Add candidate'){side='buy';authorized=rulesBased?eventSafetyFor(discovery,ticker).clear:!!researchFresh&&recs.some((r:any)=>r.portfolio===portfolio&&r.ticker===ticker&&['buy','add'].includes(r.action));reason=rulesBased?authorized?'Financial and portfolio rules pass; the event check is current. The company investment case must also pass.':eventSafetyFor(discovery,ticker).reason:authorized?'Existing holding passes the purchase screen and the company investment review.':'Purchase screen is conditional; the company review does not support buying more.';}
 }else if(c){side=c.status==='rejected'?'none':'buy';authorized=rulesBased?c.status==='eligible'&&!!p?.complete&&Date.now()-Date.parse(c.ruleAsOf||discovery.asOf)<=6*3600000&&eventSafetyFor(discovery,ticker).clear:!!researchFresh&&c.status==='eligible'&&idea?.decision==='enter'&&!!p?.complete;reason=rulesBased?authorized?'Financial screening and event checks pass. The entry is capped at 5% and still needs a valid technical setup.':c.status!=='eligible'?(c.gateReasons?.join(' ')||'The financial screening checks have not passed.'):Date.now()-Date.parse(c.ruleAsOf||discovery.asOf)>6*3600000?'The financial screen needs refreshing.':eventSafetyFor(discovery,ticker).reason:authorized?'Screen and the company investment review support a conditional new entry.':'Watch/review candidate: technical levels are conditional only.';}
 const investment=fundamentalCheck(discovery,ticker,side==='sell'?undefined:technical.price,h?.fundamentals?.date||c?.metrics?.statementDate,now,side==='sell'?'business':'purchase');
 let purchaseReturn=investment.returnPotential;
 if(side==='buy'&&investment.clear&&investment.warnings?.length)reason=`Core checks pass with warnings. Position size is capped at ${investment.positionCapPct}% while these risks remain.`;
 if(side==='buy'&&!investment.clear){authorized=false;reason=investment.reason;}
 if(side==='buy'&&snap.portfolios.some((p:any)=>!p.complete)){authorized=false;reason='Household prices or records are incomplete; exposure cannot be verified.';}
 if(side==='buy'){const gate=snap.buyGates?.[JSON.stringify([portfolio,ticker])];if(gate&&!gate.allowed){authorized=false;reason=gate.reasons.join(' ');}else if(gate?.active&&gate.target&&technical.price>gate.target){authorized=false;reason='The refreshed price is above the re-entry price condition.';}}
 let assessment=h&&side==='sell'?saleAssessment(h,p,technical,snap.tradePolicy||DEFAULT_TRADE_POLICY,intent,quantity):null;
 if(assessment?.kind==='profit'){
  const event=eventSafetyFor(discovery,ticker);
  if(!investment.clear){assessment.reviewable=false;assessment.justified=false;assessment.checks.unshift(investment.status==='missing'?'A current, source-backed company investment review is required before approving a profit-taking sale.':`Company investment review blocks profit-taking approval: ${investment.reason}`);}
  if(!event.clear){assessment.reviewable=false;assessment.justified=false;assessment.checks.unshift(event.status==='unknown'?'Current company news and event coverage is unavailable or stale. Profit-taking approval waits for a fresh check.':`Profit-taking approval is paused by the company-event check: ${event.reason}`);}
  authorized=assessment.justified;reason=assessment.reasons.join(' ');
 }
 if(context.expiresAt&&Date.parse(context.expiresAt)<now){authorized=false;reason='Review snapshot expired; refresh before acting.';}
 const plan=pricePlan(technical,{side,authorized,locked:h?.nonDiscretionary,manualExit:intent==='exit',kind:h?.action==='Profit review'?'profit':h?.action==='Trim'?'concentration':undefined});
 if(side==='buy'&&plan.limit!==null){const valuation=fundamentalCheck(discovery,ticker,plan.limit,h?.fundamentals?.date||c?.metrics?.statementDate,now);purchaseReturn=valuation.returnPotential;if(!valuation.clear){authorized=false;plan.authorized=false;plan.canDraft=false;plan.status='Buying paused — fundamental review or valuation';reason=valuation.reason;plan.reasons.push(reason);}}
 if(side==='buy'&&authorized&&p){
 const sizing=live||{discovery,ideas:JSON.parse(report?.new_stock_ideas_json||'[]')};
 const available=Math.max(0,Math.min(Number(budget||p.cash),p.cash));
 if(!Number.isFinite(available))return result({error:'Invalid budget'},400);
 if(plan.limit!==null){
 const liveDiscovery={...(sizing.discovery||{asOf:snap.asOf,candidates:[],fx:snap.fx}),combinedTotal:snap.totals.value,holdingRecommendations:sizing.holdingRecommendations||[],reportAsOf:sizing.reportAsOf};
 // Sizing uses the same exposure/budget engine, substituting only this limit.
 liveDiscovery.candidates=(liveDiscovery.candidates||[]).map((x:any)=>x.ticker===ticker?{...x,price:plan.limit}:x);
 const adjustedHoldings=snap.holdings.map((x:any)=>x.ticker===ticker&&x.portfolio===portfolio?{...x,price:plan.limit}:x);
 const sized=planDiscovery(p,adjustedHoldings,available,h?.currency==='USD'||c?.currency==='USD'?'US':'India',liveDiscovery,sizing.ideas||[]);quantity=sized.allocations.find((x:any)=>x.ticker===ticker)?.quantity||0;
 }
 }
 if(!quantity||quantity<=0){plan.canDraft=false;if(side==='sell'&&intent!=='exit'&&authorized){plan.status='Position now within cap — no trim quantity';plan.reasons.push('The refreshed price no longer yields a positive concentration-trim quantity.');}}
 if(h?.invalid||!p?.complete){plan.canDraft=false;plan.reasons.push('Reconcile the ledger/corporate action before sizing a trade.');}
 if(!rulesBased&&!researchFresh&&side==='buy'){plan.canDraft=false;plan.reasons.push('Research must be refreshed before a buy draft.');}
 if(assessment&&!assessment.justified&&assessment.kind!=='locked'){plan.canDraft=false;plan.status='Review needed — no sale proposed';}
 if(assessment&&investment.review)assessment.outlook=investment.clear?investment.review.summary:investment.reason;
 const saleDetails=assessment?{...assessment,illustrative:assessment.illustrative||!plan.canDraft,financialEvidence:h?.fundamentals||null,researchContext:{asOf:report?.as_of||null,fresh:!!researchFresh,review:recs.find((r:any)=>r.portfolio===portfolio&&r.ticker===ticker)||null}}:null;
 return result({fundamentalReview:investment.review,returnPotential:purchaseReturn,saleAssessment:saleDetails,tradePolicy:snap.tradePolicy,ticker,portfolio:portfolio||null,intent,technical,plan:{...plan,quantity,decisionReason:reason},researchAsOf:report?.as_of||null,refreshSeconds:60,limitations:['Quotes and 5-minute bars may be delayed. Confirm the broker quote, tick size, spread and session before submitting.','Levels are rule-based reference prices, not predictions. A limit order may not fill; a stop reference is not a guaranteed execution price.'],sources:[{title:'Yahoo Finance price history',url:technical.sourceUrl},{title:'RSI methodology',url:'https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/RSI'},{title:'ATR methodology',url:'https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/atr'}]});
}
