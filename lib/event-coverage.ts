const sources=['Yahoo Finance RSS','Google News RSS','Bing News RSS'];
/** Retain auditable source results; transport success alone cannot clear missing news/calendar evidence. */
export function eventCoverage(item:any,now=Date.now()){
 const current=(part:any)=>part?.ok===true&&Number.isFinite(Date.parse(part.checkedAt))&&now-Date.parse(part.checkedAt)<=30*60000&&Date.parse(part.checkedAt)<=now+60000;
 const n=item.news,c=item.calendar;
 const attempts=Array.isArray(n?.attempts)?n.attempts.slice(0,3).filter((a:any)=>sources.includes(a?.source)).map((a:any)=>({source:a.source,status:a.status==='available'?'available':'unavailable',reason:a.reason?String(a.reason).slice(0,180):undefined})):[];
 return {coverageVersion:2,news:{ok:current(n)&&sources.includes(n.source)&&attempts.some((a:any)=>a.source===n.source&&a.status==='available'),source:sources.includes(n?.source)?n.source:null,checkedAt:n?.checkedAt||null,articlesMatched:Number.isFinite(n?.articlesMatched)?Math.max(0,Math.min(200,n.articlesMatched)):0,empty:n?.empty===true,attempts},calendar:{ok:current(c)&&c.source==='Yahoo Finance company calendar'&&Array.isArray(c.events)&&c.events.length<=4&&c.events.every((e:any)=>['earnings','dividend'].includes(e?.kind)&&Number.isFinite(Date.parse(e.at))),source:'Yahoo Finance company calendar',checkedAt:c?.checkedAt||null,events:Array.isArray(c?.events)?c.events.slice(0,4).map((e:any)=>({kind:e.kind,at:e.at})):[]}};
}
