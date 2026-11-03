import { isStale, RULES } from './engine';
export function validateDiscovery(discovery:any,snapshot:any){
 if(!discovery||!Array.isArray(discovery.candidates)||discovery.candidates.length>40||!Array.isArray(discovery.screens)||discovery.screens.length>30||!Array.isArray(discovery.errors)||discovery.errors.length>50)throw Error('Invalid discovery payload');
 if(!Number.isFinite(Date.parse(discovery.asOf))||Math.abs(Date.now()-Date.parse(discovery.asOf))>6*3600000)throw Error('Discovery is stale');
 const held=new Set(snapshot.holdings.map((h:any)=>h.ticker)),seen=new Set();
 const candidates=discovery.candidates.map((c:any)=>{
 if(!c||typeof c.ticker!=='string'||!/^[A-Z0-9.&^-]{1,25}(\.NS)?$/.test(c.ticker)||held.has(c.ticker)||c.ticker==='ORCL'||seen.has(c.ticker)||!['IN','US'].includes(c.market)||!['A','B','C'].includes(c.category)||!['eligible','watchlist','rejected'].includes(c.status)||!Array.isArray(c.matchedScreens)||!c.matchedScreens.length)throw Error('Invalid new-stock candidate');
 if((c.market==='IN')!==c.ticker.endsWith('.NS'))throw Error('Candidate market mismatch');seen.add(c.ticker);
 let status=c.status;const gateReasons=Array.isArray(c.gateReasons)?c.gateReasons.slice(0,15).map(String):[];
 if(!(c.price>0)||!Number.isFinite(c.price)||isStale(c.quoteTime,Date.now(),c.currency)||c.currency!==(c.market==='IN'?'INR':'USD')){if(status!=='rejected')status='watchlist';gateReasons.push('Fresh quote and matching currency required.');}
 const m=c.metrics||{};
 if(typeof m.earnings_growth_yoy==='number'&&m.earnings_growth_yoy<0){status='rejected';gateReasons.push('Negative earnings growth fails the Jarvis forward-risk gate.');}
 if(m.eps_ttm>0&&typeof m.eps_forward==='number'&&m.eps_forward<m.eps_ttm*.9){status='rejected';gateReasons.push('Forward EPS is more than 10% below trailing EPS.');}
 if(status==='eligible'&&((typeof m.cash_conversion_ratio==='number'&&m.cash_conversion_ratio<.8)||(typeof m.revenue_growth_yoy==='number'&&m.revenue_growth_yoy<0))){status='watchlist';gateReasons.push('Cash conversion or revenue growth needs review.');}

 if(status==='eligible'&&(c.sector==='Financials'||m.revenue_growth_yoy===null||m.revenue_growth_yoy===undefined||m.earnings_growth_yoy===null||m.earnings_growth_yoy===undefined||m.cash_conversion_ratio===null||m.cash_conversion_ratio===undefined)){status='watchlist';gateReasons.push('Required financial or banking checks are incomplete.');}
 return {...c,status,gateReasons,sourceUrl:'https://finance.yahoo.com/quote/'+encodeURIComponent(c.ticker)+'/'};
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
 if(!portfolio.complete)return {budget:available,reserve:available,allocations,skipped,reason:'Unpriced holdings prevent reliable sizing.'};
 const own=holdings.filter(h=>h.portfolio===portfolio.name),combined=discovery?.combinedTotal||holdings[0]?.combinedTotal||portfolio.value;
 let cyclical=own.filter(h=>['Industrials','Commodities'].includes(h.sector)).reduce((s,h)=>s+(h.value||0),0),commodity=own.filter(h=>h.sector==='Commodities').reduce((s,h)=>s+(h.value||0),0),valueCategory=own.filter(h=>h.category==='C').reduce((s,h)=>s+(h.value||0),0);
 const candidates=selected.filter(i=>i.decision==='enter').map(i=>{const c=discovery?.candidates?.find((c:any)=>c.ticker===i.ticker);return c?{...c,idea:i,isNew:true,existingValue:0,aggregateValue:0,fx:c.currency==='INR'?1:discovery.fx}:null}).filter(Boolean);
 for(const h of own.filter(h=>h.action==='Add candidate'&&h.currency===(market==='India'?'INR':'USD')&&!h.nonDiscretionary))candidates.push({...h,isNew:false,existingValue:h.value,idea:{targetWeightPct:10,conviction:'medium',thesis:h.reasons.join(' ')},status:'eligible',quoteTime:h.quote?.time});
 const discoveryFresh=Number.isFinite(Date.parse(discovery?.asOf))&&Date.now()-Date.parse(discovery.asOf)<=6*3600000;
 for(const c of candidates as any[]){
 let blocked='';const fx=c.currency==='INR'?1:c.fx;
 if(c.status!=='eligible'||!c.price||!fx||c.stale||isStale(c.quoteTime,Date.now(),c.currency)||c.isNew&&!discoveryFresh)blocked='Fresh screened evidence, price and FX required.';
 if(c.isNew&&c.researchPrice&&c.price>c.researchPrice*1.05)blocked='Price has risen more than 5% since research; recheck the entry.';
 if(blocked){skipped.push({ticker:c.ticker,reason:blocked});continue;}
 let cap=Math.min(remaining,Math.max(0,portfolio.value*Math.min(c.idea.targetWeightPct,RULES.single)/100-c.existingValue),Math.max(0,combined*.15-(c.aggregateValue||0)));
 if(c.idea.conviction==='low')cap=Math.min(cap,Math.max(0,portfolio.value*.05-c.existingValue));
 if(['Industrials','Commodities'].includes(c.sector))cap=Math.min(cap,Math.max(0,portfolio.value*.25-cyclical));
 if(c.sector==='Commodities')cap=Math.min(cap,Math.max(0,portfolio.value*.20-commodity));
 if(c.category==='C')cap=Math.min(cap,Math.max(0,portfolio.value*.15-valueCategory));
 const unit=c.price*fx,quantity=c.currency==='INR'?Math.floor(cap/unit):Math.floor(cap/unit*10000)/10000,amount=quantity*unit;
 // Whole-share rounding must not breach caps; a new entry below meaningful size is reserved.
 if(quantity<=0||c.existingValue+amount<portfolio.value*.05){skipped.push({ticker:c.ticker,reason:'Cash, whole-share rounding or exposure caps prevent a meaningful 5% position.'});continue;}
 allocations.push({ticker:c.ticker,quantity,amount,price:c.price,currency:c.currency,category:c.category,reason:c.idea.thesis,isNew:c.isNew,sourceUrl:c.sourceUrl,quoteTime:c.quoteTime});remaining-=amount;
 if(['Industrials','Commodities'].includes(c.sector))cyclical+=amount;if(c.sector==='Commodities')commodity+=amount;if(c.category==='C')valueCategory+=amount;
 }
 return {budget:available,reserve:Math.max(0,remaining),allocations,skipped,reason:allocations.length?'Conditional entry/addition proposals from Jarvis screening and Codex research. Verify the thesis and current execution price before placing orders.':'Retain cash: no supported entry fits the research gates, selected market, budget and exposure limits.'};
}
