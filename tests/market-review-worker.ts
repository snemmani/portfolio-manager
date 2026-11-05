import {marketHandler} from '../lib/market-handler';
import {withRequestCache} from '../lib/request-cache';
export default {fetch(r:Request,env:any){return withRequestCache(()=>new URL(r.url).pathname==='/health'?Promise.resolve(Response.json({ok:true})):marketHandler(r,env));}};
