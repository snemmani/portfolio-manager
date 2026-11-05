import {annualDocumentIndex,DOCUMENT_POLICY} from './annual-documents';
import {fundamentalReviews} from './fundamental-store';
import {FUNDAMENTAL_POLICY} from './fundamental-policy';
import {storedDiscovery} from './discovery-store';
import {quote} from './data';
import {recheckCandidate} from './discovery-review';
import {ruleIdeas} from './event-policy';
export const rulesMode=(env:any)=>env.RULES_BASED_BUYS==='1';
export async function marketState(env:any){return env.DB.prepare("SELECT * FROM market_state WHERE id='local'").first();}
export async function liveMarket(env:any,portfolios:any[],fallback:any=null,snap:any=null){
 const state=await marketState(env),raw=await storedDiscovery(env,fallback),documents=await annualDocumentIndex(env);
 const events=JSON.parse(state?.events_json||'{}');const acks=await env.DB.prepare('SELECT ticker,fingerprint FROM event_acknowledgements').all();
 const eventAcks=Object.fromEntries(acks.results.map((a:any)=>[a.ticker,a.fingerprint]));
 const held=new Set(snap?.holdings?.map((h:any)=>h.ticker)||[]);
 const source=(raw?.candidates||[]).filter((c:any)=>!held.has(c.ticker));const candidates:any[]=new Array(source.length);let cursor=0;
 await Promise.all(Array.from({length:Math.min(6,source.length)},async()=>{while(cursor<source.length){const index=cursor++,c=source[index];if(c.status!=='eligible'){candidates[index]=recheckCandidate(c,true);continue;}const q=await quote(c.ticker,'1d');const factor=c.price>0&&q.price?q.price/c.price:1;const metrics={...c.metrics};for(const key of ['pe_ttm','pb','peg'])if(typeof metrics[key]==='number')metrics[key]*=factor;candidates[index]=recheckCandidate({...c,metrics,researchPrice:c.price,price:q.price,quoteTime:q.time,stale:q.stale||q.currency!==c.currency},true);}}));
 for(const h of snap?.tradeHistory||[]){const gate=snap.buyGates?.[JSON.stringify([h.portfolio,h.ticker])];if(h.shares>0||!gate?.active||h.action!=='Add candidate'||candidates.some((c:any)=>c.ticker===h.ticker))continue;const f=h.fundamentals;candidates.push({ticker:h.ticker,name:h.ticker,market:h.currency==='INR'?'IN':'US',category:'B',sector:h.sector,currency:h.currency,price:h.price,quoteTime:h.quote?.time,stale:h.quote?.stale,status:'eligible',ruleAsOf:snap.asOf,lastSaleShares:h.lastSaleShares,gateReasons:[],evidenceGaps:['Previously held stock; the reason for the recorded sale must be reviewed before re-entry.'],matchedScreens:[{bucket:'Existing-stock GARP re-entry',criteria:'Rev Growth>15% · NI Growth>15% · ROE>15% · PEG<1.5 · D/E<1 · FCF+ve'}],metrics:{revenue_growth_yoy:f.revenueGrowth,earnings_growth_yoy:f.earningsGrowth,roe:f.roe,peg:f.peg,debtEquity:f.debtEquity,fcf:f.fcf,cash_conversion_ratio:f.cashConversion},sourceUrl:'https://finance.yahoo.com/quote/'+encodeURIComponent(h.ticker)+'/'});}
 const fxQuote=await quote('USDINR=X');const discovery={...(raw||{asOf:null,screens:[],errors:[],scope:'Independent financial screening is pending.'}),candidates,fx:fxQuote.price&&!fxQuote.stale?fxQuote.price:null,events,eventAcks,buyGates:snap?.buyGates||{},householdComplete:snap?snap.portfolios.every((p:any)=>p.complete):true,rulesBased:true,fundamentalPolicy:FUNDAMENTAL_POLICY,fundamentalReviews:await fundamentalReviews(env),documentPolicy:documents.enabled?DOCUMENT_POLICY:null,annualDocumentsAvailable:documents.available,annualDocuments:documents.reports,annualDocumentRevision:documents.revision};
 return {discovery,ideas:ruleIdeas(portfolios,discovery),rulesBased:true,monitor:{lastChecked:state?.last_checked||null,error:state?.error||null,requested:!!state?.requested},technicalPlans:JSON.parse(state?.plans_json||'[]')};
}
