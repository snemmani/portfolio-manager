import {prepareAnnualDocuments} from './prepare-documents.mjs';
import {createProgressReporter} from './progress-reporter.mjs';
import {randomUUID} from 'node:crypto';
import {runResearchTurn} from './research-turn.mjs';
import {checkResearchSources} from './research-sources.mjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,unlink,mkdir,chmod} from 'node:fs/promises';
import {hostname} from 'node:os';
import {fileURLToPath} from 'node:url';
import {newResearchThread,verifyAuthentication,researchEnvironment} from './antigravity.mjs';
import {researchPrompt,researchOutputSchema,documentPreparationPrompt,documentPreparationSchema,validateRecommendations,primarySource} from '../.runner-private/research-contract.mjs';
const root=new URL('../',import.meta.url),privateDir=new URL('.runner-private/',root),work=fileURLToPath(new URL('work/',privateDir));
const credentials=JSON.parse(await readFile(new URL('connection.json',privateDir),'utf8'));
const origin=new URL(credentials.siteUrl);if(!(process.env.ARTHAPALANA_LOCAL==='1'&&origin.href==='http://web:8787/')&&(origin.protocol!=='https:'||origin.pathname!=='/'||!origin.hostname.endsWith('.chatgpt.site')))throw Error('Invalid private Site origin');
const secretHeaders={'Content-Type':'application/json','Authorization':'Bearer '+credentials.sharedSecret,'OAI-Sites-Authorization':'Bearer '+credentials.siteBearer};
const args=new Set(process.argv.slice(2)),once=args.has('--once'),check=args.has('--check');
await mkdir(work,{recursive:true,mode:0o700});await chmod(privateDir,0o700);
let shutdown=false;const active=new AbortController();for(const s of ['SIGTERM','SIGINT'])process.on(s,()=>{shutdown=true;active.abort();});
const sleep=ms=>new Promise(resolve=>{const finish=()=>{clearTimeout(t);active.signal.removeEventListener('abort',finish);resolve()};const t=setTimeout(finish,ms);active.signal.addEventListener('abort',finish,{once:true});if(active.signal.aborted)finish();});
const logTime=()=>new Date().toLocaleString('en-IN',{timeZone:'Asia/Kolkata',hour12:false})+' IST';
const safeError=e=>String(e?.message||e).replace(/(?:sk-[\w-]+|Bearer\s+\S+)/g,'[redacted]').slice(0,900);
async function call(payload){const r=await fetch(new URL('/api/runner',origin),{method:'POST',headers:secretHeaders,body:JSON.stringify(payload),redirect:'manual',signal:AbortSignal.timeout(payload.operation==='progress'?5000:60000)});if(!r.ok)throw Object.assign(Error('Dashboard runner endpoint HTTP '+r.status),{status:r.status});return r.json();}
async function runJob(job){
 let stopped=false,heartbeatError=null,reportSession=null;const deadline=AbortSignal.timeout(20*60*1000);const jobAbort=new AbortController();const progress=createProgressReporter(payload=>call({operation:'progress',leaseToken:job.leaseToken,progress:payload}),{onLeaseLost:()=>jobAbort.abort(),log:event=>console.error(logTime()+' '+JSON.stringify(event))});
 // The lease is renewed while Antigravity works. A network outage never authorizes
 // a second run; completion is retried with the same lease and report.
 const heartbeat=setInterval(()=>{if(!stopped)call({operation:'heartbeat',leaseToken:job.leaseToken}).catch(e=>{heartbeatError=safeError(e);if(e.status===409)jobAbort.abort();});},30000);
 try{
 await progress.phase('snapshot');
 if(job.discoverySupported){
 await progress.phase('discovery');
 console.log(logTime()+' Screening NSE and US candidates with Jarvis criteria.');
 let discovery;
 try{const run=promisify(execFile);const child=run(process.env.ARTHAPALANA_PYTHON||fileURLToPath(new URL('.runner-runtime/python/bin/python',root)),[fileURLToPath(new URL('runner/discovery.py',root))],{env:researchEnvironment(),timeout:270000,maxBuffer:5000000,signal:active.signal});
 child.child.stdin.end(JSON.stringify({exclude:job.snapshot.holdings.map(h=>h.ticker)}));const {stdout}=await child;discovery=JSON.parse(stdout);
 }catch{discovery={asOf:new Date().toISOString(),source:'Yahoo Finance via yfinance; Jarvis sector-aware screens',scope:'Live screen unavailable; no candidates invented',screens:[],candidates:[],errors:['Live new-stock discovery unavailable. Keep cash reserved and retry later.']};}
 const accepted=await call({operation:'discovery',leaseToken:job.leaseToken,discovery});job.snapshot=accepted.snapshot;
 console.log(logTime()+` Discovery: ${job.snapshot.discovery.candidates.length} candidates; ${job.snapshot.discovery.errors.length} feed warnings.`);
 }
 if(job.snapshot.discovery)console.log(logTime()+` Portfolio research context includes ${job.snapshot.discovery.candidates.length} candidates from the independent evaluated pool; deep reviews use a separate bounded company worklist.`);
 if(job.snapshot.fundamentalScope?.length){
 await progress.phase('profiles');
 console.log(logTime()+` Fundamental research scope: ${job.snapshot.fundamentalScope.map(s=>s.ticker).join(', ')}; public sources and scoped uploaded reports.`);
 let profiles=[];try{const child=promisify(execFile)(process.env.ARTHAPALANA_PYTHON||'/opt/python/bin/python',[fileURLToPath(new URL('runner/research_profiles.py',root))],{env:researchEnvironment(),timeout:60000,maxBuffer:100000,signal:active.signal});child.child.stdin.end(JSON.stringify({tickers:job.snapshot.fundamentalScope.map(s=>s.ticker)}));profiles=JSON.parse((await child).stdout).profiles;}catch(e){console.error(logTime()+' Public company identity lookup unavailable: '+safeError(e));}
 job.snapshot=(await call({operation:'fundamental_profiles',leaseToken:job.leaseToken,profiles})).snapshot;
 }
 const reports=job.snapshot.annualDocumentManifest||[];let reportAccess;
 if(reports.length||Object.keys(job.snapshot.fundamentalProfiles||{}).length){if(!credentials.documentSecret)throw Error('The private report reader is not configured.');const folder=new URL('report-sessions/',privateDir);await mkdir(folder,{recursive:true,mode:0o700});reportSession=new URL(randomUUID()+'.json',folder);await writeFile(reportSession,JSON.stringify({reports,profiles:job.snapshot.fundamentalProfiles||{},token:credentials.documentSecret}),{mode:0o600});reportAccess={manifest:reports,profiles:job.snapshot.fundamentalProfiles||{},sessionFile:fileURLToPath(reportSession)};const cached=reports.filter(r=>r.summaryStatus==='ready').length;console.log(logTime()+' '+JSON.stringify({event:'report_cache',reports:reports.length,cached,pending:reports.length-cached,fullPdfContext:false}));}
 let preparationReads=0;
 if((job.snapshot.annualDocumentEvidence||[]).some(r=>r.status==='ready'&&r.summaryStatus!=='ready')){
  await progress.phase('documents');
  const docSignal=AbortSignal.any([active.signal,jobAbort.signal,deadline,AbortSignal.timeout(6*60*1000)]);
  job.snapshot=await prepareAnnualDocuments({snapshot:job.snapshot,createThread:()=>newResearchThread({model:job.model,workingDirectory:work,reports:reportAccess,documentOnly:true}),runTurn:runResearchTurn,apply:summaries=>call({operation:'document_summaries',leaseToken:job.leaseToken,summaries}),prompt:documentPreparationPrompt,schema:documentPreparationSchema,signal:docSignal,log:event=>console.log(logTime()+' '+JSON.stringify(event)),activity:event=>{preparationReads=Math.max(preparationReads,event.documentReads||0);progress.activity(event)}});
  // The investment thread must see the validated cache and its smaller read
  // budget, rather than the manifest captured before document preparation.
  if(reportSession){const refreshed=job.snapshot.annualDocumentManifest||[];await writeFile(reportSession,JSON.stringify({reports:refreshed,profiles:job.snapshot.fundamentalProfiles||{},token:credentials.documentSecret}),{mode:0o600});reportAccess={manifest:refreshed,profiles:job.snapshot.fundamentalProfiles||{},sessionFile:fileURLToPath(reportSession)};}
 }
 await progress.phase('research');
 const thread=newResearchThread({model:job.model,workingDirectory:work,reports:reportAccess});
 console.log(logTime()+' Research started; authentication=antigravity; provider=antigravity');
 const signal=AbortSignal.any([active.signal,jobAbort.signal,deadline]);
 const prompt=researchPrompt(job.snapshot);console.log(logTime()+' '+JSON.stringify({event:'research_context',characters:prompt.length,fullPdfContext:false}));
 const turn=await runResearchTurn(thread,prompt,{outputSchema:researchOutputSchema(job.snapshot),signal},{allowReports:!!reportAccess,log:event=>{console.log(logTime()+' '+JSON.stringify(event));progress.activity({...event,...(event.documentReads!==undefined?{documentReads:preparationReads+event.documentReads}:{})})}});
 if(job.snapshot.fundamentalScope?.length&&!turn.webSearches)throw Error('No public-source research was performed; a numerical snapshot cannot approve an investment.');
 const raw=JSON.parse(turn.finalResponse);if(raw.document_summaries?.length){await progress.phase('summaries');const accepted=await call({operation:'document_summaries',leaseToken:job.leaseToken,summaries:raw.document_summaries});job.snapshot=accepted.snapshot;console.log(logTime()+' '+JSON.stringify({event:'report_summaries_validated',checks:accepted.checks}));}await progress.phase('verifying');const sourceReviews=(raw.fundamental_reviews||[]).map(r=>({...r,sources:(r.sources||[]).filter(s=>/^https:/.test(s.url))}));const sourceChecks=await checkResearchSources(sourceReviews,job.snapshot.fundamentalProfiles||{},{allowed:primarySource,log:event=>console.log(logTime()+' '+JSON.stringify(event))});
 const result=validateRecommendations(raw,job.snapshot,sourceChecks);
 await progress.phase('publishing');
 const payload={operation:'complete',leaseToken:job.leaseToken,result,sourceChecks,usage:turn.usage,threadId:thread.id};let lastError;
 for(let attempt=0;attempt<4&&!shutdown;attempt++){try{const saved=await call(payload);console.log(logTime()+` Published ${saved.positions} recommendations; snapshot=${saved.asOf}; API fallback=disabled`);return;}catch(e){lastError=e;await sleep((attempt+1)*5000);}}
 throw lastError||Error('Runner stopped before publishing');
 }catch(e){const error=shutdown?'Runner stopped; no API fallback was used.':e.name==='TimeoutError'||e.name==='AbortError'?'Company research exceeded its time limit; no investment approval was published. Retry the company on demand.':safeError(e);console.error(logTime()+' '+error);try{await call({operation:'fail',leaseToken:job.leaseToken,error});}catch{}if(once)process.exitCode=1;}
 finally{await progress.close();stopped=true;clearInterval(heartbeat);if(reportSession)await unlink(reportSession).catch(()=>{});if(heartbeatError)console.error('Heartbeat check: '+heartbeatError);}
}
if(check){console.log('Authentication: '+verifyAuthentication()+'; API keys stripped; API fallback disabled.');process.exit(0);}
do{
 let auth='unavailable',error='';try{auth=verifyAuthentication();}catch(e){error=safeError(e);}
 try{const reply=await call({operation:'poll',auth,machine:hostname(),error});if(reply.job)await runJob(reply.job);else if(once)console.log('No pending job; '+(reply.reason||'runner is ready.'));}
 catch(e){console.error(logTime()+' '+safeError(e));if(once)process.exitCode=1;}
 if(!once&&!shutdown)await sleep(30000);
}while(!once&&!shutdown);
