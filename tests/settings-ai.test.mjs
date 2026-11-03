import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {settingsHandler,analysisHandler} from '/tmp/arthapalana-ai.mjs';
const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync('drizzle/0000_graceful_blindfold.sql','utf8'));
const DB = {
  prepare(sql) {
    return {
      bind(...args) {
        return {
          async first() { return sqlite.prepare(sql).get(...args) || null; },
          async run() { const r=sqlite.prepare(sql).run(...args); return {meta:{changes:r.changes}}; }
        };
      }
    };
  }
};
const env={DB,SETTINGS_ENCRYPTION_KEY:'a'.repeat(64),NOCODB_TOKEN:'test-noco',CF_ACCESS_CLIENT_ID:'test-id',CF_ACCESS_CLIENT_SECRET:'test-secret'};
let analyses=0;globalThis.fetch=async(url,options)=>{
 if(String(url).includes('api.openai.com')){assert.equal(options.headers.Authorization,'Bearer sk-test-key');if(String(url).includes('models/'))return Response.json({id:'test-model'});if(options.method==='POST'){analyses++;const body=JSON.parse(options.body);assert.equal(body.model,'test-model');assert.equal(body.store,false);assert.equal(body.background,true);assert.match(body.instructions,/ORCL is non-discretionary/);assert.match(body.instructions,/Do not fabricate/);return Response.json({id:'resp_test',status:'in_progress'});}return Response.json({id:'resp_test',status:'completed',output:[{type:'message',content:[{type:'output_text',text:'## Test report\nHold until evidence improves.'}]}]});}
 if(String(url).includes('noco.'))return Response.json({list:[{Id:1,Ticker:'AAA.NS',Portfolio:'Test',Date:'2026-01-01',TransactionType:'Buy',NoOfShares:10,CostPerShare:100}],pageInfo:{isLastPage:true}});
 if(String(url).includes('fundamentals-timeseries'))return Response.json({timeseries:{result:[]}});
 return Response.json({chart:{result:[{meta:{regularMarketPrice:100,regularMarketTime:Date.now()/1000,currency:'INR'},timestamp:[Date.now()/1000],indicators:{quote:[{close:[100]}]}}]}});
};
const req=(path,body,origin='https://test.site')=>new Request('https://test.site'+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)});
let r=await settingsHandler(req('/api/settings',{model:'test-model',apiKey:'sk-test-key',enabled:true,intervalMinutes:60}),env);assert.equal(r.status,200);
const stored=sqlite.prepare('SELECT * FROM settings').get();assert.ok(stored.encrypted_key);assert.ok(!stored.encrypted_key.includes('sk-test-key'));
r=await settingsHandler(new Request('https://test.site/api/settings'),env);const settings=await r.json();assert.equal(settings.hasKey,true);assert.equal(JSON.stringify(settings).includes('sk-test-key'),false);assert.equal(settings.model,'test-model');
r=await settingsHandler(req('/api/settings',{action:'test',model:'test-model'}),env);assert.equal(r.status,200);
r=await settingsHandler(req('/api/settings',{model:'evil'},'https://evil.site'),env);assert.equal(r.status,403);
r=await analysisHandler(req('/api/analysis',{}),env);assert.equal((await r.json()).report.status,'in_progress');assert.equal(analyses,1);
r=await analysisHandler(new Request('https://test.site/api/analysis'),env);const result=await r.json();assert.equal(result.report.status,'completed');assert.match(result.report.body,/Test report/);assert.equal(result.report.response_id,undefined);
r=await analysisHandler(req('/api/analysis',{}),env);assert.equal(analyses,1);
r=await settingsHandler(req('/api/settings',{action:'delete'}),env);assert.equal(r.status,200);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM settings').get().n,0);
console.log('PASS: encrypted API key storage, masked settings, origin checks, connection test, background Responses API, report polling, duplicate-call lock and key removal.');
