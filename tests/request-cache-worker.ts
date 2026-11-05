import {ValueCache,withRequestCache} from '../lib/request-cache';
const cache=new ValueCache<string>();
export default {fetch(request:Request){return withRequestCache(async()=>{
 const path=new URL(request.url).pathname;
 const value=await cache.get('shared',60000,path==='/abandon'?()=>new Promise<string>(()=>{}):async()=> 'recovered');
 return Response.json({value});
});}};
