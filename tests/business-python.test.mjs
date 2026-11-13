import assert from 'node:assert/strict';
import {build} from '../node_modules/esbuild/lib/main.js';
import {mkdtemp,rm} from 'node:fs/promises';import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {createRequire} from 'node:module';
const dir=await mkdtemp(join(tmpdir(),'arthapalana-business-python-'));
try{const file=join(dir,'model.cjs');await build({entryPoints:['lib/business-model.ts'],bundle:true,platform:'node',format:'cjs',outfile:file});const {businessModel}=createRequire(import.meta.url)(file);
 const catalog=JSON.parse(readFileSync('lib/business-models.json','utf8'));
 const cases=[...Object.keys(catalog.overrides).map(ticker=>({ticker,sector:'Financials',industry:'Asset Management'})),...['Banks - Regional','Banks - Diversified','Mortgage Finance','Credit Services','Insurance - Life','Insurance Brokers','Asset Management','Capital Markets','Financial Data & Stock Exchanges','Financial Conglomerates','Shell Companies','Unknown'].flatMap(industry=>['Financials','Technology','Financial Services'].map(sector=>({ticker:'SYNTH',sector,industry})))];
 const py=execFileSync('.runner-runtime/python/bin/python',['-c',"import json,sys;sys.path.insert(0,'runner');from business_model import business_kind;print(json.dumps([business_kind(x['ticker'],x['industry'],x['sector']) for x in json.load(sys.stdin)]))"],{input:JSON.stringify(cases),encoding:'utf8'});
 assert.deepEqual(JSON.parse(py),cases.map(c=>businessModel(c).kind));
 console.log('PASS: Python discovery and server classification agree for every ticker override, provider industry and sector fallback.');
}finally{await rm(dir,{recursive:true,force:true})}
