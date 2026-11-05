/** A hung child is still "running" to Docker. Exit it so restart: unless-stopped can recover. */
export function watchWebHealth({onUnhealthy,fetcher=fetch,now=Date.now,warmupMs=90000,intervalMs=20000,failuresAllowed=3}){
 const started=now();let failures=0,busy=false,stopped=false;
 async function probe(){
  if(stopped||busy||now()-started<warmupMs)return;
  busy=true;
  try{const r=await fetcher('http://127.0.0.1:8787/api/health',{signal:AbortSignal.timeout(5000)});await r.body?.cancel();if(!r.ok)throw Error('Unhealthy');failures=0;}
  catch{if(++failures>=failuresAllowed){stop();onUnhealthy();}}
  finally{busy=false;}
 }
 const timer=setInterval(probe,intervalMs);timer.unref?.();
 function stop(){stopped=true;clearInterval(timer);}
 return {probe,stop};
}
