import assert from 'node:assert/strict';
import {build} from '../node_modules/esbuild/lib/main.js';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
const dir=await mkdtemp(join(tmpdir(),'arthapalana-ceiling-ui-'));
try{const file=join(dir,'render.cjs');await build({entryPoints:['tests/ceiling-ui-entry.tsx'],bundle:true,platform:'node',format:'cjs',outfile:file});// Enforced minimum: the rolled code model's five-year value (6,227.60) / 1.15^5 = 3,096.21, below the code value 4,293.31 and research 4,400.
const views=createRequire(import.meta.url)(file).renderCases();
for(const [name,html] of Object.entries(views)){assert(html.includes('3,096.21')||html.includes('3,096'),name+' must display the enforced ceiling');}
assert(views.watch.includes('ceiling'));assert.match(views.watch,/Enforced buy ceiling[\s\S]*?3,096.21/);assert(views.research.includes('Enforced buy ceiling'));assert(views.research.includes('4,400'),'Research estimate remains separately identified');assert(views.band.includes('Enforced buy ceiling'));
console.log('PASS: watch planning, investment details and valuation band render the enforced minimum, with research estimates separately labelled.');
}finally{await rm(dir,{recursive:true,force:true})}
