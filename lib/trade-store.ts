import {DEFAULT_TRADE_POLICY,validateTradePolicy,decorateTrades,tradeKey,profitFingerprint} from './trade-policy';
export async function tradeSettings(env:any){const row=await env.DB.prepare("SELECT config_json FROM trade_settings WHERE id='owner'").first();return row?validateTradePolicy(JSON.parse(row.config_json)):{...DEFAULT_TRADE_POLICY};}
export async function withTrades(env:any,snap:any){if(env.RULES_BASED_BUYS!=='1')return snap;const policy=await tradeSettings(env),rows=await env.DB.prepare('SELECT * FROM trade_reviews').all();const result=decorateTrades(snap,policy,rows.results);
 for(const h of result.holdings){const id=tradeKey(h.portfolio,h.ticker),fingerprint=profitFingerprint(h,policy),old=rows.results.find((r:any)=>r.id===id&&r.kind==='profit-trigger');
  if(h.profitReview.triggered&&old?.fingerprint!==fingerprint)await env.DB.prepare("INSERT INTO trade_reviews(id,kind,fingerprint,created_at) VALUES(?,'profit-trigger',?,?) ON CONFLICT(id,kind) DO UPDATE SET fingerprint=excluded.fingerprint,created_at=excluded.created_at").bind(id,fingerprint,new Date().toISOString()).run();
  else if(old&&(old.fingerprint!==fingerprint||(!h.quote?.stale&&Number.isFinite(h.profitReview.gainPct)&&h.profitReview.gainPct+1e-8<Math.max(0,policy.gainThresholdPct-5))))await env.DB.prepare("DELETE FROM trade_reviews WHERE id=? AND kind='profit-trigger'").bind(id).run();
 }
 return result;}
