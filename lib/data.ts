import {quoteFreshness} from './exchange-calendar';
import {dataTimeout} from './data-budget';
import {SERIES_FIELDS,type AnnualRow} from './jarvis-gates';
import {revision,ledgerRows} from './review-values';
import {ValueCache} from './request-cache';
import {withTrades} from './trade-store';
import { ledger, assess, type Quote, type Fundamentals, type Row, RULES } from './engine';
type Env={NOCODB_TOKEN?:string;CF_ACCESS_CLIENT_ID?:string;CF_ACCESS_CLIENT_SECRET?:string};
const cache=new ValueCache();
function cached<T>(key:string,ttl:number,fn:()=>Promise<T>):Promise<T>{return cache.get(key,ttl,fn);}
async function json(url:string,headers:Record<string,string>={}){const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0','Accept':'application/json',...headers},redirect:'manual',signal:AbortSignal.timeout(dataTimeout(8000))});if(!r.ok)throw Error(`Upstream returned HTTP ${r.status}`);return r.json() as Promise<any>;}
async function mapLimit<T,R>(items:T[],fn:(x:T)=>Promise<R>,limit=6){const result:R[]=new Array(items.length);let next=0;await Promise.all(Array.from({length:Math.min(items.length,limit)},async()=>{while(next<items.length){let i=next++;result[i]=await fn(items[i]);}}));return result;}
export async function records(env:Env):Promise<Row[]>{if(!env.NOCODB_TOKEN||!env.CF_ACCESS_CLIENT_ID||!env.CF_ACCESS_CLIENT_SECRET)throw Error('NocoDB server credentials are not configured.');const rows:Row[]=[],seenIds=new Set<string>();for(let offset=0;offset<100000;){const d=await json(`https://noco.shankar-nemmani.com/api/v2/tables/mmto17h9fpd6efz/records?limit=1000&offset=${offset}`,{'xc-token':env.NOCODB_TOKEN,'CF-Access-Client-Id':env.CF_ACCESS_CLIENT_ID,'CF-Access-Client-Secret':env.CF_ACCESS_CLIENT_SECRET});if(!Array.isArray(d.list))throw Error('NocoDB returned an unexpected response.');for(const row of d.list){const id=String(Number(row.Id));if(!Number.isSafeInteger(Number(row.Id))||Number(row.Id)<=0||seenIds.has(id))throw Error('Missing or duplicate transaction IDs; reconciliation required.');seenIds.add(id);}rows.push(...d.list);if(d.pageInfo?.isLastPage===true||d.PageInfo?.isLastPage===true||!d.list.length)break;offset+=d.list.length;if(d.pageInfo?.totalRows&&offset>=d.pageInfo.totalRows)break;if(offset>=100000)throw Error('Portfolio pagination limit reached; refusing a partial valuation.');}return rows;}
async function marketChart(ticker:string,range:string){
 let last:unknown;
 for(const host of ['query1.finance.yahoo.com','query2.finance.yahoo.com'])try{
  const d=await json(`https://${host}/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=${range}&events=splits`);
  const result=d.chart?.result?.[0];if(!result?.meta)throw Error('No market data returned');return result;
 }catch(error){last=error;}
 throw last;
}
export async function quote(ticker:string,range='1y'):Promise<Quote>{try{
 // Current prices share one minute cache across every caller/range. History is independent.
 const current=cached(`qm:${ticker}`,60000,()=>marketChart(ticker,'1d'));
 const history=range==='1d'?current:cached(`qh:${ticker}:${range}`,900000,()=>marketChart(ticker,range));
 const [r,h]=await Promise.all([current,history]),m=r.meta,price=Number(m.regularMarketPrice),time=m.regularMarketTime;
 const closes=h.indicators?.quote?.[0]?.close||[],freshness=quoteFreshness(time,Date.now(),ticker==='USDINR=X'?'FX':m.currency);
 return {ticker,price:Number.isFinite(price)&&price>0?price:null,currency:m.currency,time,previous:closes.filter((x:any)=>typeof x==='number').slice(-2)[0]??null,
 history:(h.timestamp||[]).map((t:number,i:number)=>({date:new Date(t*1000).toISOString().slice(0,10),close:closes[i]})).filter((x:any)=>Number.isFinite(x.close)),
 splits:Object.values(h.events?.splits||{}).map((s:any)=>({date:new Date(s.date*1000).toISOString().slice(0,10),ratio:s.numerator/s.denominator})),stale:freshness.stale,freshness};
 }catch{return {ticker,price:null,currency:/\.(NS|BO)$/.test(ticker)?'INR':'USD',time:null,previous:null,history:[],splits:[],stale:true,error:'Both Yahoo quote endpoints are unavailable or returned invalid data'};}}
const types=[...SERIES_FIELDS];
export async function fundamentals(ticker:string,price:number|null,priceCurrency:string,usdInr:number|null):Promise<Fundamentals>{
 const empty:Fundamentals={date:null,currency:null,roe:null,revenueGrowth:null,earningsGrowth:null,cashConversion:null,debtEquity:null,fcf:null,eps:null,bookPerShare:null,pe:null,pb:null,peg:null,fresh:false};
 try{const result=await cached(`f:${ticker}`,21600000,async()=>{const d=await json(`https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(ticker)}?type=${types.map(t=>'annual'+t).join(',')}&period1=${Math.floor(Date.now()/1000)-5*366*86400}&period2=${Math.floor(Date.now()/1000)}`);return d.timeseries?.result||[];});
 const all:Record<string,any[]>={};for(const r of result){const t=r.meta?.type?.[0];if(t)all[t.replace('annual','')]=(r[t]||[]).filter((v:any)=>Number.isFinite(v.reportedValue?.raw)).sort((a:any,b:any)=>a.asOfDate.localeCompare(b.asOfDate));}
 const latest=all.NetIncome?.at(-1);if(!latest)return {...empty,error:'Annual financial statements unavailable'};const date=latest.asOfDate,currency=latest.currencyCode;
 const val=(key:string,previous=false)=>{const a=all[key]||[];const row=previous?a.filter(v=>v.asOfDate<date).at(-1):a.find(v=>v.asOfDate===date);return row&&row.currencyCode===currency&&(!previous||(Date.parse(date)-Date.parse(row.asOfDate)>=300*86400000&&Date.parse(date)-Date.parse(row.asOfDate)<=430*86400000))?row.reportedValue.raw:null;};
 const ratio=(a:number|null,b:number|null)=>a!==null&&b!==null&&b>0?a/b:null;
 const growth=(key:string)=>{const a=val(key),b=val(key,true);return a!==null&&b!==null&&b>0?(a/b-1)*100:null;};
 const ni=val('NetIncome'),equity=val('StockholdersEquity'),oldEquity=val('StockholdersEquity',true),shares=val('OrdinarySharesNumber'),eps=val('BasicEPS');
 const rate=currency===priceCurrency?1:currency==='USD'&&priceCurrency==='INR'?usdInr:currency==='INR'&&priceCurrency==='USD'&&usdInr?1/usdInr:null;
 const nativeEPS=eps!==null&&rate!==null?eps*rate:null;const book=ratio(equity,shares);const nativeBook=book!==null&&rate!==null?book*rate:null;const pe=price&&nativeEPS!==null&&nativeEPS>0?price/nativeEPS:null;const eg=growth('NetIncome');
 // Raw annual rows (statement currency) for the multi-year Jarvis gates.
 const byPeriod=new Map<string,AnnualRow>();for(const [key,rows] of Object.entries(all))for(const v of rows){if(v.currencyCode&&v.currencyCode!==currency)continue;const period=String(v.asOfDate).slice(0,10);const row=byPeriod.get(period)||{period};row[key]=v.reportedValue.raw;byPeriod.set(period,row);}
 const series=[...byPeriod.values()].sort((a,b)=>b.period.localeCompare(a.period)).slice(0,5);
 return {series,statementRate:rate,shares,date,currency,roe:ratio(ni,equity!==null&&oldEquity!==null?(equity+oldEquity)/2:equity)!==null?ratio(ni,equity!==null&&oldEquity!==null?(equity+oldEquity)/2:equity)!*100:null,revenueGrowth:growth('TotalRevenue'),earningsGrowth:eg,cashConversion:ratio(val('OperatingCashFlow'),ni),debtEquity:ratio(val('TotalDebt'),equity),fcf:val('FreeCashFlow'),eps:nativeEPS,bookPerShare:nativeBook,pe,pb:price&&nativeBook!==null&&nativeBook>0?price/nativeBook:null,peg:pe!==null&&eg!==null&&eg>0?pe/eg:null,fresh:Number.isFinite(Date.parse(date))&&Date.now()-Date.parse(date)>=0&&Date.now()-Date.parse(date)<550*86400000};
 }catch{return {...empty,error:'Fundamentals feed unavailable'};}
}
async function baseDashboard(env:Env){return cached('dashboard',60000,async()=>{
 const rows=await records(env);const ledgerRevision=await revision(ledgerRows(rows));const tickers=[...new Set(rows.filter(r=>r.Ticker&&r.Ticker!=='CASH').map(r=>r.Ticker.trim().toUpperCase()))];
 const prices=await mapLimit([...tickers,'USDINR=X','^NSEI','^BSESN','^GSPC'],quote);const quotes=Object.fromEntries(prices.map(q=>[q.ticker,q]));const fxQuote=quotes['USDINR=X'];const fx=fxQuote.price&&!fxQuote.stale?fxQuote.price:null;
 const book=ledger(rows,quotes,fx);await Promise.all(book.tradeHistory.map(async(h:any)=>{h.historyKey=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(h.historyKey)))).map(n=>n.toString(16).padStart(2,'0')).join('');}));const openTickers=[...new Set([...book.holdings,...book.tradeHistory.filter((h:any)=>h.lastSell&&!h.boughtAfterSale).sort((a:any,b:any)=>b.lastSell.localeCompare(a.lastSell)).slice(0,50)].map(h=>h.ticker))];
 const fs=await mapLimit(openTickers,async t=>[t,await fundamentals(t,quotes[t]?.price||null,quotes[t]?.currency||'INR',fx)] as const);const f=Object.fromEntries(fs);
 const holdings=book.holdings.map(h=>assess(h,book.portfolios.find(p=>p.name===h.portfolio),f[h.ticker]));
 const warnings=[...book.warnings];if(fx===null)warnings.push('Fresh USD/INR unavailable. USD holdings are excluded from INR totals and trade sizing is blocked.');if(book.totals.unpriced)warnings.push(`${book.totals.unpriced} holding(s) cannot be valued. Totals are partial, not zero-value positions.`);
 const limited=holdings.filter(h=>h.quote?.freshness&&!h.quote.freshness.calendarCovered);if(limited.length)warnings.push('Exchange holiday calendar coverage is unavailable for the current year; quote checks use weekdays until the reviewed calendar is updated.');
 const stale=holdings.filter(h=>h.quote?.stale);if(stale.length)warnings.push(`${stale.length} holding price(s) are older than the expected exchange session or delayed-feed allowance. Refresh market data before trading.`);
 const hidden=new Set((book.hiddenPortfolios||[]).map((p:any)=>p.name));
 const recent=rows.filter((r:any)=>!hidden.has(r.Portfolio)).sort((a,b)=>(b.Date||'').localeCompare(a.Date||'')||b.Id-a.Id).slice(0,30);
 const cyclical=book.holdings.filter(h=>['Industrials','Commodities'].includes(h.sector)).reduce((s,h)=>s+(h.value||0),0);const commodity=book.holdings.filter(h=>h.sector==='Commodities').reduce((s,h)=>s+(h.value||0),0);
 return {asOf:new Date().toISOString(),ledgerRevision,nextRefreshSeconds:60,recordCount:rows.length,source:'NocoDB · PortfolioTransactions',jarvisCommit:'5750d4bf5e7187eb052129e8e282c53edaf35cdf',...book,holdings,tradeHistory:book.tradeHistory.map((h:any)=>assess({...h,weight:h.weight??0},book.portfolios.find(p=>p.name===h.portfolio),f[h.ticker])),warnings,recent,fx,fxTime:fxQuote.time,indices:['^NSEI','^BSESN','^GSPC'].map(t=>quotes[t]),rules:RULES,exposure:{cyclical:book.totals.value>0?cyclical/book.totals.value*100:null,commodity:book.totals.value>0?commodity/book.totals.value*100:null}};
 });}

export async function dashboard(env:Env){return withTrades(env,await baseDashboard(env));}

export function invalidateDashboard(){cache.delete('dashboard');}
