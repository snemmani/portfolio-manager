import {fundamentalCheck} from './fundamental-policy';
import {eventSafetyFor} from './event-policy';
import {recheckCandidate} from './discovery-review';
import { isStale, RULES } from './engine';
export function validateDiscovery(discovery:any,snapshot:any){
 if(!discovery||!Array.isArray(discovery.candidates)||discovery.candidates.length>2000||!Array.isArray(discovery.screens)||discovery.screens.length>30||!Array.isArray(discovery.errors)||discovery.errors.length>200)throw Error('Invalid discovery payload');
 if(!Number.isFinite(Date.parse(discovery.asOf))||Math.abs(Date.now()-Date.parse(discovery.asOf))>6*3600000)throw Error('Discovery is stale');
 const held=new Set(snapshot.holdings.map((h:any)=>h.ticker)),seen=new Set();
 const candidates=discovery.candidates.map((c:any)=>{
 if(!c||typeof c.ticker!=='string'||!/^[A-Z0-9.&^-]{1,25}(\.NS)?$/.test(c.ticker)||held.has(c.ticker)||c.ticker==='ORCL'||seen.has(c.ticker)||!['IN','US'].includes(c.market)||!['A','B','C'].includes(c.category)||!['eligible','watchlist','rejected'].includes(c.status)||!Array.isArray(c.matchedScreens)||!c.matchedScreens.length)throw Error('Invalid new-stock candidate');
 if((c.market==='IN')!==c.ticker.endsWith('.NS'))throw Error('Candidate market mismatch');seen.add(c.ticker);
 let status=c.status;const gateReasons=Array.isArray(c.gateReasons)?c.gateReasons.slice(0,15).map(String):[];
 if(!(c.price>0)||!Number.isFinite(c.price)||isStale(c.quoteTime,Date.now(),c.currency)||c.currency!==(c.market==='IN'?'INR':'USD')){if(status!=='rejected')status='watchlist';gateReasons.push('Fresh quote and matching currency required.');}
 const m={...(c.metrics||{})};
 if(discovery.criteriaVersion==='jarvis-paginated-v2'&&(!Number.isFinite(Date.parse(c.screenedAt))||Date.now()-Date.parse(c.screenedAt)>6*3600000||Date.parse(c.screenedAt)>Date.now()+60000)){if(status!=='rejected')status='watchlist';gateReasons.push('Company financial checks are stale or their timestamp is unavailable.');}
 if(m.noInterestExpense===true&&!(c.metricEvidence?.interestCoverage?.inputs?.interestExpense===0&&c.metricEvidence?.interestCoverage?.inputs?.ebit>0))m.noInterestExpense=false;
 if(typeof m.earnings_growth_yoy==='number'&&m.earnings_growth_yoy<0){status='rejected';gateReasons.push('Negative earnings growth fails the Jarvis forward-risk gate.');}
 if(m.eps_ttm>0&&typeof m.eps_forward==='number'&&m.eps_forward<m.eps_ttm*.9){status='rejected';gateReasons.push('Forward EPS is more than 10% below trailing EPS.');}
 if(status==='eligible'&&((typeof m.cash_conversion_ratio==='number'&&m.cash_conversion_ratio<.8)||(typeof m.revenue_growth_yoy==='number'&&m.revenue_growth_yoy<0))){status='watchlist';gateReasons.push('Cash conversion or revenue growth needs review.');}

 if(status==='eligible'&&(c.sector==='Financials'||m.revenue_growth_yoy===null||m.revenue_growth_yoy===undefined||m.earnings_growth_yoy===null||m.earnings_growth_yoy===undefined||m.cash_conversion_ratio===null||m.cash_conversion_ratio===undefined)){status='watchlist';gateReasons.push('Required financial or banking checks are incomplete.');}
 return recheckCandidate({...c,metrics:m,status,gateReasons,sourceUrl:'https://finance.yahoo.com/quote/'+encodeURIComponent(c.ticker)+'/'},discovery.criteriaVersion==='jarvis-paginated-v2');
 });
 return {...discovery,candidates};
}
export function validateIdeas(ideas:any,snapshot:any){
 if(ideas===undefined)return [];
 if(!Array.isArray(ideas)||ideas.length>120)throw Error('Invalid new-stock ideas');
 const candidates=new Map((snapshot.discovery?.candidates||[]).map((c:any)=>[c.ticker,c]));const seen=new Set();
 return ideas.map((idea:any)=>{
 const c:any=candidates.get(idea.ticker),p=snapshot.portfolios.find((p:any)=>p.name===idea.portfolio),key=idea.portfolio+'\0'+idea.ticker;
 if(!c||!p||seen.has(key)||!['enter','watch','reject'].includes(idea.decision)||!['low','medium','high'].includes(idea.conviction)||!['thesis','driver','risk','portfolioFit'].every(k=>typeof idea[k]==='string'&&idea[k].length>0&&idea[k].length<=3000))throw Error('Unknown or invalid discovery recommendation');seen.add(key);
 let decision=idea.decision;
 if(decision==='enter'&&(c.status!=='eligible'||!p.complete||p.cash<=0||c.sector==='Financials'||isStale(c.quoteTime,Date.now(),c.currency)))decision='watch';
 const targetWeightPct=Number.isFinite(idea.targetWeightPct)?Math.max(5,Math.min(idea.conviction==='low'?5:15,idea.targetWeightPct)):5;
 return {...idea,decision,targetWeightPct,market:c.market,category:c.category,screenStatus:c.status};
 });
}
export function planDiscovery(portfolio:any,holdings:any[],budget:number,market:string,discovery:any,ideas:any[]){
 const available=Math.max(0,Math.min(Number.isFinite(budget)?budget:0,portfolio.cash));let remaining=available;
 const allocations:any[]=[],skipped:any[]=[];
 const selected=(ideas||[]).filter(i=>i.portfolio===portfolio.name&&i.market===(market==='India'?'IN':'US'));
 if(discovery?.householdComplete===false)return {budget:available,reserve:available,allocations,skipped,reason:'Household prices or records are incomplete; household exposure cannot be verified.'};
 if(!Number.isFinite(portfolio.value)||portfolio.value<=0||!Number.isFinite(portfolio.cash))return {budget:0,reserve:0,allocations,skipped,reason:'A finite portfolio value and cash balance are required.'};
 if(!portfolio.complete)return {budget:available,reserve:available,allocations,skipped,reason:'Unpriced holdings prevent reliable sizing.'};
 const own=holdings.filter(h=>h.portfolio===portfolio.name),combined=discovery?.combinedTotal||holdings[0]?.combinedTotal||portfolio.value;
 let cyclical=own.filter(h=>['Industrials','Commodities'].includes(h.sector)).reduce((s,h)=>s+(h.value||0),0),commodity=own.filter(h=>h.sector==='Commodities').reduce((s,h)=>s+(h.value||0),0),valueCategory=own.filter(h=>h.category==='C').reduce((s,h)=>s+(h.value||0),0);
 const candidates=selected.filter((i,index)=>i.decision==='enter'&&!own.some(h=>h.ticker===i.ticker)&&selected.findIndex(x=>x.ticker===i.ticker&&x.decision==='enter')===index).map(i=>{const c=discovery?.candidates?.find((c:any)=>c.ticker===i.ticker);return c?{...c,idea:i,isNew:true,existingValue:0,aggregateValue:holdings.filter(h=>h.ticker===c.ticker).reduce((sum,h)=>sum+(h.value||0),0),fx:c.currency==='INR'?1:discovery.fx}:null}).filter(Boolean);
 for(const h of own.filter(h=>h.action==='Add candidate'&&h.currency===(market==='India'?'INR':'USD')&&!h.nonDiscretionary)){
 const review=(discovery?.holdingRecommendations||[]).find((r:any)=>r.portfolio===portfolio.name&&r.ticker===h.ticker);
 const fresh=Number.isFinite(Date.parse(discovery?.reportAsOf))&&Date.now()-Date.parse(discovery.reportAsOf)<=6*3600000;
 const investment=fundamentalCheck(discovery,h.ticker,h.price,h.fundamentals?.date);if(!investment.clear){skipped.push({ticker:h.ticker,reason:investment.reason});continue;}
 const event=eventSafetyFor(discovery,h.ticker);
 if(discovery?.rulesBased){if(!event.clear){skipped.push({ticker:h.ticker,reason:event.reason});continue;}}
 else if(!fresh||!review||!['buy','add'].includes(review.action)){skipped.push({ticker:h.ticker,reason:!fresh?'A portfolio review from the last six hours is required before buying more.':!review?'The latest portfolio review did not assess whether to add to this holding.':`The portfolio review recommends ${review.action}, rather than buying more. ${review.reasons?.join(' ')||''}`});continue;}
 candidates.push({...h,isNew:false,existingValue:h.value,idea:{targetWeightPct:10,conviction:discovery?.rulesBased?'medium':review.confidence==='low'?'low':'medium',thesis:discovery?.rulesBased?h.reasons.join(' '):review.reasons.join(' ')},status:'eligible',quoteTime:h.quote?.time});
 }
 const discoveryFresh=Number.isFinite(Date.parse(discovery?.asOf))&&Date.now()-Date.parse(discovery.asOf)<=6*3600000;
 for(const c of candidates as any[]){
 const blocked:string[]=[];const fx=c.currency==='INR'?1:c.fx;
 const investment=fundamentalCheck(discovery,c.ticker,c.price,c.metrics?.statementDate||c.fundamentals?.date);if(!investment.clear)blocked.push(investment.reason);
 if(discovery?.rulesBased){const event=eventSafetyFor(discovery,c.ticker);if(!event.clear)blocked.push(event.reason);const gate=discovery.buyGates?.[JSON.stringify([portfolio.name,c.ticker])];if(gate&&!gate.allowed)blocked.push(...gate.reasons);}
 if(!Number.isFinite(c.idea?.targetWeightPct)||c.idea.targetWeightPct<=0||c.idea.targetWeightPct>15)blocked.push('A valid position target within the 15% cap is required.');
 if(c.status!=='eligible')blocked.push(`Screen result is ${c.status}; an eligible screen is required.`);
 if(!Number.isFinite(c.price)||c.price<=0)blocked.push('A usable current stock price is unavailable.');
 if(!Number.isFinite(fx)||fx<=0)blocked.push('A fresh USD/INR conversion rate is unavailable.');
 if(c.stale||isStale(c.quoteTime,Date.now(),c.currency))blocked.push('The quote is stale or its currency is unverified; refresh market prices.');
 if(c.isNew&&!(c.ruleAsOf?Number.isFinite(Date.parse(c.ruleAsOf))&&Date.now()-Date.parse(c.ruleAsOf)<=6*3600000:discoveryFresh))blocked.push('Screening research is older than six hours or unavailable; refresh research.');
 if(c.isNew&&c.researchPrice&&c.price>c.researchPrice*1.05)blocked.push(`Price is ${((c.price/c.researchPrice-1)*100).toFixed(1)}% above the research price; the entry must be rechecked above 5%.`);
 if(blocked.length){skipped.push({ticker:c.ticker,reason:blocked.join(' '),reasons:blocked});continue;}
 const researchCap=investment.positionCapPct||15,effectiveTarget=Math.min(c.idea.targetWeightPct,researchCap);
 let cap=Math.min(remaining,Math.max(0,portfolio.value*Math.min(effectiveTarget,RULES.single)/100-c.existingValue),Math.max(0,combined*.15-(c.aggregateValue||0)));
 const reentry=discovery?.buyGates?.[JSON.stringify([portfolio.name,c.ticker])];if(reentry?.active&&c.lastSaleShares>0)cap=Math.min(cap,c.lastSaleShares*c.price*fx);
 if(c.idea.conviction==='low')cap=Math.min(cap,Math.max(0,portfolio.value*.05-c.existingValue));
 if(['Industrials','Commodities'].includes(c.sector))cap=Math.min(cap,Math.max(0,portfolio.value*.25-cyclical));
 if(c.sector==='Commodities')cap=Math.min(cap,Math.max(0,portfolio.value*.20-commodity));
 if(c.category==='C')cap=Math.min(cap,Math.max(0,portfolio.value*.15-valueCategory));
 const unit=c.price*fx,quantity=c.currency==='INR'?Math.floor(cap/unit):Math.floor(cap/unit*10000)/10000,amount=quantity*unit;
 // Whole-share rounding must not breach caps; a new entry below meaningful size is reserved.
 const minimumPct=Math.min(c.idea.conviction==='low'?3:5,researchCap),shareStep=c.currency==='INR'?1:.0001;
 const requiredShares=Math.max(0,(portfolio.value*minimumPct/100-c.existingValue)/unit),roundedMinimum=Math.floor((requiredShares+1e-9)/shareStep)*shareStep;
 if(quantity<=0||quantity+1e-9<roundedMinimum){
 const reasons:string[]=[],inr=(v:number)=>'₹'+v.toLocaleString('en-IN',{maximumFractionDigits:2});
 const needed=Math.max(0,portfolio.value*minimumPct/100-c.existingValue);
 const explain=(label:string,room:number)=>{if(room<needed||room<unit*(c.currency==='INR'?1:.0001))reasons.push(`${label}: ${inr(Math.max(0,room))} available; ${needed>0?inr(needed)+' needed to reach the '+minimumPct+'% minimum position':inr(unit*(c.currency==='INR'?1:.0001))+' needed for the smallest share increment'}.`);};
 explain('Remaining cash budget',remaining);explain(`Position target (${Math.min(effectiveTarget,RULES.single)}%; maximum 15%)`,portfolio.value*Math.min(effectiveTarget,RULES.single)/100-c.existingValue);explain('Household single-stock cap (15%)',combined*.15-(c.aggregateValue||0));
 if(c.idea.conviction==='low')explain('Low-conviction cap (5%)',portfolio.value*.05-c.existingValue);
 if(['Industrials','Commodities'].includes(c.sector))explain('Cyclical exposure cap (25%)',portfolio.value*.25-cyclical);
 if(c.sector==='Commodities')explain('Commodity exposure cap (20%)',portfolio.value*.20-commodity);
 if(c.category==='C')explain('Category C exposure cap (15%)',portfolio.value*.15-valueCategory);
 if(c.currency==='INR'&&cap<unit)reasons.push(`One whole share costs ${inr(unit)}; only ${inr(cap)} can be allocated under these limits.`);
 else if(c.existingValue+amount<portfolio.value*minimumPct/100)reasons.push(`After share rounding, the position would be ${((c.existingValue+amount)/portfolio.value*100).toFixed(2)}%; at least ${minimumPct}% is required.`);
 skipped.push({ticker:c.ticker,reason:reasons.join(' '),reasons});continue;}
 allocations.push({researchWarnings:investment.warnings||[],researchPositionCapPct:researchCap,ticker:c.ticker,quantity,amount,price:c.price,currency:c.currency,category:c.category,reason:c.idea.thesis,isNew:c.isNew,sourceUrl:c.sourceUrl,quoteTime:c.quoteTime});remaining-=amount;
 if(['Industrials','Commodities'].includes(c.sector))cyclical+=amount;if(c.sector==='Commodities')commodity+=amount;if(c.category==='C')valueCategory+=amount;
 }
 return {budget:available,reserve:Math.max(0,remaining),allocations,skipped,reason:allocations.length?'Entry and addition plans from financial, cash and portfolio rules. Verify the thesis and current execution price before placing orders.':'Retain cash: no supported entry fits the financial, event, market, budget and exposure checks.'};
}
