import {build} from '../node_modules/esbuild/lib/main.js';
import {mkdir} from 'node:fs/promises';
await mkdir(new URL('../.runner-private/work/',import.meta.url),{recursive:true,mode:0o700});
await build({entryPoints:[new URL('../lib/runner-contract.ts',import.meta.url).pathname],bundle:true,platform:'node',format:'esm',outfile:new URL('../.runner-private/research-contract.mjs',import.meta.url).pathname});
