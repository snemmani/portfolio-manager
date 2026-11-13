import assert from 'node:assert/strict';
import {build} from '../node_modules/esbuild/lib/main.js';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
const dir=await mkdtemp(join(tmpdir(),'arthapalana-profit-ui-'));
try{
 const file=join(dir,'render.cjs');await build({entryPoints:['tests/profit-ui-entry.tsx'],bundle:true,platform:'node',format:'cjs',outfile:file});
 const {decisions,sale}=createRequire(import.meta.url)(file).renderCases();
 assert.match(decisions,/TANLA/);assert.match(decisions,/Profit review/);assert.match(decisions,/26.0%/);assert.match(decisions,/17 Nov 2026/);assert.match(decisions,/re-entry watch/);
 assert.match(sale,/Sale checks and blockers/);assert.match(sale,/17 Nov 2026/);assert.match(sale,/re-entry watch/);
 const blockers=sale.slice(sale.indexOf('Sale checks and blockers'),sale.indexOf('<details'));
 assert.match(blockers,/waiting period/,'Cooldown is visible without opening evidence');assert.match(blockers,/re-entry watch/);
 assert(!sale.includes('approve this partial-sale assessment'),'Blocked review must not show approval control');
 console.log('PASS: actual Decisions cards show threshold, dated cooldown and re-entry restrictions; sale blockers are expanded and no approval is offered while blocked.');
}finally{await rm(dir,{recursive:true,force:true})}
