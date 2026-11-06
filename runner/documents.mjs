import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {createHash,timingSafeEqual} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {ReportLibrary,REPORT_ID} from './report-library.mjs';
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
async function body(req){const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>1024*1024)throw Object.assign(Error('Request too large.'),{status:413});chunks.push(c);}return JSON.parse(Buffer.concat(chunks).toString());}
export async function startDocuments({root,token,host='0.0.0.0',port=8790,libraryOptions={}}){
 if(!token||token.length<24)throw Error('A private document-service token is required.');const library=await new ReportLibrary(root,libraryOptions).init(),expected=createHash('sha256').update('Bearer '+token).digest();let uploads=0;
 const server=createServer(async(req,res)=>{try{
  const actual=createHash('sha256').update(req.headers.authorization||'').digest();if(!timingSafeEqual(expected,actual))return json(res,401,{error:'Unauthorized document request.'});
  const u=new URL(req.url,'http://documents'),parts=u.pathname.split('/').filter(Boolean),id=parts[2];
  if(req.method==='GET'&&u.pathname==='/health')return json(res,200,{ok:true});
  if(u.pathname==='/v1/reports'&&req.method==='GET')return json(res,200,library.index());
  if(u.pathname==='/v1/reports'&&req.method==='PUT'){
   if(req.headers['content-type']?.split(';')[0]!=='application/pdf')return json(res,415,{error:'Choose a PDF annual report.'});
   if(Number(req.headers['content-length'])>library.maxBytes)return json(res,413,{error:'The PDF exceeds the 200 MB upload limit.'});if(uploads>=2)return json(res,429,{error:'Two reports are uploading. Please retry shortly.'});uploads++;
   try{const report=await library.ingest(req,Object.fromEntries(u.searchParams));return json(res,report.duplicate?200:202,{ok:true,report});}finally{uploads--;}
  }
  if(u.pathname==='/v1/reports/chunk'&&req.method==='PUT'){
   if(uploads>=4)return json(res,429,{error:'Upload capacity reached. Please retry shortly.'});uploads++;
   try{const result=await library.ingestChunk(req,Object.fromEntries(u.searchParams));return json(res,result.report?.duplicate?200:result.report?202:200,{ok:true,...result});}finally{uploads--;}
  }
  if(u.pathname==='/v1/evidence'&&req.method==='POST'){const b=await body(req);if(!Array.isArray(b.ids)||b.ids.length>16||!b.ids.every(id=>REPORT_ID.test(id)))return json(res,400,{error:'Invalid report selection.'});return json(res,200,{reports:await library.evidence(b.ids)});}
  if(u.pathname==='/v1/summaries'&&req.method==='POST'){const b=await body(req);if(!Array.isArray(b.summaries)||b.summaries.length>12)return json(res,400,{error:'Invalid summary batch.'});const results=[];for(const summary of b.summaries)results.push(await library.saveSummary(summary,b.companies?.[summary.ticker]||''));return json(res,200,{checks:results});}
  if(parts[0]==='v1'&&parts[1]==='reports'&&REPORT_ID.test(id||'')){
   if(req.method==='GET'&&parts[3]==='download'){const meta=library.reports.get(id);if(!meta||meta.status==='archived')return json(res,404,{error:'Report not found.'});res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${meta.fileName}"`,'Content-Length':meta.size,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"});await pipeline(createReadStream(library.path(id,'original.pdf')),res);return;}
   if(req.method==='DELETE'&&!parts[3])return json(res,200,await library.archive(id));
   if(req.method==='GET'&&parts[3]==='summary')return json(res,200,{report:(await library.evidence([id]))[0]});
   if(req.method==='POST'&&parts[3]==='pages')return json(res,200,await library.readPages(id,await body(req)));
   if(req.method==='POST'&&parts[3]==='search')return json(res,200,await library.search(id,await body(req)));
  }
  return json(res,404,{error:'Document route not found.'});
 }catch(e){if(!res.headersSent)json(res,e.status||400,{error:e.status?e.message:'The document request could not be completed.'});else res.destroy();}});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve)});return {server,library,port:server.address().port};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const token=(await readFile('/run/secrets/documents_token','utf8')).trim();const service=await startDocuments({root:process.env.ARTHAPALANA_DOCUMENT_ROOT||'/documents',token});console.log(JSON.stringify({component:'documents',event:'ready',port:service.port}));for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>service.server.close(()=>process.exit(0)));}
