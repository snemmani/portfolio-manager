export const DEFAULT_TRADE_POLICY={profitEnabled:true,gainThresholdPct:25,trimPct:20,cooldownDays:14,reentryPullbackPct:8};
export type TradePolicy=typeof DEFAULT_TRADE_POLICY;
const finite=(v:any)=>typeof v==='number'&&Number.isFinite(v);
export function validateTradePolicy(value:any):TradePolicy{
 if(!value||typeof value.profitEnabled!=='boolean')throw Error('Choose whether profit-taking reviews are enabled.');
 const limits={gainThresholdPct:[5,500],trimPct:[1,50],cooldownDays:[1,180],reentryPullbackPct:[1,50]};
 for(const [key,[min,max]] of Object.entries(limits)){if(!finite(value[key])||value[key]<min||value[key]>max||(key==='cooldownDays'&&!Number.isInteger(value[key])))throw Error(`${key} must be ${key==='cooldownDays'?'a whole number ':''}between ${min} and ${max}.`);}
 return Object.fromEntries(Object.keys(DEFAULT_TRADE_POLICY).map(k=>[k,value[k]])) as TradePolicy;
}
export const tradeKey=(portfolio:string,ticker:string)=>JSON.stringify([portfolio,ticker]);
export function tradeTime(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)?Date.parse(value+'T23:59:59+05:30'):Date.parse(value);}
export function partialQuantity(h:any,policy:TradePolicy){const raw=h.shares*policy.trimPct/100;return h.currency==='INR'?Math.floor(raw+1e-9):Math.floor(raw*10000+1e-7)/10000;}
export function saleImpact(h:any,p:any,quantity:number,price:number){
 if(h.invalid||!finite(quantity)||quantity<=0||quantity>h.shares+1e-8||!finite(price)||price<=0)return null;
 let remaining=quantity,cost=0;const lots=[];
 for(const l of h.lots||[]){if(!finite(l.cost)||l.cost<0||!finite(l.shares)||l.shares<=0)return null;const q=Math.min(remaining,l.shares);if(q>0){cost+=q*l.cost;lots.push({date:l.date,shares:q,cost:l.cost});remaining-=q;}if(remaining<1e-8)break;}
 if(remaining>1e-8)return null;
 const proceeds=quantity*price,pnl=proceeds-cost,fx=h.fx,currentValue=finite(fx)&&fx>0?h.shares*price*fx:null;
 const total=currentValue!==null&&finite(p?.value)&&finite(h.value)?p.value+currentValue-h.value:null;
 return {quantity,price,currency:h.currency,averagePurchasePrice:finite(h.avg)&&h.avg>=0?h.avg:null,currentWeight:total&&total>0&&currentValue!==null?currentValue/total*100:null,cost,proceeds,grossPnl:pnl,pnlPct:cost>0?pnl/cost*100:null,breakEven:cost/quantity,remainingShares:Math.max(0,h.shares-quantity),remainingWeight:total&&total>0&&fx?(h.shares-quantity)*price*fx/total*100:null,lots,limitations:'FIFO estimate before fees and taxes. USD amounts use native USD cost; this is not an INR tax calculation.'};
}
export function profitFingerprint(h:any,policy:TradePolicy){return JSON.stringify([h.historyKey,policy]);}
export function profitReview(h:any,policy:TradePolicy,now=Date.now(),latched=false){
 const gain=finite(h.avg)&&h.avg>0&&finite(h.price)?(h.price/h.avg-1)*100:null;
 const latest=[h.lastBuy,h.lastSell].filter(Boolean).sort((a,b)=>tradeTime(b)-tradeTime(a))[0];const age=latest?now-tradeTime(latest):Infinity;
 return {triggered:policy.profitEnabled&&!h.nonDiscretionary&&!h.invalid&&!h.quote?.stale&&gain!==null&&(gain+1e-8>=policy.gainThresholdPct||(latched&&gain+1e-8>=Math.max(0,policy.gainThresholdPct-5))),gainPct:gain,quantity:partialQuantity(h,policy),threshold:policy.gainThresholdPct,cooldownUntil:age<policy.cooldownDays*86400000&&latest?new Date(tradeTime(latest)+policy.cooldownDays*86400000).toISOString():null};
}
export function reentryGate(h:any,policy:TradePolicy,review?:any,now=Date.now()){
 const saleTime=tradeTime(h.lastSell||''),age=now-saleTime;
 if(!h.lastSell||!Number.isFinite(saleTime))return {active:false,allowed:true,status:'none',reasons:[]};
 const until=new Date(saleTime+policy.cooldownDays*86400000).toISOString();
 if(age<0)return {active:true,allowed:false,status:'review',reasons:['The recorded sale date is in the future; reconcile it before buying.'],cooldownUntil:until};
 if(h.boughtAfterSale)return {active:false,allowed:age>=policy.cooldownDays*86400000,status:'completed',cooldownUntil:until,reasons:age<policy.cooldownDays*86400000?['A later purchase closed this episode; additional buying still waits until the sale waiting period ends.']:['A later purchase is already recorded. This re-entry episode is complete.']};
 if(age<policy.cooldownDays*86400000)return {active:true,allowed:false,status:'cooldown',cooldownUntil:until,reasons:[`Buying waits ${policy.cooldownDays} calendar days after the recorded sale.`]};
 if(age>180*86400000)return {active:false,allowed:true,status:'expired',reasons:['This 180-day re-entry watch has expired. Normal purchase checks still apply.']};
 const target=finite(h.lastSalePrice)&&h.lastSalePrice>0?h.lastSalePrice*(1-policy.reentryPullbackPct/100):null;
 const reasons=[];
 if(h.invalid||h.quote?.stale||!finite(h.price)||h.price<=0)reasons.push('Fresh prices and reconciled records are required.');
 if((h.quote?.splits||[]).some((s:any)=>tradeTime(s.date)>saleTime))reasons.push('A split or other recorded share adjustment makes the old sale price unsuitable for a re-entry comparison.');
 if(!target||h.price>target)reasons.push(`Wait for a price at least ${policy.reentryPullbackPct}% below the recorded sale price. This price condition does not guarantee a good investment.`);
 if(!review||review.fingerprint!==h.historyKey)reasons.push('Review why you sold and confirm that the current investment case supports considering a re-entry.');
 return {active:true,allowed:!reasons.length,status:reasons.length?'watch':'checks-passed',reasons,target,cooldownUntil:until};
}
export function decorateTrades(snap:any,policy:TradePolicy,reviews:any[]=[]){
 const buyGates:any={};
 const reentries=(snap.tradeHistory||[]).filter((h:any)=>h.lastSell&&!h.nonDiscretionary).map((h:any)=>{const review=reviews.find(r=>r.id===tradeKey(h.portfolio,h.ticker)&&r.kind==='reentry'),gate=reentryGate(h,policy,review);buyGates[tradeKey(h.portfolio,h.ticker)]=gate;return {...h,...gate,financialPass:h.action==='Add candidate',needsThesisReview:!review||review.fingerprint!==h.historyKey};});
 const holdings=snap.holdings.map((h:any)=>{const latch=reviews.some(r=>r.id===tradeKey(h.portfolio,h.ticker)&&r.kind==='profit-trigger'&&r.fingerprint===profitFingerprint(h,policy));const profit=profitReview(h,policy,Date.now(),latch),approval=reviews.find(r=>r.id===tradeKey(h.portfolio,h.ticker)&&r.kind==='profit'),approved=approval?.fingerprint===profitFingerprint(h,policy)&&Date.now()-Date.parse(approval.created_at)<86400000;
 const gate=buyGates[tradeKey(h.portfolio,h.ticker)];let action=h.action;const reasons=[...h.reasons];
 if(h.action==='Add candidate'&&gate&&!gate.allowed){action='Watch';reasons.unshift(...gate.reasons);}
 if(profit.triggered&&!gate?.active&&['Hold','Watch','Add candidate'].includes(h.action)){action='Profit review';reasons.unshift(`Your ${policy.gainThresholdPct}% profit-review threshold was reached. The current gain is ${profit.gainPct!.toFixed(1)}%. The review resets below ${Math.max(0,policy.gainThresholdPct-5)}%; a gain alone does not justify selling.`);}
 return {...h,baseAction:h.action,action,reasons,profitReview:{...profit,triggered:profit.triggered&&!gate?.active,approved},buyGate:gate};});
 return {...snap,holdings,tradePolicy:policy,buyGates,reentries:reentries.sort((a:any,b:any)=>tradeTime(b.lastSell)-tradeTime(a.lastSell)).slice(0,50)};
}
