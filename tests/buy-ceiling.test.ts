import assert from 'node:assert/strict';
import {buyCeiling} from '../lib/buy-ceiling';
assert.equal(buyCeiling(4400,{value:4293.31}).ceiling,4293.31);
assert.equal(buyCeiling(4000,{value:4293.31}).ceiling,4000);
assert.equal(buyCeiling(4400,{value:3000,binding:false}).ceiling,4400);
for(const value of [null,undefined,0,-1,NaN,Infinity])assert.equal(buyCeiling(value,{value:4293.31}).ceiling,null,'Code estimate alone is not a verified entry');
assert.equal(buyCeiling(4400,null).ceiling,4400);
for(let i=1;i<5000;i++){const r=i*.93,c=i*1.13;const x=buyCeiling(r,{value:c});assert(x.ceiling!<=r&&x.ceiling!<=c);}
