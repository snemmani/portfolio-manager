// Trust one explicitly configured public URL, never arbitrary proxy headers.
export function localRequest(request:Request,env:{LOCAL_DOCKER?:string;PUBLIC_ORIGIN?:string}):Request|null{
 if(env.LOCAL_DOCKER!=='1')return request;
 const url=new URL(request.url);let origin=url.origin;
 let publicUrl:URL|null=null;
 if(env.PUBLIC_ORIGIN){try{publicUrl=new URL(env.PUBLIC_ORIGIN);if(publicUrl.protocol!=='https:'||publicUrl.username||publicUrl.password||publicUrl.pathname!=='/'||publicUrl.search||publicUrl.hash||publicUrl.port)return null;}catch{return null;}}
 if(publicUrl&&url.hostname===publicUrl.hostname&&!url.port)origin=publicUrl.origin;
 else if(!['127.0.0.1','localhost','web'].includes(url.hostname))return null;
 const supplied=request.headers.get('Origin');if(supplied!==null&&supplied!==origin)return null;
 // cloudflared terminates TLS; the internal HTTP URL must become the configured
 // external HTTPS URL before API handlers perform their same-origin checks.
 return origin===url.origin?request:new Request(origin+url.pathname+url.search,request);
}
