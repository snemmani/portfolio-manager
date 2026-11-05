export function tradeSummary(data:any,expected:'buy'|'sell',now=Date.now()){
 const p=data?.plan,t=data?.technical;
 if(!p||!t)return {show:false,message:'Price plan is unavailable. Retry when market data returns.'};
 if(p.side!==expected)return {show:false,message:'The current position checks do not support this action. Review the updated holding.'};
 if(!p.authorized)return {show:false,message:p.decisionReason||'This trade has not been approved.'};
 if(!Number.isFinite(p.quantity)||!Number.isFinite(p.limit)||!(p.quantity>0)||!(p.limit>0))return {show:false,message:p.status==='Unavailable'?'Not enough market data to set a quantity and price.':p.reasons?.at(-1)||'No purchase or sale can be sized within the current limits.'};
 const quoteCurrent=Number.isFinite(t.quoteTime)&&t.quoteTime*1000<=now+60000&&t.quoteTime*1000>=now-20*60000;
 const ready=!!(p.canDraft&&t.sessionOpen&&quoteCurrent&&Date.parse(p.validUntil)>now),expired=p.canDraft&&t.sessionOpen&&Date.parse(p.validUntil)<=now;
 return {show:true,quantity:p.quantity,limit:p.limit,currency:t.currency,quoteTime:t.quoteTime,ready,label:ready?'Suggested limit order':expired?'Refresh needed — plan expired':t.sessionOpen?'Conditional plan — wait':'Market closed — preview',message:ready?'Confirm the live broker price before ordering.':expired?'Refresh the quantity and price before placing an order.':p.blockers?.length?p.blockers.join(' '):p.status};
}
