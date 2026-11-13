import assert from 'node:assert/strict';import {build} from '../node_modules/esbuild/lib/main.js';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createRequire} from 'node:module';
const dir=await mkdtemp(join(tmpdir(),'arthapalana-holding-label-'));
try{const file=join(dir,'render.cjs');await build({entryPoints:['tests/holding-label-entry.tsx'],bundle:true,platform:'node',format:'cjs',outfile:file});const v=createRequire(import.meta.url)(file).renderCases();
 for(const label of ['Company research pending','Evidence incomplete','Valuation incomplete','Waiting for entry price'])assert(v.grid.includes(label),'Holding grid must render '+label);
 assert(!v.grid.includes('Screened — review needed'));assert(v.drawer.includes('Next purchase step'));assert(v.drawer.includes('Waiting for entry price'));assert(!v.drawer.includes('Company research pending'));
 console.log('PASS: actual holding grid and live drawer render distinct pending steps and a completed price-only wait.');
}finally{await rm(dir,{recursive:true,force:true})}
