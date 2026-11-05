import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EventEmitter} from 'node:events';
import {reportPdf} from './report-fixture.mjs';
import {createPublicDocumentReader,downloadPublicDocument} from '../runner/public-documents.mjs';
const allowed=(raw,p)=>{try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&u.hostname===new URL(p.website).hostname}catch{return false}},profile={website:'https://issuer.example'},resolve=async()=>[{address:'1.1.1.1',family:4}];
let networks=0;
await assert.rejects(()=>downloadPublicDocument('https://evil.example',profile,{allowed,resolve,transport:()=>networks++}),/issuer/);
await assert.rejects(()=>downloadPublicDocument('https://issuer.example',profile,{allowed,resolve:async()=>[{address:'127.0.0.1',family:4}],transport:()=>networks++}),/Private/);assert.equal(networks,0);
const transport=(status,headers,bytes)=> (_url,options,callback)=>{const req=new EventEmitter();req.destroy=()=>{};req.end=()=>queueMicrotask(()=>{options.lookup('issuer.example',{},(_err,address)=>assert.equal(address,'1.1.1.1'));const res=new EventEmitter();res.statusCode=status;res.headers=headers;res.destroy=()=>{};callback(res);res.emit('data',bytes);res.emit('end')});return req};
await assert.rejects(()=>downloadPublicDocument('https://issuer.example/report',profile,{allowed,resolve,transport:transport(302,{location:'https://evil.example/report'},Buffer.alloc(0))}),/issuer/);
await assert.rejects(()=>downloadPublicDocument('https://issuer.example/report',profile,{allowed,resolve,maxBytes:20,transport:transport(200,{'content-type':'application/pdf'},Buffer.alloc(21))}),/limit/);
const downloaded=await downloadPublicDocument('https://issuer.example/report',profile,{allowed,resolve,transport:transport(200,{'content-type':'application/pdf'},Buffer.from('public PDF'))});assert.equal(downloaded.bytes.toString(),'public PDF');
const root=await mkdtemp(join(tmpdir(),'arthapalana-public-documents-'));let downloads=0;
const options={profiles:{'TEST.NS':profile},cacheRoot:root,allowed,download:async url=>{downloads++;return {url,bytes:reportPdf(),contentType:'application/pdf'}}};
try{
 const reader=createPublicDocumentReader(options),args={ticker:'TEST.NS',url:'https://issuer.example/annual.pdf'};
 const inspected=await reader({...args,operation:'inspect'});assert.equal(inspected.pageCount,2);assert(inspected.sha256);assert(!JSON.stringify(inspected).includes('Period 2026-03-31 Revenue'));
 const search=await reader({...args,operation:'search',query:'Revenue'});assert.equal(search.matches[0].page,2);
 const pages=await reader({...args,operation:'pages',page:2});assert(pages.pages[0].text.includes('Revenue 100'));assert.match((await reader({...args,operation:'pages',page:2})).notice,/already/);
 await createPublicDocumentReader(options)({...args,operation:'inspect'});assert.equal(downloads,1,'Restart reuses extracted public text without a new download');
 await assert.rejects(()=>reader({...args,ticker:'OTHER',operation:'inspect'}),/scope/);await assert.rejects(()=>reader({...args,url:'https://127.0.0.1',operation:'inspect'}),/scope/);
 for(let i=0;i<3;i++)await reader({...args,url:'https://issuer.example/source'+i,operation:'inspect'});await assert.rejects(()=>reader({...args,url:'https://issuer.example/source4',operation:'inspect'}),/four/);
 const many=createPublicDocumentReader({...options,cacheRoot:join(root,'many'),extract:async()=>Array.from({length:40},(_,i)=>'Statement '+i).join('\f')});for(let page=1;page<=28;page+=4)await many({...args,operation:'pages',page,count:4});await assert.rejects(()=>many({...args,operation:'pages',page:29}),/28-page/);
 const html=createPublicDocumentReader({...options,cacheRoot:join(root,'html'),download:async url=>({url,bytes:Buffer.from('<p>Issuer facts &amp; figures</p><script>untrusted_script()</script>')})});const h=await html({...args,operation:'inspect'});assert(h.preview.includes('facts & figures'));assert(!h.preview.includes('untrusted_script'));
 console.log('PASS: real PDF extraction, bounded issuer-only downloads, pinned DNS, private/redirect/oversize rejection, targeted pages/search, persistent cache reuse, scoped companies and shared reading budgets. No external requests.');
}finally{await rm(root,{recursive:true,force:true})}
