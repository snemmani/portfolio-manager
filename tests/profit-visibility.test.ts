import assert from 'node:assert/strict';
import {decorateTrades,decisionAction,DEFAULT_TRADE_POLICY as policy,profitFingerprint,tradeKey} from '../lib/trade-policy';
import {mergeRecommendations} from '../lib/merge-recommendations';
import {saleAssessment} from '../lib/sale-assessment';
const realNow=Date.now,now=Date.parse('2026-11-11T08:00:00Z');Date.now=()=>now;
try{
 const p={name:'Test',value:100000,cash:10000,complete:true};
 const base:any={portfolio:'Test',ticker:'TANLA.NS',currency:'INR',shares:50,avg:100,price:126,value:6300,fx:1,lots:[{shares:50,cost:100,date:'2025-01-01'}],lastBuy:'2025-01-01',lastSell:'2026-11-03',lastSalePrice:130,historyKey:'original',boughtAfterSale:false,action:'Add candidate',reasons:['Financial checks pass.'],quote:{stale:false},risks:[]};
 const make=(h:any,reviews:any[]=[])=>decorateTrades({holdings:[h],portfolios:[p],tradeHistory:[h]},policy,reviews).holdings[0];
 const h=make(base),before=JSON.stringify(h);
 assert.equal(h.action,'Hold','Executable addition remains blocked');assert(h.profitReview.triggered);assert.equal(decisionAction(h),'Profit review');
 assert.match(h.profitReview.blockers.join(' '),/17 Nov 2026/);assert.match(h.profitReview.blockers.join(' '),/re-entry watch/);
 const cards=mergeRecommendations([h,{...h,portfolio:'Other'}],[{ticker:base.ticker,portfolio:base.portfolio,action:'hold',reasons:['Prior view'],risks:[]}]);
 assert.equal(cards.length,2);assert(cards.every(c=>c.action==='Profit review'));assert.equal(cards[0].holding.action,'Hold');assert.equal(JSON.stringify(h),before,'Display projection must not mutate execution input');
 const technical={price:126,rsi14:80,sma20:100,atr14:4};
 const approved=[{id:tradeKey(base.portfolio,base.ticker),kind:'profit',fingerprint:profitFingerprint(base,policy),created_at:new Date(now).toISOString()}];
 for(let days=0;days<=200;days++)for(const gain of [19.9,20,24.9,25,26,50])for(const latched of [false,true]){
  const lastSell=new Date(now-days*86400000).toISOString().slice(0,10),source={...base,lastSell,price:100+gain,value:(100+gain)*50};
  const reviews=latched?[{id:tradeKey(source.portfolio,source.ticker),kind:'profit-trigger',fingerprint:profitFingerprint(source,policy)}]:[];
  const held=make(source,reviews),trigger=gain>=25||latched&&gain>=20;
  assert.equal(held.profitReview.triggered,trigger);
  assert.equal(decisionAction(held)==='Profit review',trigger,'Watch age must not suppress a threshold review');
  if(trigger){
   const oldApproval=make(source,[...reviews,{...approved[0],fingerprint:profitFingerprint(source,policy)}]);
   const assessment=saleAssessment({...oldApproval,action:'Profit review'},p,{...technical,price:source.price},policy);
   if(held.buyGate.active||held.profitReview.cooldownUntil)assert(!assessment.reviewable&&!assessment.justified,'Visibility and old approvals cannot bypass a sale restriction');
  }
 }
 for(const patch of [{nonDiscretionary:true},{invalid:true},{quote:{stale:true}}]){
  const held=make({...base,...patch,action:patch.nonDiscretionary?'Locked':'Review'});assert(!held.profitReview.triggered);assert.notEqual(decisionAction(held),'Profit review');
 }
 for(const action of ['Trim','Trim review','Exit review']){const held=make({...base,action});assert.equal(decisionAction(held),action,'Concentration and financial review keep priority');}
 const reopened=make({...base,boughtAfterSale:true,lastBuy:'2026-11-10'});assert.equal(decisionAction(reopened),'Profit review');assert(reopened.profitReview.cooldownUntil);assert(!saleAssessment({...reopened,action:'Profit review'},p,technical,policy).reviewable,'A later purchase closes the watch but its trade cooldown still blocks selling');
 for(const patch of [{complete:false},{complete:true}]){
  const held=make({...base,lastSell:'2026-01-01'});const a=saleAssessment({...held,action:'Profit review'},patch,technical,policy);
  assert(!a.justified,'Visibility alone must not authorize a sale');if(!patch.complete)assert(!a.reviewable);
 }
 console.log('PASS: 2,412 profit visibility/age/hysteresis scenarios, independent portfolio cards, immutable execution inputs, stale/locked/invalid exclusion, higher-priority reviews and unchanged cooldown/re-entry/approval safeguards.');
}finally{Date.now=realNow}
