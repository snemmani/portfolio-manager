import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ControlClient,Checkpoint,safeError} from './market-support.mjs';
import {runMarketCycle} from './market-cycle.mjs';
import * as engine from '../.runner-private/market-engine.mjs';
const config=JSON.parse(await readFile('/app/.runner-private/connection.json','utf8'));
const log=event=>console.log(JSON.stringify({time:new Date().toISOString(),component:'market-monitor',...event,error:event.error?safeError(event.error,[config.sharedSecret]):undefined}));
const client=new ControlClient({secret:config.sharedSecret,log}),checkpoint=new Checkpoint(process.env.ARTHAPALANA_REVIEW_CHECKPOINT||'/screening/monitor/checkpoint.json');
let stopped=false;process.on('SIGTERM',()=>{stopped=true});
async function python(script,input){const child=promisify(execFile)('/opt/python/bin/python',['/app/runner/'+script],{env:{HOME:process.env.HOME,PATH:process.env.PATH,ARTHAPALANA_SCREEN_CACHE:process.env.ARTHAPALANA_SCREEN_CACHE},timeout:270000,maxBuffer:12000000});child.child.stdin.end(JSON.stringify(input));try{return JSON.parse((await child).stdout)}catch(e){throw Error(script+': '+(e.killed?'time budget exceeded':safeError(e.message)));}}
while(!stopped){try{await runMarketCycle({client,checkpoint,python,engine,log,stopped:()=>stopped});}catch{}
 if(!stopped)await new Promise(resolve=>setTimeout(resolve,60000));
}
