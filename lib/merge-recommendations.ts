import {fundamentalCheck} from './fundamental-policy';
import {eventSafetyFor} from './event-policy';
import {actionPriority,actionLabel,compareRecommendations} from './recommendation-order';
import {cardLines,cardText} from './card-copy';
const key=(r:any)=>JSON.stringify([r.portfolio,r.ticker]);
const family=(action:string)=>['buy','add','add candidate'].includes(action.toLowerCase())?'buy':action.toLowerCase();
function primaryAssessment(holding:any,research:any){
 if(!research)return {...holding,source:'signal'};
 const current={...holding,source:'signal'},review={...research,source:'codex'};
 if(holding.nonDiscretionary||holding.action==='Locked'||holding.invalid||holding.quote?.stale||holding.price===null)return current;
 if(holding.action==='Trim')return research.action==='trim'?review:current;
 if(['Exit review','Trim review','Profit review'].includes(holding.action))return current;
 if(['buy','add'].includes(research.action))return holding.action==='Add candidate'?review:current;
 if(research.action==='trim')return current; // An older report cannot reinstate a resolved concentration breach.
 if(holding.action==='Add candidate')return review; // A financial screen is not a research buy approval.
 return actionPriority(review.action)<actionPriority(current.action)?review:current;
}
export function decisionPriority(holding:any,research:any,primary:any){
 if(!research||family(holding.action)===family(research.action))return null;
 const actions={research:actionLabel(research.action),portfolio:actionLabel(holding.action)};
 if(holding.nonDiscretionary||holding.action==='Locked')return {...actions,title:'Holding restrictions take priority',reason:'This employer share-plan holding is excluded from trading, even if research suggests a change.'};
 if(holding.invalid||holding.quote?.stale||holding.price===null)return {...actions,title:'Check the data before trading',reason:'Current prices or holding records need checking. A research recommendation cannot clear that requirement.'};
 if(holding.action==='Trim'){
 const weight=typeof holding.weight==='number'&&Number.isFinite(holding.weight)?` ${holding.weight.toFixed(2)}% of ${holding.portfolio}`:' above the portfolio limit';
 return {...actions,title:'The 15% portfolio limit takes priority',reason:`This holding is${weight}. Reduce only the portion above the 15% limit and keep the rest.${research.action==='hold'?' The Hold recommendation supports keeping the remaining shares; it does not override the position limit.':''}`};
 }
 if(['Exit review','Trim review','Profit review'].includes(holding.action))return {...actions,title:'Financial concerns need review first',reason:'The current portfolio check found a concern that needs checking before following the research view. This is a review request, not an instruction to sell.'};
 if(['buy','add'].includes(research.action)&&holding.action!=='Add candidate')return {...actions,title:'Buying must pass the current checks',reason:'Research suggests buying, but the latest holding and financial checks do not support adding shares. No purchase is approved by this card.'};
 if(research.action==='trim')return {...actions,title:'The current position size takes priority',reason:'The latest portfolio check no longer calls for a concentration trim. The earlier research recommendation does not reinstate it.'};
 if(holding.action==='Add candidate')return {...actions,title:'A screening pass is not a buy approval',reason:`The financial screen found a possible addition, but the research recommendation is ${actionLabel(research.action)}. A buy needs both checks to support it.`};
 return {...actions,title:primary.source==='codex'?'The research concern takes priority':'The current portfolio concern takes priority',reason:cardText(primary.reasons?.[0]||'Review the supporting information before changing this holding.')};
}
export function mergeRecommendations(holdings:any[],research:any[],policy?:any){
 const reviews=new Map(research.map(r=>[key(r),r])),positions=new Map(holdings.map(h=>[key(h),h]));
 return [...positions.values()].map(holding=>{
  const review=reviews.get(key(holding));let primary;
  if(policy?.rulesBased&&holding.action==='Add candidate'){
   const event=eventSafetyFor(policy,holding.ticker);
   const investment=fundamentalCheck(policy,holding.ticker,holding.price,holding.fundamentals?.date),ready=event.clear&&investment.clear;
   primary={...holding,source:'signal',action:ready?'Buy':'Review',reasons:!investment.clear?[investment.reason,...holding.reasons]:event.clear?holding.reasons:[event.reason,...holding.reasons],confidence:ready?'Researched':'Limited'};
  }else primary=primaryAssessment(holding,review);
  const other=primary.source==='codex'?holding:review;
  const reasons=cardLines(primary.reasons||[]),otherReasons=cardLines(other?.reasons||[]).filter(line=>!reasons.includes(line));
  return {...holding,...primary,id:key(holding),value:holding.value,price:holding.price,currency:holding.currency,holding,research:review,
   reasons,risks:cardLines([...(holding.risks||[]),...(review?.risks||[])]),
   copyAction:primary.source==='signal'?primary.action:undefined,
   additionalReasons:otherReasons,
   additionalLabel:primary.source==='codex'?'Portfolio checks':review?`Research view: ${actionLabel(review.action)}`:null,
   assessmentsDiffer:!!review&&family(holding.action)!==family(review.action),
   decisionPriority:policy?.rulesBased&&holding.action==='Add candidate'?{research:review?actionLabel(review.action):'Not required',portfolio:primary.action,title:'Fundamentals establish the investment case; technicals control timing',reason:'Buying requires a current, source-backed company review and valuation, passing financial and event checks, available cash, exposure room and a valid technical price plan.'}:decisionPriority(holding,review,primary)
  };
 }).sort(compareRecommendations);
}
