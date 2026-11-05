/** News must not depend on an affordable order, an open session or a working FX quote. */
export function newsTargets(snap:any,live:any){
 const held=snap.holdings.filter((h:any)=>!h.nonDiscretionary&&['Add candidate','Trim','Profit review','Trim review','Exit review'].includes(h.action)).map((h:any)=>h.ticker);
 const candidates=[...(live.discovery?.candidates||[])].filter((c:any)=>c.status==='eligible'&&c.ticker!=='ORCL').sort((a:any,b:any)=>(Date.parse(live.discovery.events?.[a.ticker]?.checkedAt||'')||0)-(Date.parse(live.discovery.events?.[b.ticker]?.checkedAt||'')||0)||a.ticker.localeCompare(b.ticker));
 return [...new Set<string>([...held,...candidates.map((c:any)=>c.ticker)])].slice(0,200);
}
/** Research alternatives independently; actual allocation enforces their combined cash/exposure caps. */
export function marketTargets(snap:any,live:any){
 const out:any[]=snap.holdings.filter((h:any)=>!h.nonDiscretionary&&['Add candidate','Trim','Profit review','Trim review','Exit review'].includes(h.action)).map((h:any)=>({ticker:h.ticker,portfolio:h.portfolio}));
 const unique=new Set(out.map(t=>t.ticker));
 const queues=snap.portfolios.filter((p:any)=>p.complete&&p.cash>0).map((p:any)=>{
  const own=snap.holdings.filter((h:any)=>h.portfolio===p.name);
  const exposure=(predicate:(h:any)=>boolean)=>own.filter(predicate).reduce((s:number,h:any)=>s+(h.value||0),0);
  const cyclic=exposure(h=>['Industrials','Commodities'].includes(h.sector)),commodity=exposure(h=>h.sector==='Commodities'),value=exposure(h=>h.category==='C');
  // Oldest/unknown event coverage first so early alphabetical entries cannot monopolize every review.
  const priority=(c:any)=>Date.parse(live.discovery.events?.[c.ticker]?.checkedAt||'')||0;
  const pools=['IN','US'].map(m=>live.discovery.candidates.filter((c:any)=>{
   if(c.market!==m||c.status!=='eligible')return false;
   const gate=snap.buyGates?.[JSON.stringify([p.name,c.ticker])];if(gate&&!gate.allowed)return false;
   const unit=c.price*(c.currency==='INR'?1:live.discovery.fx);if(!Number.isFinite(unit)||unit<=0)return false;
   const aggregate=snap.holdings.filter((h:any)=>h.ticker===c.ticker).reduce((s:number,h:any)=>s+(h.value||0),0);
   let cap=Math.min(p.cash,p.value*.05,Math.max(0,snap.totals.value*.15-aggregate));
   if(['Industrials','Commodities'].includes(c.sector))cap=Math.min(cap,Math.max(0,p.value*.25-cyclic));
   if(c.sector==='Commodities')cap=Math.min(cap,Math.max(0,p.value*.20-commodity));
   if(c.category==='C')cap=Math.min(cap,Math.max(0,p.value*.15-value));
   const quantity=c.currency==='INR'?Math.floor(cap/unit):Math.floor(cap/unit*10000)/10000;
   return quantity>0&&quantity*unit>=p.value*.03;
  }).sort((a:any,b:any)=>priority(a)-priority(b)||a.ticker.localeCompare(b.ticker)));
  const alternatives:any[]=[];while(pools.some(q=>q.length))for(const q of pools)if(q.length)alternatives.push({ticker:q.shift().ticker,portfolio:p.name});return alternatives;
 });
 // Share finite monitoring capacity between portfolios, rather than exhausting it on the first one.
 while(out.length<230&&queues.some((q:any[])=>q.length))for(const q of queues){if(out.length>=230)break;const target=q.shift();if(!target)continue;if(!unique.has(target.ticker)&&unique.size>=200)continue;out.push(target);unique.add(target.ticker);}
 return out;
}
