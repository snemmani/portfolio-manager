import {lookup} from 'node:dns/promises';
import {request} from 'node:https';
import {isIP} from 'node:net';
export function publicAddress(address){
 if(isIP(address)===6)return /^[23][0-9a-f]{0,3}:/i.test(address);
 if(isIP(address)!==4)return false;
 const [a,b,c]=address.split('.').map(Number);return a>0&&a<224&&a!==10&&a!==127&&!(a===100&&b>=64&&b<=127)&&!(a===169&&b===254)&&!(a===172&&b>=16&&b<=31)&&!(a===192&&(b===168||b===0||b===2))&&!(a===198&&(b===18||b===19||b===51&&c===100))&&!(a===203&&b===0&&c===113);
}
export async function reachableSource(raw,profile,{allowed,resolve=host=>lookup(host,{all:true}),transport=request,redirects=0}={}){
 if(!allowed(raw,profile)||redirects>3)return false;
 const url=new URL(raw);let timer;let addresses;try{addresses=await Promise.race([resolve(url.hostname),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Public-source DNS lookup timed out')),3000);timer.unref?.();})]);}finally{clearTimeout(timer);}if(!addresses.length||!addresses.every(a=>publicAddress(a.address)))return false;
 return new Promise(resolveResult=>{
  let done=false;const finish=value=>{if(done)return;done=true;resolveResult(value);};
  const req=transport(url,{headers:{'User-Agent':'Mozilla/5.0 (Arthapalana public company research)',Accept:'text/html,application/pdf'},lookup:(host,options,cb)=>options.all?cb(null,[addresses[0]]):cb(null,addresses[0].address,addresses[0].family)},res=>{
   if([301,302,303,307,308].includes(res.statusCode)&&res.headers.location){res.destroy();reachableSource(new URL(res.headers.location,url).href,profile,{allowed,resolve,transport,redirects:redirects+1}).then(finish,()=>finish(false));return;}
   const type=String(res.headers['content-type']||'');if(res.statusCode!==200||!/html|pdf|xml|text\/plain/i.test(type)){res.destroy();finish(false);return;}
   // Connectivity check only. The research model reads/cites documents; this is not an audit of their claims.
   res.once('data',()=>{finish(true);res.destroy();});res.once('end',()=>finish(false));res.once('error',()=>finish(false));res.resume();
  });req.setTimeout(8000,()=>{req.destroy();finish(false)});req.once('error',()=>finish(false));req.end();
 });
}
export async function checkResearchSources(reviews,profiles,{allowed,check=reachableSource,now=Date.now,budgetMs=150000,log=()=>{}}={}){
 const work=reviews.flatMap(r=>(r.sources||[]).map(s=>({ticker:r.ticker,url:s.url}))),cache=new Map(),out=[],end=now()+budgetMs;let next=0;
 await Promise.all(Array.from({length:Math.min(4,work.length)},async()=>{while(next<work.length){const item=work[next++],key=item.ticker+'\0'+item.url;let value=cache.get(key);if(value===undefined){value=now()<end?check(item.url,profiles?.[item.ticker],{allowed}).catch(()=>false):Promise.resolve(false);cache.set(key,value);}const reachable=await value;out.push({...item,reachable});if(!reachable)log({event:'research_source_unavailable',ticker:item.ticker});}}));return out;
}
