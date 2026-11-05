import {AsyncLocalStorage} from 'node:async_hooks';
type Pending={version:number;promise:Promise<any>};
const requests=new AsyncLocalStorage<Map<object,Map<string,Pending>>>();
export function withRequestCache<T>(run:()=>T):T{return requests.run(new Map(),run);}
/** Only completed, plain values cross requests. I/O promises belong to their originating request. */
export class ValueCache<T=any>{
 private values=new Map<string,{until:number;started:number;value:T}>();
 private version=0;
 private sequence=0;
 constructor(private capacity=512){}
 delete(key:string){this.values.delete(key);this.version++;}
 clear(){this.values.clear();this.version++;}
 get(key:string,ttl:number,load:()=>Promise<T>):Promise<T>{
  const now=Date.now(),hit=this.values.get(key);
  if(hit&&hit.until>now)return Promise.resolve(hit.value);
  if(hit)this.values.delete(key);
  const request=requests.getStore();let pending=request?.get(this);
  if(request&&!pending){pending=new Map();request.set(this,pending);}
  const current=pending?.get(key);if(current?.version===this.version)return current.promise;
  const version=this.version,started=++this.sequence;
  const promise:Promise<T>=Promise.resolve().then(load).then(value=>{
   if(version===this.version&&now+ttl>Date.now()&&(!this.values.has(key)||this.values.get(key)!.started<=started)){
    this.values.delete(key);this.values.set(key,{until:now+ttl,started,value});
    for(const [k,v] of this.values)if(v.until<=Date.now())this.values.delete(k);
    while(this.values.size>this.capacity)this.values.delete(this.values.keys().next().value!);
   }
   return value;
  }).finally(()=>{if(pending?.get(key)?.promise===promise)pending.delete(key);});
  pending?.set(key,{version,promise});return promise;
 }
}
