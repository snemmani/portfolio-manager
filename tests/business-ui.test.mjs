import assert from 'node:assert/strict';
import {build} from '../node_modules/esbuild/lib/main.js';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {createRequire} from 'node:module';
const dir=await mkdtemp(join(tmpdir(),'arthapalana-business-ui-'));
try{const file=join(dir,'render.cjs');await build({entryPoints:['tests/business-ui-entry.tsx'],bundle:true,platform:'node',format:'cjs',outfile:file});const v=createRequire(import.meta.url)(file).renderCases();
 for(const key of ['missing','incomplete','specialist','offline','changed','newer']){assert(v[key].includes('No approved buy ceiling.'),key);assert(!v[key].includes('bg-gain/25'),'Unavailable/unverified ceiling must not paint a green buying range');}
 assert(v.missing.includes('Exchange operator'));assert(v.missing.includes('Operating earnings-power model'));assert(v.missing.includes('992.38'));assert(!v.missing.includes('467.43'));
 assert(v.specialist.includes('Code value unavailable'));assert(v.specialist.includes('Sector-specific researched valuation required'));
 assert(v.ready.includes('Enforced buy ceiling'));assert(v.ready.includes('bg-gain/25'));assert(v.badge.includes('Checking next step…'));assert(!v.badge.includes('Add candidate'));
 console.log('PASS: actual valuation charts distinguish missing/incomplete/approved ceilings, suppress unavailable green areas, name corrected/specialist models and label screened candidates honestly.');
}finally{await rm(dir,{recursive:true,force:true})}
