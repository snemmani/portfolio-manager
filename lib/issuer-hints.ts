import catalog from '../runner/issuer-sources.json';
import {publicSourceUrl} from './fundamental-contract';
/** Machine-discovered links are retrieval hints, never verified financial evidence. */
export function issuerProfile(p:any){
 const trusted=(catalog as Record<string,any>)[p.ticker]||{},seen=new Set<string>(),hints:any[]=[];
 const discovered=(Array.isArray(p.sourceHints)?p.sourceHints:[]).slice(0,8).flatMap((h:any)=>{
  const u=publicSourceUrl(h?.url);
  if(!u||!['nsearchives.nseindia.com','archives.nseindia.com'].includes(u.hostname)||!/^\/(annual_reports|corporate)\/.+\.pdf$/i.test(u.pathname)||!['annual_report','results','filing'].includes(h.kind))return [];
  return [{title:String(h.title||'NSE issuer filing').replace(/[\r\n]/g,' ').slice(0,180),url:u.href,kind:h.kind}];
 });
 for(const h of [...(trusted.sourceHints||[]),...discovered])if(!seen.has(h.url)){seen.add(h.url);hints.push(h);}
 return {name:p.name.slice(0,200),website:publicSourceUrl(p.website)?.href||null,...trusted,...(hints.length?{sourceHints:hints.slice(0,4)}:{})};
}
