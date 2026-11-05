import {watchWebHealth} from './web-health.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const secrets=JSON.parse(await readFile('/run/secrets/arthapalana.json','utf8'));
const documentSecret=(await readFile('/run/secrets/documents_token','utf8')).trim();
await mkdir('/app/.runner-private/work',{recursive:true,mode:0o700});
await writeFile('/app/.runner-private/connection.json',JSON.stringify({siteUrl:'http://web:8787/',siteBearer:'',sharedSecret:secrets.RUNNER_SHARED_SECRET,documentSecret}),{mode:0o600});
function run(args,watchHealth=false){return new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,args,{stdio:'inherit'});let forceTimer,unhealthy=false;
 const monitor=watchHealth?watchWebHealth({onUnhealthy:()=>{unhealthy=true;console.error('Web runtime is unresponsive; restarting the web container.');child.kill('SIGTERM');forceTimer=setTimeout(()=>child.kill('SIGKILL'),5000);}}):null;
 const stop=()=>child.kill('SIGTERM');process.on('SIGTERM',stop);
 child.on('error',reject);child.on('exit',code=>{monitor?.stop();clearTimeout(forceTimer);process.removeListener('SIGTERM',stop);code===0&&!unhealthy?resolve():reject(Error(unhealthy?'Web health check failed; automatic restart requested.':'Process exited '+code));});
});}
if(process.argv[2]==='web'){
 const config=JSON.parse(await readFile('/app/dist/server/wrangler.json','utf8'));
 config.main='/app/dist/server/index.js';config.assets.directory='/app/dist/client';config.vars={...secrets,LOCAL_DOCKER:'1',RULES_BASED_BUYS:'1',DOCUMENT_SHARED_SECRET:documentSecret,PUBLIC_ORIGIN:process.env.PUBLIC_ORIGIN||''};
 config.d1_databases[0].migrations_dir='/app/drizzle';
 await writeFile('/app/.runner-private/wrangler.json',JSON.stringify(config),{mode:0o600});
 const cli=['/app/node_modules/wrangler/bin/wrangler.js'],common=['--config','/app/.runner-private/wrangler.json','--local','--persist-to','/data'];
 await run([...cli,'d1','migrations','apply','DB',...common]);
 await run([...cli,'dev',...common,'--ip','0.0.0.0','--port','8787','--inspector-port','0','--log-level','error'],true);
}else if(process.argv[2]==='market'){await run(['/app/runner/market.mjs']);}
else if(process.argv[2]==='runner'){await run(['/app/runner/index.mjs']);}
else if(process.argv[2]==='alerts'){
 let stopped=false;process.on('SIGTERM',()=>{stopped=true;});
 while(!stopped){try{const r=await fetch('http://web:8787/api/alerts/tick',{method:'POST',headers:{Authorization:'Bearer '+secrets.RUNNER_SHARED_SECRET},signal:AbortSignal.timeout(180000)});if(!r.ok)console.error('Alert monitor HTTP '+r.status);}catch{console.error('Alert monitor: app unavailable');}if(!stopped)await new Promise(resolve=>setTimeout(resolve,60000));}
}else throw Error('Unknown service');
