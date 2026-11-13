import assert from 'node:assert/strict';
import {holdingReturnPct} from '../lib/portfolio-values';
for(const unrealised of [null,NaN,Infinity])assert.equal(holdingReturnPct({invested:100,unrealised}),null);
for(const invested of [null,0,NaN,Infinity])assert.equal(holdingReturnPct({invested,unrealised:20}),null);
assert.equal(holdingReturnPct({invested:100,unrealised:0}),0);
assert.equal(holdingReturnPct({invested:100,unrealised:-20}),-20);
