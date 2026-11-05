import {priceAlertContent} from './alert-copy';
import {tradeSummary} from './trade-summary';
import {initBuyAlerts,processBuyReviews} from './qualifying-buys';
import {executionHandler,createExecutionSession} from './execution';
const json=(v:any,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
export function validWebhook(value:string){try{const u=new URL(value);return u.protocol==='https:'&&['discord.com','discordapp.com'].includes(u.hostname)&&!u.port&&!u.username&&!u.password&&/^\/api\/webhooks\/\d+\/[\w-]+$/.test(u.pathname)&&!u.search&&!u.hash;}catch{return false;}}
export function reached(side:string,price:number,target:number){return side==='buy'?price<=target:price>=target;}
async function init(db:any){await db.batch([
 db.prepare('CREATE TABLE IF NOT EXISTS alert_settings(id TEXT PRIMARY KEY, webhook TEXT, enabled INTEGER DEFAULT 0, heartbeat TEXT, error TEXT, auto_arm INTEGER DEFAULT 1, scanned TEXT, new_buys INTEGER DEFAULT 1)'),
 db.prepare('CREATE TABLE IF NOT EXISTS price_alerts(id TEXT PRIMARY KEY, ticker TEXT, portfolio TEXT, intent TEXT, budget TEXT, side TEXT, target REAL, currency TEXT, expires TEXT, status TEXT, created TEXT, delivered TEXT, error TEXT)'),
 db.prepare("INSERT OR IGNORE INTO alert_settings(id) VALUES('owner')")]);await initBuyAlerts(db);}
async function crypt(value:string,secret:string,decrypt=false){const key=await crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret)),{name:'AES-GCM'},false,['encrypt','decrypt']);if(decrypt){const bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12)},key,bytes.slice(12)));}const iv=crypto.getRandomValues(new Uint8Array(12)),cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(value)));return btoa(String.fromCharCode(...iv,...cipher));}
export async function alertsHandler(request:Request,env:any){
 await init(env.DB);const url=new URL(request.url),tick=url.pathname==='/api/alerts/tick';
 if(tick){if(request.method!=='POST'||!env.RUNNER_SHARED_SECRET||request.headers.get('Authorization')!=='Bearer '+env.RUNNER_SHARED_SECRET)return json({error:'Unauthorized'},401);return poll(env,url.origin);}
 if(request.method==='GET'){const settings=await env.DB.prepare("SELECT enabled,auto_arm,new_buys,heartbeat,error,webhook IS NOT NULL AS configured FROM alert_settings WHERE id='owner'").first();const alerts=await env.DB.prepare('SELECT * FROM price_alerts ORDER BY created DESC LIMIT 100').all();const buys=await env.DB.prepare('SELECT id,portfolio,ticker,quantity,limit_price,currency,status,created_at,delivered_at,error FROM qualifying_buy_alerts ORDER BY created_at DESC LIMIT 100').all();const reviews=await env.DB.prepare("SELECT error FROM buy_review_runs WHERE status='pending' AND error IS NOT NULL ORDER BY completed_at DESC LIMIT 1").first();return json({settings,alerts:alerts.results,newBuyAlerts:buys.results,newBuyError:reviews?.error||null});}
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 if(request.headers.get('Origin')!==url.origin)return json({error:'Invalid origin'},403);
 const raw=await request.text();if(raw.length>5000)return json({error:'Request too large'},413);const b=JSON.parse(raw);
 if(b.operation==='settings'){
 if(!env.ALERT_ENCRYPTION_KEY)return json({error:'Server alert encryption key is missing.'},503);
 if(b.webhook){if(!validWebhook(b.webhook))return json({error:'Enter a valid Discord webhook URL.'},400);await env.DB.prepare("UPDATE alert_settings SET webhook=? WHERE id='owner'").bind(await crypt(b.webhook,env.ALERT_ENCRYPTION_KEY)).run();}
 await env.DB.prepare("UPDATE alert_settings SET enabled=?,auto_arm=?,new_buys=COALESCE(?,new_buys),webhook=CASE WHEN ? THEN NULL ELSE webhook END WHERE id='owner'").bind(b.enabled?1:0,b.autoArm===false?0:1,b.newBuys===undefined?null:b.newBuys?1:0,b.remove?1:0).run();return json({ok:true});
 }
 if(b.operation==='cancel'){await env.DB.prepare("UPDATE price_alerts SET status='cancelled' WHERE id=? AND status='armed'").bind(String(b.id)).run();return json({ok:true});}
 if(b.operation!=='arm')return json({error:'Unknown operation'},400);
 const query=new URLSearchParams({ticker:String(b.ticker||''),portfolio:String(b.portfolio||''),intent:b.intent==='exit'?'exit':'recommended'});if(b.budget)query.set('budget',String(b.budget));
 const response=await executionHandler(new Request(url.origin+'/api/execution?'+query),env);const d:any=await response.json();
 if(!response.ok||!tradeSummary(d,d.plan?.side).ready)return json({error:'A fresh, actionable, sized regular-session plan is required to arm an alert.'},409);
 const expires=new Date(d.technical.sessionEnd*1000).toISOString(),id=crypto.randomUUID();
 await env.DB.batch([env.DB.prepare("UPDATE price_alerts SET status='superseded' WHERE ticker=? AND portfolio=? AND intent=? AND status='armed'").bind(d.ticker,d.portfolio,d.intent),env.DB.prepare('INSERT INTO price_alerts(id,ticker,portfolio,intent,budget,side,target,currency,expires,status,created) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,d.ticker,d.portfolio,d.intent,b.budget?String(b.budget):null,d.plan.side,d.plan.limit,d.technical.currency,expires,'armed',new Date().toISOString())]);
 return json({ok:true,message:'Alert armed at '+d.plan.limit+' '+d.technical.currency+'. Expires at this session’s close.'});
}
async function poll(env:any,origin:string){
 const time=new Date().toISOString();await env.DB.prepare("UPDATE alert_settings SET heartbeat=? WHERE id='owner'").bind(time).run();await env.DB.prepare("UPDATE price_alerts SET status='expired' WHERE status='armed' AND expires<=?").bind(time).run();
 const cfg=await env.DB.prepare("SELECT * FROM alert_settings WHERE id='owner'").first();if(!cfg.enabled||!cfg.webhook)return json({ok:true,paused:true});
 const executions=createExecutionSession(env);
 await processBuyReviews(env,cfg,{
 snapshot:()=>executions.snapshot(),
 discovery:()=>executions.discovery(),
 execution:async(portfolio,ticker)=>{const q=new URLSearchParams({ticker,portfolio,intent:'recommended'});const r=await executions.response({ticker,portfolio,intent:'recommended'});if(!r.ok)throw Error('Price plan unavailable');return r.json();},
 send:async(content)=>{const webhook=await crypt(cfg.webhook,env.ALERT_ENCRYPTION_KEY,true);if(!validWebhook(webhook))throw Error('Invalid webhook');return fetch(webhook+'?wait=true',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json'},body:JSON.stringify({content,allowed_mentions:{parse:[]}}),signal:AbortSignal.timeout(15000)});}
 });
 if(cfg.auto_arm&&(!cfg.scanned||Date.now()-Date.parse(cfg.scanned)>=300000)){
 await env.DB.prepare("UPDATE alert_settings SET scanned=? WHERE id='owner'").bind(time).run();
 try{const snap=await executions.snapshot();const targets=snap.holdings.filter((h:any)=>!h.nonDiscretionary&&['Trim','Add candidate','Profit review'].includes(h.action)).map((h:any)=>({ticker:h.ticker,portfolio:h.portfolio}));
 let ideas:any[]=[];
 if(env.RULES_BASED_BUYS==='1'){ideas=(await executions.discovery()).ideas||[];}
 else{const report=await env.DB.prepare("SELECT new_stock_ideas_json FROM reports WHERE id='latest' AND provider IN ('antigravity','codex-subscription')").first();ideas=JSON.parse(report?.new_stock_ideas_json||'[]');}
 for(const idea of ideas)if(idea.decision==='enter')targets.push({ticker:idea.ticker,portfolio:idea.portfolio});
 for(const target of targets){try{const q=new URLSearchParams({...target,intent:'recommended'}),r=await executions.response({...target,intent:'recommended'});if(!r.ok)continue;const d:any=await r.json();if(!tradeSummary(d,d.plan?.side).ready)continue;
 const existing=await env.DB.prepare('SELECT id FROM price_alerts WHERE ticker=? AND portfolio=? AND side=? AND expires=? LIMIT 1').bind(d.ticker,d.portfolio,d.plan.side,new Date(d.technical.sessionEnd*1000).toISOString()).first();if(existing)continue;
 const id=['auto',d.technical.sessionDate,d.ticker,d.portfolio,d.plan.side].join(':');
 await env.DB.prepare('INSERT OR IGNORE INTO price_alerts(id,ticker,portfolio,intent,budget,side,target,currency,expires,status,created) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,d.ticker,d.portfolio,'recommended',null,d.plan.side,d.plan.limit,d.technical.currency,new Date(d.technical.sessionEnd*1000).toISOString(),'armed',time).run();
 }catch{}}
 await env.DB.prepare("UPDATE alert_settings SET error=NULL WHERE id='owner'").run();
 }catch{await env.DB.prepare("UPDATE alert_settings SET error='Automatic recommendation scan unavailable; retrying in five minutes.' WHERE id='owner'").run();}
 }
 const rows=await env.DB.prepare("SELECT * FROM price_alerts WHERE status='armed' ORDER BY created LIMIT 30").all();
 for(const row of rows.results){try{
 const q=new URLSearchParams({ticker:row.ticker,portfolio:row.portfolio,intent:row.intent});if(row.budget)q.set('budget',row.budget);
 const r=await executions.response({ticker:row.ticker,portfolio:row.portfolio,intent:row.intent,budget:row.budget});const d:any=await r.json();if(!r.ok)throw Error('Price-plan refresh unavailable');
 if(!tradeSummary(d,row.side).ready||d.plan.side!==row.side||d.technical.currency!==row.currency||!reached(row.side,d.technical.price,row.target))continue;
 // Claim before delivery: ambiguous network failures never create repeated alerts.
 const claim=await env.DB.prepare("UPDATE price_alerts SET status='sending' WHERE id=? AND status='armed'").bind(row.id).run();if(!claim.meta.changes)continue;
 const webhook=await crypt(cfg.webhook,env.ALERT_ENCRYPTION_KEY,true);if(!validWebhook(webhook))throw Error('Stored webhook invalid');
 const content=priceAlertContent(row,d);
 const sent=await fetch(webhook+'?wait=true',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json'},body:JSON.stringify({content,allowed_mentions:{parse:[]}}),signal:AbortSignal.timeout(15000)});
 if(!sent.ok)throw Error('Discord delivery HTTP '+sent.status);
 await env.DB.prepare("UPDATE price_alerts SET status='delivered',delivered=?,error=NULL WHERE id=?").bind(new Date().toISOString(),row.id).run();
 }catch{await env.DB.prepare("UPDATE price_alerts SET error='Refresh or delivery failed. Sending failures need review before rearming.',status=CASE WHEN status='sending' THEN 'failed' ELSE status END WHERE id=?").bind(row.id).run();}}
 return json({ok:true});
}
