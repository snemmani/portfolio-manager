import assert from 'node:assert/strict';import {mkdtemp,rm,readFile} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {Miniflare,Log,LogLevel,Response as MFResponse} from 'miniflare';
import {startDocuments} from '../runner/documents.mjs';import {reportPdf} from './report-fixture.mjs';
const root=await mkdtemp(join(tmpdir(),'arthapalana-report-worker-')),token='synthetic-workerd-document-token';let service,mf;
try{service=await startDocuments({root,token,port:0,host:'127.0.0.1'});const base='http://127.0.0.1:'+service.port;
mf=new Miniflare({modules:true,script:await readFile('/tmp/arthapalana-reports-worker.mjs','utf8'),bindings:{DOCUMENT_SHARED_SECRET:token},compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],log:new Log(LogLevel.NONE),outboundService:async(request)=>{assert.equal(new URL(request.url).hostname,'documents');const r=await fetch(request.url.replace('http://documents:8790',base),{method:request.method,headers:request.headers,body:['GET','HEAD'].includes(request.method)?undefined:request.body,duplex:'half'});return new MFResponse(r.body,{status:r.status,headers:r.headers});}});await mf.ready;
const pdf=reportPdf(),response=await mf.dispatchFetch('http://test.site/api/annual-reports?ticker=EXAMPLE.NS&period=2026-03-31&fileName=annual.pdf',{method:'POST',headers:{Origin:'http://test.site','Content-Type':'application/pdf'},body:pdf});assert.equal(response.status,202);const id=(await response.json()).report.id;
const download=await mf.dispatchFetch('http://test.site/api/annual-reports/'+id+'/download');assert.equal(download.status,200);assert.deepEqual(Buffer.from(await download.arrayBuffer()),pdf);
assert.equal((await mf.dispatchFetch('http://test.site/api/annual-reports',{method:'POST',headers:{Origin:'http://evil.test','Content-Type':'application/pdf'},body:pdf})).status,403);
console.log('PASS: actual workerd upload streaming, PDF response streaming and origin checks with an isolated document service. No external requests or live documents.');
}finally{if(mf)await mf.dispose();if(service)await new Promise(r=>service.server.close(r));await rm(root,{recursive:true,force:true});}
