/** Best-effort observability; failures never launch or repeat a model call. */
export function createProgressReporter(send,{intervalMs=10000,onLeaseLost=()=>{},log=()=>{}}={}){
 let current={phase:'snapshot',searches:0,documentReads:0},sequence=0,dirty=false,inFlight=null,closed=false;
 async function flush(){if(closed)return;if(inFlight)return inFlight;inFlight=(async()=>{while(dirty&&!closed){dirty=false;const payload={...current,sequence:++sequence};try{await send(payload)}catch(e){log({event:'progress_delivery_failed',status:e.status||null});if(e.status===409){closed=true;onLeaseLost();}else dirty=true;break;}}})().finally(()=>{inFlight=null});return inFlight;}
 const timer=setInterval(()=>{void flush()},intervalMs);timer.unref?.();
 return {async phase(phase,counts={}){current={...current,...counts,phase};dirty=true;await flush()},activity(event){if(event.webSearches!==undefined)current.searches=Math.max(current.searches,event.webSearches);if(event.documentReads!==undefined)current.documentReads=Math.max(current.documentReads,event.documentReads);dirty=true;},flush,async close(){clearInterval(timer);await flush();closed=true;}};
}
