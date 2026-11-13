import {businessModel} from './business-model';
import {quoteFreshness} from './exchange-calendar';
import {screenScorecard,compactScorecard,type AnnualRow,type Scorecard} from './jarvis-gates';
export type Row = {Id:number;Ticker:string;Portfolio:string;Date:string;TransactionType:string;NoOfShares:number;CostPerShare:number;CMP?:number;Note?:string};
export type Quote = {ticker:string;price:number|null;currency:string;time:number|null;previous:number|null;history:{date:string;close:number}[];splits:{date:string;ratio:number}[];freshness?:ReturnType<typeof quoteFreshness>;error?:string;stale:boolean};
export type Fundamentals = {series?:AnnualRow[];statementRate?:number|null;shares?:number|null;date:string|null;currency:string|null;roe:number|null;revenueGrowth:number|null;earningsGrowth:number|null;cashConversion:number|null;debtEquity:number|null;fcf:number|null;eps:number|null;bookPerShare:number|null;pe:number|null;pb:number|null;peg:number|null;fresh:boolean;error?:string};
export const RULES = {single:15,trimTrigger:17,lowConviction:5,meaningful:5,cyclical:25,commodity:20,weakReturn:30,moderateAccounting:20,recentDays:90};
export const SECTORS:Record<string,string> = Object.fromEntries(Object.entries({Financials:['ABCAPITAL','AXISBANK','BSE','CANFINHOME','HDFCBANK','ICICIAMC','ICICIBANK','ICICIGI','NAM-INDIA','PFC','SBIN'],Technology:['ALLDIGI','HCLTECH','INFY','MASTEK','ORCL','TANLA','TCS'],Consumer:['ASIANPAINT','BRITANNIA','HAVELLS','HINDUNILVR','MARICO','TITAN'],Healthcare:['CAPLIPOINT','NATCOPHARM','VIMTALABS'],Industrials:['AGI','ASHOKLEY','INDUSTOWER','IRCTC','JKTYRE','KIRLPNU','LT','M&M','TMCV','TMPV'],Commodities:['COALINDIA','GAIL','GNFC','GSFC','JINDALSAW','MAHSEAMLES','NMDC','RELIANCE','ULTRACEMCO'],Services:['IEX','INDIAMART']}).flatMap(([s,ts])=>ts.map(t=>[t,s])));
const num=(v:any)=>Number.isFinite(Number(v))?Number(v):0;
const india=(t:string)=>/\.(NS|BO)$/.test(t);
export function isStale(time:number|null,now=Date.now(),currency='INR'){return quoteFreshness(time,now,currency).stale;}
export function ledger(rows:Row[],quotes:Record<string,Quote>,fx:number|null){
 const portfolios:Record<string,any>={},warnings:string[]=[],tradeHistory:any[]=[];
 for(const r of [...rows].sort((a,b)=>(a.Date||'').localeCompare(b.Date||'')||a.Id-b.Id)){
 const portfolio=r.Portfolio?.trim()||'Default',ticker=r.Ticker?.trim().toUpperCase();if(!ticker)continue;
 const p=portfolios[portfolio]??=( {name:portfolio,cash:0,positions:{},holdings:[],realised:0,invested:0,equity:0,value:0,unpriced:0,warnings:[]} );
 const n=num(r.NoOfShares),cost=num(r.CostPerShare),type=r.TransactionType;
 if(ticker==='CASH'){if(!Number.isFinite(Date.parse(r.Date))||(/^\d{4}-\d{2}-\d{2}$/.test(r.Date)?r.Date>new Date(Date.now()+330*60000).toISOString().slice(0,10):Date.parse(r.Date)>Date.now())||(r.CostPerShare===null||r.CostPerShare===undefined||!Number.isFinite(Number(r.CostPerShare)))||cost<0||!Number.isFinite(Number(r.NoOfShares))||n<0||!['Deposit','Withdraw'].includes(type)){p.invalidLedger=true;warnings.push(`${portfolio}: invalid cash entry in row ${r.Id}. Reconcile before trading.`);continue;}p.cash+=(type==='Deposit'?1:type==='Withdraw'?-1:0)*(n||1)*cost;if(type==='Deposit'&&(n||1)*cost>0&&(!p.lastDepositAt||Date.parse(r.Date)>Date.parse(p.lastDepositAt)))p.lastDepositAt=new Date(Date.parse(r.Date)).toISOString();continue;}
 if(!Number.isFinite(Number(r.NoOfShares))||n<=0){p.invalidLedger=true;warnings.push(`${portfolio}: invalid quantity in row ${r.Id}`);continue;}
 const pos=p.positions[ticker]??={ticker,portfolio,lots:[],realised:0,notes:[],invalid:false,sellDates:[],historyKey:"",boughtAfterSale:false};
 if(r.Note)pos.notes.push({date:r.Date,note:r.Note,type});
 pos.historyKey+=JSON.stringify([r.Id,r.Date,type,n,cost]);
 if((r.CostPerShare===null||r.CostPerShare===undefined||!Number.isFinite(Number(r.CostPerShare)))||cost<0||!Number.isFinite(Date.parse(r.Date))||(/^\d{4}-\d{2}-\d{2}$/.test(r.Date)?r.Date>new Date(Date.now()+330*60000).toISOString().slice(0,10):Date.parse(r.Date)>Date.now())){pos.invalid=true;warnings.push(`${portfolio} / ${ticker}: invalid price or date in row ${r.Id}. Reconcile before trading.`);continue;}
 if(type==='Buy'){pos.lots.push({shares:n,cost,date:r.Date});pos.lastBuy=r.Date;pos.boughtAfterSale=!!pos.lastSell;}

 else if(type==='Sell'){
 let remain=n;while(remain>1e-8&&pos.lots.length){const l=pos.lots[0],q=Math.min(l.shares,remain);pos.realised+=q*(cost-l.cost);l.shares-=q;remain-=q;if(l.shares<1e-8)pos.lots.shift();}
 if(remain>1e-8){pos.invalid=true;warnings.push(`${portfolio} / ${ticker}: ${remain} sold shares have no matching purchase. Reconcile before acting.`);}pos.sellDates.push(r.Date);pos.lastSell=r.Date;pos.lastSalePrice=cost;pos.lastSaleShares=n;pos.boughtAfterSale=false;
 }else{pos.invalid=true;warnings.push(`${portfolio} / ${ticker}: unknown transaction type ${type}`);}
 }
 for(const p of Object.values(portfolios)){
 for(const pos of Object.values(p.positions) as any[]){
 const rate=india(pos.ticker)?1:fx,q=quotes[pos.ticker];const shares=pos.lots.reduce((s:number,l:any)=>s+l.shares,0);p.realised+=rate===null?0:pos.realised*rate;

 const basis=pos.lots.reduce((s:number,l:any)=>s+l.shares*l.cost,0);const value=Number.isFinite(q?.price)&&q!.price!>0&&q?.currency===(india(pos.ticker)?'INR':'USD')&&rate!==null?shares*q!.price!*rate:null;
 const h={...pos,shares,basisNative:basis,avg:shares>0?basis/shares:0,invested:rate===null?null:basis*rate,value,price:q?.price??null,currency:india(pos.ticker)?'INR':'USD',fx:rate,quote:q,sector:SECTORS[pos.ticker.replace(/\.(NS|BO)$/,'')]||'Unclassified',nonDiscretionary:pos.ticker==='ORCL',unrealised:value===null||rate===null?null:value-basis*rate,oldest:pos.lots[0]?.date,recent:pos.lots.some((l:any)=>(Date.now()-Date.parse(l.date))/86400000<=90)};
 tradeHistory.push(h);
 if(q?.currency!==(india(pos.ticker)?'INR':'USD')){h.invalid=true;warnings.push(`${p.name} / ${h.ticker}: quote currency mismatch; reconcile market data.`);}
 if(shares<=1e-8)continue;
 if(value===null)p.unpriced++;else p.equity+=value;
 if(h.invested!==null)p.invested+=h.invested;
 p.holdings.push(h);
 for(const split of q?.splits||[]){if(split.date>h.oldest&&!rows.some(r=>r.Ticker===h.ticker&&r.Portfolio===p.name&&r.TransactionType==='Buy'&&r.CostPerShare===0&&Math.abs(Date.parse(r.Date)-Date.parse(split.date))<14*86400000)){
 h.invalid=true;warnings.push(`${p.name} / ${h.ticker}: ${split.ratio}:1 corporate action on ${split.date} requires reconciliation. Quantities have not been rescaled.`);
 }}
 }
 p.value=p.equity+p.cash;
 p.complete=!p.invalidLedger&&p.unpriced===0&&!Object.values(p.positions).some((pos:any)=>pos.invalid)&&!p.holdings.some((h:any)=>h.invalid||h.quote?.stale);
 for(const h of p.holdings)h.weight=p.complete&&p.value>0&&h.value!==null?h.value/p.value*100:null;
 }
 // A portfolio holding only locked plans (the ORCL employee plan) cannot be acted on here, so it is
 // left out of every list, total and household weight. Its ledger is untouched.
 const lockedOnly=(p:any)=>p.holdings.length>0&&p.holdings.every((h:any)=>h.nonDiscretionary);
 const hiddenPortfolios=Object.values(portfolios).filter(lockedOnly).map((p:any)=>({name:p.name,value:p.value,holdings:p.holdings.map((h:any)=>h.ticker)}));
 for(const hp of hiddenPortfolios)delete portfolios[hp.name];
 const hiddenNames=new Set(hiddenPortfolios.map(p=>p.name));
 const holdings=Object.values(portfolios).flatMap((p:any)=>p.holdings);
 const totalValue=Object.values(portfolios).reduce((s:number,p:any)=>s+p.value,0);
 const aggregate:Record<string,number>={};for(const h of holdings)aggregate[h.ticker]=(aggregate[h.ticker]||0)+(h.value||0);
 for(const h of holdings){h.aggregateWeight=totalValue>0?aggregate[h.ticker]/totalValue*100:null;h.aggregateValue=aggregate[h.ticker];h.combinedTotal=totalValue;}
 return {portfolios:Object.values(portfolios),holdings,tradeHistory:tradeHistory.filter((h:any)=>!hiddenNames.has(h.portfolio)),warnings,hiddenPortfolios,totals:{value:totalValue,equity:Object.values(portfolios).reduce((s:number,p:any)=>s+p.equity,0),cash:Object.values(portfolios).reduce((s:number,p:any)=>s+p.cash,0),invested:Object.values(portfolios).reduce((s:number,p:any)=>s+p.invested,0),realised:Object.values(portfolios).reduce((s:number,p:any)=>s+p.realised,0),unpriced:holdings.filter(h=>h.value===null).length}};
}
const pct=(n:number|null)=>n===null?'unavailable':`${n.toFixed(1)}%`;
export function assess(h:any,p:any,f:Fundamentals|undefined){
 let action='Hold',reason:string[]=[],risk:string[]=[],quantity:number|null=null,amount:number|null=null,confidence='Limited',accounting='Not assessed',category='Unclassified';
 const model=businessModel(h),bank=model.lender||model.specialist;
 const financials=f&&f.fresh&&f.roe!==null&&f.revenueGrowth!==null&&f.earningsGrowth!==null;
 const tradable=!!h.price&&!h.quote?.stale&&!h.invalid&&p.complete&&h.fx!==null;
 const full=financials&&(bank?f.pb!==null:f.pe!==null&&f.cashConversion!==null&&f.debtEquity!==null&&f.fcf!==null);
 const sc=f?.series?.length?holdingScorecard(h,f):null;
 if(f&&!bank&&f.cashConversion!==null)accounting=f.cashConversion<0.6?'Serious cash-conversion concern':f.cashConversion<0.8?'Moderate cash-conversion concern':'Cash-conversion check passed';
 if(bank)accounting='Financial-sector due diligence required';
 if(h.nonDiscretionary){action='Locked';reason.push('ORCL is an ESPP holding: Jarvis excludes it from buy, trim, exit and cash deployment actions. It still counts in exposure.');}
 else if(!tradable){action='Review';reason.push(h.invalid?'Check the purchase records and any share splits or other corporate actions before trading.':!p.complete?'Portfolio prices or transaction records need reconciliation; reliable weights and sizing are unavailable.':'Fresh price and FX are required before sizing any action.');}
 else if(h.weight>RULES.trimTrigger){action='Trim';confidence='Rule-based';amount=Math.max(0,h.value-p.value*.15);quantity=india(h.ticker)?Math.ceil(amount/(h.price*h.fx)):Math.ceil(amount/(h.price*h.fx)*10000)/10000;quantity=Math.min(quantity,h.shares);amount=quantity*h.price*h.fx;reason.push(`Position is ${pct(h.weight)} of ${p.name}; Jarvis caps a single stock at 15% and trims once it passes ${RULES.trimTrigger}%. Trim back to 15%.`,h.recent?'Some shares were bought recently. Sell only the portion above the 15% limit and keep the rest.':'Reduce the holding to bring it within the 15% portfolio limit.');}
 else if(sc){
 ({action,confidence,accounting,category}=holdingDecision(h,sc,reason,risk));
 }
 else if(!full){action='Review';reason.push('There is not enough comparable financial information to recommend buying more or selling.','Check the company’s financial health, valuation and growth outlook before deciding.');}
 else{
 confidence='Screened';reason.push(`Latest annual evidence (${f.date}): revenue growth ${pct(f.revenueGrowth)}, earnings growth ${pct(f.earningsGrowth)}, ROE ${pct(f.roe)}.`);
 if(!bank&&f.cashConversion!<.6){if(h.recent){action='Watch';reason.push('Operating cash flow is below 60% of reported profit. These shares were bought recently; check the latest results and your reasons for owning the company before selling.');}else{action='Exit review';reason.push('Operating cash flow is below 60% of reported earnings. Jarvis flags this as a serious accounting concern; verify the statements before an exit.');}}
 else if(!bank&&f.cashConversion!<.8&&h.weight>5){action=h.recent?'Watch':'Trim review';reason.push('Operating cash flow is below 80% of reported profit, and this holding is more than 5% of the portfolio. Check the accounts before deciding whether to sell part of it.');}
 else if(!bank&&f.revenueGrowth!>15&&f.earningsGrowth!>15&&f.roe!>15&&f.peg!==null&&f.peg<1.5&&f.fcf!>0&&f.debtEquity!>=0&&f.debtEquity!<1&&f.cashConversion!>=.8&&h.weight<10){action='Add candidate';category='GARP';reason.push(`GARP screen passes: PEG ${f.peg.toFixed(2)} < 1.5, positive FCF and debt/equity ${f.debtEquity!.toFixed(2)}. Consider only after confirming forward visibility and governance.`);}
 else{reason.push(h.recent?'These shares were bought recently. Review the holding after the next results.':'There is no confirmed reason to sell or buy more at present. Keep monitoring the company.');}
 }
 if(f?.roe!==null&&f?.roe!==undefined&&f.roe>15&&f.fcf!==null&&f.fcf>0&&category==='Unclassified')category='Quality watchlist';
 if(bank)risk.push('Lender ratios require sector context. Capital adequacy, credit quality, provisioning and funding evidence are assessed in the current company review.');
 if(f?.debtEquity!==null&&f?.debtEquity!==undefined&&f.debtEquity>1)risk.push(`Debt/equity is ${f.debtEquity.toFixed(2)}; leverage needs sector context.`);
 if(h.aggregateWeight>15)risk.push(`Combined household exposure to ${h.ticker} is ${pct(h.aggregateWeight)}, including duplicate holdings.`);
 risk.push('Competitive advantages, management quality, recent news and five-year financial trends have not been fully reviewed. Future returns are uncertain.');
 if(sc&&!['Locked','Review'].includes(action))risk.splice(risk.findIndex(r=>r.startsWith('Competitive advantages')),1,'Moat, management quality and the outlook come from the research review; the scorecard covers the mandatory financial checks.');
 return {...h,fundamentals:f?{...f,series:undefined}:null,scorecard:sc?compactScorecard(sc):null,action,reasons:reason,risks:risk,quantity,amount,confidence,accounting,category,xirr:'Unclear / insufficient forward evidence'};
}
/** Jarvis scorecard for a held company, from the same gates used for new candidates. */
export function holdingScorecard(h:any,f:Fundamentals):Scorecard{
 const shares=Number.isFinite(f.shares)&&f.shares!>0?f.shares!:null,price=Number.isFinite(h.price)&&h.price>0?h.price:null;
 return screenScorecard({ticker:h.ticker,market:h.currency==='USD'?'US':'IN',financial:h.sector==='Financials',industry:h.industry,sector:h.sector,price,currency:h.currency,financialCurrency:f.currency,statementRate:f.statementRate??null,series:f.series,sharesOutstanding:shares,marketCap:shares&&price?shares*price:null});
}
/**
 * Long-term holding decision. A mandatory failure stops additions; it only suggests an
 * exit review for distress or forensic red flags, never for valuation or a single weak year.
 */
export function holdingDecision(h:any,sc:Scorecard,reason:string[],risk:string[]){
 const failed=sc.gates.filter(g=>g.status==='fail'),unknown=sc.gates.filter(g=>g.status==='unknown'),warnings=sc.warnings.filter(w=>w.weight);
 const eq=sc.gates.find(g=>g.id==='earningsQuality');
 const accounting=eq?.status==='pass'?'Earnings-quality check passed':eq?.status==='fail'?'Earnings-quality concern':eq?.status==='deferred'?'Financial-sector due diligence required':'Not assessed';
 const category=failed.length?'Quality concern':sc.status==='eligible'?'Jarvis quality':'Quality watchlist';
 let action='Hold';
 if(sc.severe.length){action=h.recent?'Watch':'Exit review';reason.push(...sc.severe,h.recent?'These shares were bought recently; confirm the latest results before selling.':'Verify the statements and the investment case before deciding on an exit.');}
 else if(failed.some(g=>g.id==='solvency'||g.id==='earningsQuality')){action='Watch';reason.push(...failed.map(g=>`${g.label}: ${g.detail}`),'No additions while this fails. It is not a sell signal by itself; check whether your reason for owning the company still holds.');}
 else if(failed.length){reason.push(...failed.map(g=>`${g.label}: ${g.detail}`),'Keep holding, but do not add while this mandatory check fails.');}
 else if(unknown.length){action='Review';reason.push(...unknown.map(g=>`${g.label}: ${g.detail}`));}
 else if(sc.warningCount>=3){reason.push(`Mandatory checks pass, but ${sc.warningCount} warnings are too many to add more.`);}
 else if(h.weight>RULES.single){reason.push(`Position is ${h.weight.toFixed(1)}%: above the 15% cap but inside the ${RULES.trimTrigger}% trim band. No additions.`);}
 else if(h.weight<10){action='Add candidate';reason.push(sc.gates.some(g=>g.status==='deferred')?'Initial numerical screen passed. Sector evidence, the forward return hurdle and the enforced buy ceiling are checked against the current company review before adding.':`Initial financial screen passed${sc.warningCount?` with ${sc.warningCount} warning${sc.warningCount===1?'':'s'}`:''}. The current company case, forward return hurdle and enforced buy ceiling must also support adding.`);}
 else reason.push('Initial numerical screen passed. The position is already near its 10% addition target; research and valuation checks still apply.');
 if(action!=='Exit review')for(const w of warnings.slice(0,3))risk.push(`${w.label}: ${w.detail}`);
 return {action,confidence:'Jarvis gates',accounting,category};
}
export function deployment(portfolio:any,holdings:any[],budget:number,market:string){
 const available=Math.max(0,Math.min(num(budget),portfolio.cash));let remaining=available;
 const allocations:any[]=[];
 if(!portfolio.complete)return {budget:available,reserve:available,allocations,reason:'Unpriced holdings prevent reliable portfolio sizing.'};
 const candidates=holdings.filter(h=>h.portfolio===portfolio.name&&h.action==='Add candidate'&&h.currency===(market==='India'?'INR':'USD')&&h.aggregateWeight<15&&!h.nonDiscretionary).sort((a,b)=>(a.fundamentals.peg??99)-(b.fundamentals.peg??99));
 const cyclicValue=holdings.filter(h=>h.portfolio===portfolio.name&&['Industrials','Commodities'].includes(h.sector)).reduce((s,h)=>s+(h.value||0),0);
 let cyclicRemaining=Math.max(0,portfolio.value*.25-cyclicValue),commodityRemaining=Math.max(0,portfolio.value*.20-holdings.filter(h=>h.portfolio===portfolio.name&&h.sector==='Commodities').reduce((s,h)=>s+(h.value||0),0));
 for(const h of candidates){const combinedTotal=h.combinedTotal;let cap=Math.min(remaining,Math.max(0,portfolio.value*.15-h.value),Math.max(0,combinedTotal*.15-h.aggregateValue));
 if(['Industrials','Commodities'].includes(h.sector))cap=Math.min(cap,cyclicRemaining);if(h.sector==='Commodities')cap=Math.min(cap,commodityRemaining);
 const unit=h.price*h.fx,quantity=h.currency==='INR'?Math.floor(cap/unit):Math.floor(cap/unit*10000)/10000,amount=quantity*unit;
 if(quantity>0&&h.value+amount>=portfolio.value*.05){allocations.push({ticker:h.ticker,quantity,amount,price:h.price,currency:h.currency,category:h.category,reason:h.reasons.join(' ')});remaining-=amount;if(['Industrials','Commodities'].includes(h.sector))cyclicRemaining-=amount;if(h.sector==='Commodities')commodityRemaining-=amount;}
 }
 return {budget:available,reserve:remaining,allocations,reason:allocations.length?'Conditional additions to existing screened holdings. Confirm thesis, governance and forward risks before executing. Recheck if price gaps up more than 5%.':'Keep cash in reserve: no existing holding passes the available evidence and allocation gates. Consult new-stock discovery for potential entries; a complete qualitative review is still required.'};
}
