import {readFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {pathToFileURL} from 'node:url';
import {createPublicDocumentReader} from './public-documents.mjs';
export const REPORT_TOOLS=['list_reports','search_reports','read_report_pages','read_cached_summary','read_public_document'];
export function reportReaderTools(publicEnabled=false){const property={reportId:{type:'string'}};return [
 {name:'list_reports',description:'List the uploaded annual reports and cached-summary status in this company research scope.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
 {name:'search_reports',description:'Find a phrase in one uploaded PDF. Returns page numbers and short snippets, never the full report.',inputSchema:{type:'object',properties:{...property,query:{type:'string'},cursor:{type:'integer',minimum:0}},required:['reportId','query'],additionalProperties:false}},
 {name:'read_report_pages',description:'Read 1–4 specific PDF pages. Cached reports require a specific purpose and have a small page budget. Reuse earlier page responses; never read the whole report by default.',inputSchema:{type:'object',properties:{...property,page:{type:'integer',minimum:1},count:{type:'integer',minimum:1,maximum:4},offset:{type:'integer',minimum:0},purpose:{type:'string'}},required:['reportId','page'],additionalProperties:false}},
 {name:'read_cached_summary',description:'Retrieve a validated cached report summary when the compact research context omits a detail. Prefer this over rereading the PDF.',inputSchema:{type:'object',properties:property,required:['reportId'],additionalProperties:false}},
 {name:'read_public_document',description:'Read a primary issuer/regulatory PDF or webpage when web search cannot read a large annual report. Inspect for page hints, search a phrase, then read 1–4 targeted pages. Downloads and extraction are cached; full reports never enter context. Only the scoped company issuer and regulatory HTTPS domains are allowed.',inputSchema:{type:'object',properties:{ticker:{type:'string'},url:{type:'string'},operation:{type:'string',enum:['inspect','search','pages']},query:{type:'string'},page:{type:'integer',minimum:1},count:{type:'integer',minimum:1,maximum:4},offset:{type:'integer',minimum:0}},required:['ticker','url','operation'],additionalProperties:false}}
 ].filter(tool=>publicEnabled||tool.name!=='read_public_document').map(tool=>({...tool,annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}}));}
export function createReportReader({reports,token,endpoint='http://documents:8790',fetcher=fetch,publicReader}){
 const scope=new Map(reports.map(r=>[r.id,r])),delivered=new Map(),summaryDelivered=new Set(),pagesRead=new Map(),searches=new Set();let usedCharacters=0,searchCount=0;
 const characterBudget=reports.some(r=>r.summaryStatus!=='ready')?300000:50000;
 async function api(path,body){const r=await fetcher(endpoint+path,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('The selected report is unavailable or still processing.');return r.json();}
 let serial=Promise.resolve();async function call(name,args={}){
  if(!REPORT_TOOLS.includes(name))throw Error('This report tool is not allowed.');
  if(name==='read_public_document'){if(!publicReader)throw Error('Public-document research is not enabled in this stage.');return publicReader(args)}
  if(name==='list_reports')return {reports:[...scope.values()].map(({summary,...r})=>r),notice:'Reuse cached summaries. Search/read only the specific pages needed for unresolved evidence.'};
  const report=scope.get(args.reportId);if(!report)throw Error('This report is outside the current company research scope.');
  if(name==='read_cached_summary'){if(summaryDelivered.has(report.id))return {reportId:report.id,notice:'This cached summary was already returned. Reuse it from the conversation.'};const data=await api('/v1/evidence',{ids:[report.id]}),r=data.reports[0];if(r.sha256!==report.sha256)throw Error('The report changed.');const result={reportId:r.id,sha256:r.sha256,summary:r.summary,notice:r.summary?'Cached summary; no new summarisation required.':'This PDF has no validated cached summary yet.'},characters=JSON.stringify(result).length;if(usedCharacters+characters>characterBudget)throw Error('The cached-evidence text budget is exhausted. Use the compact context and retrieve only a specific unresolved page.');usedCharacters+=characters;if(r.summary)summaryDelivered.add(report.id);return result;}
  const {reportId,purpose,...parameters}=args;
  if(name==='read_report_pages'){
   if(report.summaryStatus==='ready'&&(!purpose||purpose.length<12))throw Error('Reuse the cached summary first. State the specific unresolved check that needs these PDF pages.');
   const seen=pagesRead.get(reportId)||new Set(),requested=Array.from({length:Math.min(4,parameters.count||1)},(_,i)=>parameters.page+i),newPages=requested.filter(page=>!seen.has(page));
   if(seen.size+newPages.length>(report.summaryStatus==='ready'?8:120))throw Error('This report has reached its targeted page budget. Reuse the extracted evidence and keep unresolved facts unverified.');
   const key=JSON.stringify([reportId,parameters.page,parameters.count||1,parameters.offset||0]);if(delivered.has(key))return {reportId,notice:'These pages were already provided. Reuse the earlier page evidence instead of rereading it.'};
   if(usedCharacters>=characterBudget)throw Error('The report-text budget for this review is exhausted. Reuse summaries and cited facts; do not guess unresolved checks.');
   const data=await api('/v1/reports/'+reportId+'/pages',parameters),characters=JSON.stringify(data).length;
   if(usedCharacters+characters>characterBudget)throw Error('This page response would exceed the review text budget. Request fewer pages or reuse cached evidence.');
   usedCharacters+=characters;for(const page of newPages)seen.add(page);pagesRead.set(reportId,seen);delivered.set(key,true);return {...data,remainingReportTextCharacters:characterBudget-usedCharacters};
  }
  const searchKey=JSON.stringify([reportId,parameters.query,parameters.cursor||0]);if(searches.has(searchKey))return {reportId,notice:'This search was already returned. Reuse its page references.'};
  if(searchCount>=40||usedCharacters>=characterBudget)throw Error('The targeted search budget is exhausted. Reuse earlier results and keep unresolved facts unverified.');
  const data=await api('/v1/reports/'+reportId+'/search',parameters),characters=JSON.stringify(data).length;if(usedCharacters+characters>characterBudget)throw Error('This search would exceed the review text budget. Reuse earlier evidence.');usedCharacters+=characters;searchCount++;searches.add(searchKey);return data;
 }
 return (name,args)=>{const result=serial.catch(()=>{}).then(()=>call(name,args));serial=result;return result;};
}
export function startReportReader({input=process.stdin,output=process.stdout,...options}){
 const call=createReportReader(options),lines=createInterface({input,crlfDelay:Infinity});
 lines.on('line',async line=>{let request;try{request=JSON.parse(line);if(!('id'in request))return;let result;
  if(request.method==='initialize')result={protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'annual_reports',version:'1.0.0'}};
  else if(request.method==='ping')result={};
  else if(request.method==='tools/list')result={tools:reportReaderTools(!!options.publicReader)};
  else if(request.method==='tools/call'){try{const data=await call(request.params?.name,request.params?.arguments);result={content:[{type:'text',text:JSON.stringify(data)}]};}catch(e){result={isError:true,content:[{type:'text',text:e.message}]};}}
  else throw Error('Method not found');output.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result})+'\n');
 }catch{if(request?.id!==undefined)output.write(JSON.stringify({jsonrpc:'2.0',id:request.id,error:{code:-32601,message:'Report request could not be handled.'}})+'\n');}});return lines;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){if(!process.env.ARTHAPALANA_REPORT_SESSION_FILE)throw Error('A private report-reader session is required.');const {reports,token,profiles={}}=JSON.parse(await readFile(process.env.ARTHAPALANA_REPORT_SESSION_FILE,'utf8'));if(!token||!Array.isArray(reports)||reports.length>16||Object.keys(profiles).length>4)throw Error('Invalid private report-reader configuration.');const {primarySource}=await import('../.runner-private/research-contract.mjs');startReportReader({reports,token,publicReader:createPublicDocumentReader({profiles,cacheRoot:process.env.ARTHAPALANA_PUBLIC_CACHE||'/sources',allowed:primarySource})});}
