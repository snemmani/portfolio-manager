import {AsyncLocalStorage} from 'node:async_hooks';
const deadlines=new AsyncLocalStorage<number>();
export function withDataBudget<T>(ms:number,run:()=>T):T{return deadlines.run(Math.min(deadlines.getStore()??Infinity,Date.now()+ms),run);}
export function dataTimeout(max=20000){const left=Math.min(max,(deadlines.getStore()??Infinity)-Date.now());if(left<=0)throw Error('Data collection time budget exhausted');return Math.max(1,Math.floor(left));}
