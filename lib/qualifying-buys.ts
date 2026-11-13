import {fundamentalCheck} from './fundamental-policy';
import {planDiscovery} from './discovery';
import {cardText} from './card-copy';
import {formatIST} from './time';
import {tradeSummary} from './trade-summary';
export const positionKey=(portfolio:string,ticker:string)=>JSON.stringify([portfolio,ticker]);
export async function initBuyAlerts(db:any){
 await db.batch([
  db.prepare('CREATE TABLE IF NOT EXISTS buy_review_runs(id TEXT PRIMARY KEY,as_of TEXT NOT NULL,completed_at TEXT NOT NULL,status TEXT NOT NULL,lease_until TEXT,error TEXT)'),
  db.prepare('CREATE TABLE IF NOT EXISTS qualifying_buy_state(id TEXT PRIMARY KEY,portfolio TEXT NOT NULL,ticker TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 0,generation INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL)'),
  db.prepare('CREATE TABLE IF NOT EXISTS qualifying_buy_alerts(id TEXT PRIMARY KEY,review_id TEXT NOT NULL,portfolio TEXT NOT NULL,ticker TEXT NOT NULL,quantity REAL NOT NULL,limit_price REAL NOT NULL,currency TEXT NOT NULL,reason TEXT NOT NULL,risk TEXT,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,status TEXT NOT NULL,delivered_at TEXT,error TEXT,next_attempt TEXT)')
 ]);
}
// A missing assessment or a failed market feed cannot end a qualification episode.
export function buyReviewPositions(snap:any,live:any,report:any){
 if(live.discovery?.householdComplete===false)return {qualifying:new Map<string,any>(),excluded:new Set<string>()};
 const approved=new Set<string>(),excluded=new Set<string>(),qualifying=new Map<string,any>();
 for(const r of report.recommendations||[]){const holding=snap.holdings.find((h:any)=>h.portfolio===r.portfolio&&h.ticker===r.ticker),investment=fundamentalCheck(live.discovery,r.ticker,holding?.price,holding?.fundamentals?.date);if(['missing','stale','incomplete','return-pending','return-reconciliation'].includes(investment.status))continue;if(r.assessed===false||r.reasons?.some((s:string)=>/did not assess this position|has not been reviewed yet/.test(s)))continue;const key=positionKey(r.portfolio,r.ticker);if(['buy','add'].includes(r.action))approved.add(key);else excluded.add(key);}
 for(const i of live.ideas||[]){if(i.source==='rules'&&(i.eventStatus==='unknown'||['missing','stale','incomplete','return-pending','return-reconciliation'].includes(i.fundamentalStatus)))continue;const key=positionKey(i.portfolio,i.ticker);if(i.decision==='enter')approved.add(key);else excluded.add(key);}
 for(const p of snap.portfolios){
  if(p.cash<=0){for(const key of approved)if(JSON.parse(key)[0]===p.name)excluded.add(key);continue;}
  if(!p.complete)continue;
  for(const market of ['India','US']){
   const discovery={...(live.discovery||{}),combinedTotal:snap.totals.value,holdingRecommendations:report.recommendations||[],reportAsOf:report.as_of};
   const plan=planDiscovery(p,snap.holdings,p.cash,market,discovery,live.ideas||[]);
   for(const a of plan.allocations){const key=positionKey(p.name,a.ticker);if(!approved.has(key))continue;
    const idea=(live.ideas||[]).find((i:any)=>i.portfolio===p.name&&i.ticker===a.ticker),rec=(report.recommendations||[]).find((r:any)=>r.portfolio===p.name&&r.ticker===a.ticker);
    qualifying.set(key,{portfolio:p.name,ticker:a.ticker,reason:idea?[idea.thesis,idea.driver,idea.portfolioFit].filter(Boolean).join(' '):rec?.reasons?.join(' ')||a.reason,risk:idea?.risk||rec?.risks?.[0]||''});
   }
   for(const key of approved){const [portfolio,ticker]=JSON.parse(key);if(portfolio!==p.name||qualifying.has(key))continue;
    const h=snap.holdings.find((h:any)=>h.portfolio===portfolio&&h.ticker===ticker),c=live.discovery?.candidates?.find((c:any)=>c.ticker===ticker),currency=h?.currency||c?.currency;
    if(currency!==(market==='India'?'INR':'USD'))continue;
    const validPrice=!!(h?.price||c?.price)&&!(h?.quote?.stale||c?.stale)&&!!(currency==='INR'||live.discovery?.fx);
    if(validPrice)excluded.add(key); // Sizing/screen/portfolio limits failed with usable data.
   }
  }
 }
 for(const key of qualifying.keys())excluded.delete(key);
 return {qualifying,excluded};
}
type Dependencies={snapshot:()=>Promise<any>;discovery:()=>Promise<any>;execution:(portfolio:string,ticker:string)=>Promise<any>;send:(content:string)=>Promise<Response>};
const iso=()=>new Date().toISOString();
export async function processBuyReviews(env:any,cfg:any,deps:Dependencies){
 if(!cfg.enabled||!cfg.webhook||!cfg.new_buys)return;
 const db=env.DB,time=iso();
 await db.prepare("UPDATE qualifying_buy_alerts SET status='expired' WHERE status='pending' AND expires_at<=?").bind(time).run();
 const empirical=env.RULES_BASED_BUYS==='1';
 const report=await db.prepare(empirical?"SELECT as_of,updated_at,recommendations_json FROM rule_reports WHERE id='latest' AND provider='rules'":"SELECT as_of,updated_at,recommendations_json FROM reports WHERE id='latest' AND provider IN ('antigravity','codex-subscription')").first();
 if(!report)return;
 // Older, overwritten reports cannot cause delayed notifications about stale opportunities.
 await db.prepare("UPDATE buy_review_runs SET status='superseded' WHERE status='pending' AND (completed_at<>? OR as_of<>?)").bind(report.updated_at,report.as_of).run();
 const run=await db.prepare("SELECT * FROM buy_review_runs WHERE status='pending' AND completed_at=? AND as_of=? ORDER BY completed_at LIMIT 1").bind(report.updated_at,report.as_of).first();
 if(run){
  const claim=await db.prepare("UPDATE buy_review_runs SET lease_until=? WHERE id=? AND status='pending' AND (lease_until IS NULL OR lease_until<?)").bind(new Date(Date.now()+300000).toISOString(),run.id,time).run();
  if(claim.meta.changes){try{
   if(Date.now()-Date.parse(run.as_of)>6*3600000){await db.prepare("UPDATE buy_review_runs SET status='expired',lease_until=NULL WHERE id=?").bind(run.id).run();}
   else{
    const [snap,live]=await Promise.all([deps.snapshot(),deps.discovery()]);
    const {qualifying,excluded}=buyReviewPositions(snap,live,{...report,recommendations:JSON.parse(report.recommendations_json||'[]')});
    const states=(await db.prepare('SELECT * FROM qualifying_buy_state').all()).results;
    const updates:any[]=[];let waiting=false;
    for(const state of states)if(!snap.portfolios.some((p:any)=>p.name===state.portfolio))excluded.add(state.id);
    for(const key of excluded){const [portfolio,ticker]=JSON.parse(key);updates.push(db.prepare('UPDATE qualifying_buy_state SET active=0,updated_at=? WHERE id=?').bind(time,key));updates.push(db.prepare("UPDATE qualifying_buy_alerts SET status='cancelled',error='This stock no longer qualifies in the latest rules check.' WHERE portfolio=? AND ticker=? AND status='pending'").bind(portfolio,ticker));}
    for(const [key,target] of qualifying){
     const previous=states.find((s:any)=>s.id===key),generation=previous?.active?previous.generation:(previous?.generation||0)+1;
     updates.push(db.prepare('INSERT INTO qualifying_buy_state(id,portfolio,ticker,active,generation,updated_at) VALUES(?,?,?,1,?,?) ON CONFLICT(id) DO UPDATE SET active=1,generation=excluded.generation,updated_at=excluded.updated_at').bind(key,target.portfolio,target.ticker,generation,time));
     const id=key+':'+generation;
     const exists=await db.prepare('SELECT id FROM qualifying_buy_alerts WHERE id=?').bind(id).first();if(exists)continue;
     let data;try{data=await deps.execution(target.portfolio,target.ticker);}catch{waiting=true;continue;}
     const summary=tradeSummary(data,'buy');if(!summary.show||(empirical&&!summary.ready)){waiting=true;continue;}
     updates.push(db.prepare("INSERT OR IGNORE INTO qualifying_buy_alerts(id,review_id,portfolio,ticker,quantity,limit_price,currency,reason,risk,created_at,expires_at,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,'pending')").bind(id,run.id,target.portfolio,target.ticker,summary.quantity,summary.limit,summary.currency,cardText(target.reason),cardText(target.risk),time,new Date(Date.parse(run.as_of)+6*3600000).toISOString()));
    }
    const current=await db.prepare(empirical?"SELECT updated_at FROM rule_reports WHERE id='latest'":"SELECT updated_at FROM reports WHERE id='latest'").first();
    if(current.updated_at!==run.completed_at)await db.prepare("UPDATE buy_review_runs SET status='superseded',lease_until=NULL WHERE id=?").bind(run.id).run();
    else{updates.push(db.prepare('UPDATE buy_review_runs SET status=?,lease_until=NULL,error=? WHERE id=?').bind(waiting?'pending':'processed',waiting?'A qualifying buy is waiting for a usable share quantity and recommended limit price; retrying on the next monitor pass.':null,run.id));await db.batch(updates);}
   }
  }catch{await db.prepare("UPDATE buy_review_runs SET lease_until=NULL,error='Qualifying-buy checks unavailable; retrying on the next monitor pass.' WHERE id=?").bind(run.id).run();}}
 }
 const events=(await db.prepare("SELECT * FROM qualifying_buy_alerts WHERE status='pending' AND expires_at>? AND (next_attempt IS NULL OR next_attempt<=?) ORDER BY created_at LIMIT 20").bind(time,time).all()).results;
 for(const event of events){
  const state=await db.prepare('SELECT active,generation FROM qualifying_buy_state WHERE id=?').bind(positionKey(event.portfolio,event.ticker)).first();
  if(!state?.active||event.id!==positionKey(event.portfolio,event.ticker)+':'+state.generation){await db.prepare("UPDATE qualifying_buy_alerts SET status='cancelled' WHERE id=? AND status='pending'").bind(event.id).run();continue;}
  let data;try{data=await deps.execution(event.portfolio,event.ticker);}catch{continue;}
  const summary=tradeSummary(data,'buy');if(!summary.show||(empirical&&!summary.ready))continue; // Wait for usable price and sizing; no invented order details.
  const claim=await db.prepare("UPDATE qualifying_buy_alerts SET status='sending' WHERE id=? AND status='pending'").bind(event.id).run();if(!claim.meta.changes)continue;
  try{
   const status=summary.ready?'Current limit plan':summary.label;
   const content=`NEW QUALIFYING BUY — ${event.ticker}\nPortfolio: ${event.portfolio}\nBuy ${summary.quantity.toLocaleString('en-IN',{maximumFractionDigits:4})} shares · Limit ${summary.limit.toFixed(2)} ${summary.currency}\nWhy it qualifies: ${event.reason.slice(0,850)}\nBefore buying: ${(event.risk||'Confirm the company outlook and live broker quote.').slice(0,300)}\n${status}. ${summary.ready?'Confirm the broker quote before ordering.':'This is a conditional price plan; check it before placing an order.'}\nDetected: ${formatIST(event.created_at,true)} · Quote: ${formatIST(summary.quoteTime,true)}\nNo order placed.`;
   const sent=await deps.send(content.slice(0,1900));
   if(sent.status===429){const seconds=Math.min(3600,Math.max(1,Number(sent.headers.get('Retry-After'))||60));await db.prepare("UPDATE qualifying_buy_alerts SET status='pending',next_attempt=?,error='Discord rate limit; delivery will retry.' WHERE id=?").bind(new Date(Date.now()+seconds*1000).toISOString(),event.id).run();continue;}
   if(!sent.ok)throw Error('Delivery failed');
   await db.prepare("UPDATE qualifying_buy_alerts SET status='delivered',delivered_at=?,quantity=?,limit_price=?,error=NULL,next_attempt=NULL WHERE id=?").bind(iso(),summary.quantity,summary.limit,event.id).run();
  }catch{await db.prepare("UPDATE qualifying_buy_alerts SET status='failed',error='Discord delivery failed or could not be confirmed. Not retried automatically to prevent duplicates.' WHERE id=?").bind(event.id).run();}
 }
}
