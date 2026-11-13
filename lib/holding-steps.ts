import {fundamentalCheck,FUNDAMENTAL_POLICY} from './fundamental-policy';
import {companyGateIndex} from './jarvis-gates';
import {eventSafetyFor} from './event-policy';
export function holdingStep(h:any,policy:any,snapshot:any={}){
 const step=(state:string,label:string,reason:string)=>({state,label,reason});
 if(h.nonDiscretionary)return step('locked','Locked', 'This holding is excluded from trading and research requests.');
 if(!policy)return step('unavailable','Checking next step…','Waiting for the current company-review status.');
 if(policy.unavailable)return step('unavailable','Review status unavailable','The review status could not be loaded. No purchase is approved; retry the status connection.');
 if(policy.annualDocumentsAvailable===false)return step('documents','Report library unavailable','The annual-report library must return before the current investment evidence can be checked.');
 const check=fundamentalCheck(policy,h.ticker,h.price,h.fundamentals?.date);
 const run=policy.current;
 if(['queued','running'].includes(run?.status)&&(run.scope||[]).includes(h.ticker))return step(run.status,run.status==='queued'?'Company review queued':'Company review running',run.status==='queued'?'The company is queued for AI research. Existing investment and trade safeguards remain in force.':'The AI is reviewing this company. Existing investment and trade safeguards remain in force.');
 const saved=policy.fundamentalReviews?.[h.ticker];
 if(saved?.decision==='incomplete'&&!saved.sources?.length&&saved.gaps?.some((gap:string)=>/research attempt failed|research did not finish/i.test(gap)))return step('retry','Company review needs retry','The previous review stopped before establishing an investment case. Run company research again; no purchase is approved.');
 if(check.status==='missing')return step('missing','Company research pending',check.reason);
 if(check.status==='stale')return step('stale','Research update needed',check.reason);
 if(check.status==='reject')return step('reject','Case not supported',check.reason);
 if(check.status==='financial-reconciliation')return step('financial-reconciliation','Financial assumptions need reconciliation',check.reason);
 if(check.status==='return-reconciliation')return step('return-reconciliation','Return assumptions need reconciliation',check.reason);
 if(check.status==='return-pending')return step('return-pending','Return estimate pending',check.reason);
 if(check.status==='return')return step('return','Below the return hurdle',check.reason);
 if(check.status==='incomplete'||check.status==='watch'&&!check.review?.valuation?.maxEntry){
  const reasons=[check.reason,...(check.blockers||[]),...(check.review?.blockingReasons||[])].filter(Boolean),valuation=reasons.length>0&&reasons.every((s:string)=>/valuation|maximum entry|buy ceiling/i.test(s));
  return step('incomplete',valuation?'Valuation incomplete':'Evidence incomplete',check.reason);
 }
 if(check.status==='valuation')return step('valuation','Waiting for entry price',check.reason);
 if(check.status==='watch')return step('watch','Risk review needed',check.reason);
 if(!check.clear)return step('incomplete','Evidence incomplete',check.reason);
 if(h.invalid||h.quote?.stale||!Number.isFinite(h.price)||snapshot.portfolios?.some((p:any)=>!p.complete))return step('data','Price / records need refresh','Fresh prices and complete portfolio records are required before sizing a purchase.');
 if(h.buyGate&&!h.buyGate.allowed)return step('cooldown','Re-entry conditions pending',h.buyGate.reasons.join(' '));
 const event=eventSafetyFor(policy,h.ticker);
 if(!event.clear)return step('events','Company event check pending',event.reason);
 if(h.action!=='Add candidate')return step('financial','Financial / position checks pending',h.reasons?.join(' ')||'The current holding or position rules do not support additions.');
 return step('trade','Trade checks pending','Company research and valuation pass. Cash, exposure, current quotes and a valid technical setup must still pass before a purchase can be proposed.');
}
/** Display metadata only: preserve the executable action, trade gates and amounts. */
export function withHoldingSteps(snapshot:any,context:any){
 if(!snapshot)return snapshot;
 const policy=context?{...context,fundamentalPolicy:FUNDAMENTAL_POLICY,companyGates:companyGateIndex([],snapshot.holdings)}:null;
 return {...snapshot,holdings:snapshot.holdings.map((h:any)=>({...h,purchaseStep:holdingStep(h,policy,snapshot)}))};
}
