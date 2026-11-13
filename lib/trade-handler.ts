import {dashboard,invalidateDashboard} from './data';
import {executionHandler} from './execution';
import {tradeSettings} from './trade-store';
import {tradeKey,profitFingerprint,validateTradePolicy,decisionAction} from './trade-policy';
const json=(v:any,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
export async function tradeHandler(request:Request,env:any){
 if(request.method==='GET'){const snap=await dashboard(env);return json({policy:await tradeSettings(env),reentries:snap.reentries||[],profitReviews:snap.holdings.filter((h:any)=>h.profitReview?.triggered).map((h:any)=>({portfolio:h.portfolio,ticker:h.ticker,action:decisionAction(h),...h.profitReview}))});}
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 const url=new URL(request.url);if(request.headers.get('Origin')!==url.origin)return json({error:'Invalid origin'},403);
 const raw=await request.text();if(raw.length>5000)return json({error:'Request too large'},413);let b;try{b=JSON.parse(raw)}catch{return json({error:'Invalid JSON'},400)}
 if(b.operation==='settings'){let policy;try{policy=validateTradePolicy(b.policy)}catch(e:any){return json({error:e.message},400)}await env.DB.prepare("INSERT INTO trade_settings(id,config_json,updated_at) VALUES('owner',?,?) ON CONFLICT(id) DO UPDATE SET config_json=excluded.config_json,updated_at=excluded.updated_at").bind(JSON.stringify(policy),new Date().toISOString()).run();return json({ok:true,message:'Trade review settings saved. Existing profit approvals must be reviewed again if their settings changed.'});}
 if(!['review_profit','review_reentry'].includes(b.operation)||b.confirmed!==true)return json({error:'An explicit review is required.'},400);
 invalidateDashboard();const snap=await dashboard(env),key=tradeKey(String(b.portfolio),String(b.ticker));let fingerprint,kind;
 if(b.operation==='review_profit'){
  const h=snap.holdings.find((h:any)=>h.portfolio===b.portfolio&&h.ticker===b.ticker);if(!h||decisionAction(h)!=='Profit review')return json({error:'There is no current profit-taking review for this holding.'},409);
  const q=new URLSearchParams({portfolio:h.portfolio,ticker:h.ticker,intent:'profit'});const response=await executionHandler(new Request(url.origin+'/api/execution?'+q),env);if(!response.ok)return json({error:'Current price and event evidence are unavailable.'},409);const d:any=await response.json();
  if(!d.saleAssessment?.reviewable)return json({error:'This sale does not pass the current profit-taking checks. '+(d.saleAssessment?.checks?.join(' ')||'')},409);
  fingerprint=profitFingerprint(h,snap.tradePolicy);if(b.fingerprint!==fingerprint)return json({error:'The holding or settings changed. Refresh and review the updated sale.'},409);kind='profit';
 }else{const h=snap.reentries?.find((h:any)=>h.portfolio===b.portfolio&&h.ticker===b.ticker);if(!h||!h.active||h.invalid)return json({error:'There is no valid active re-entry watch for this position.'},409);fingerprint=h.historyKey;if(b.fingerprint!==fingerprint)return json({error:'The recorded trades changed. Refresh and review the latest sale.'},409);kind='reentry';}
 await env.DB.prepare('INSERT INTO trade_reviews(id,kind,fingerprint,created_at) VALUES(?,?,?,?) ON CONFLICT(id,kind) DO UPDATE SET fingerprint=excluded.fingerprint,created_at=excluded.created_at').bind(key,kind,fingerprint,new Date().toISOString()).run();
 await env.DB.prepare("UPDATE market_state SET requested=1 WHERE id='local'").run();return json({ok:true,message:kind==='profit'?'Profit-taking assessment reviewed for up to 24 hours. Current prices and all execution checks still apply.':'Reason for the sale marked reviewed. Waiting period, price, financial, event and exposure checks still apply.'});
}
