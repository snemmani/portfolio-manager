export const DOCUMENT_POLICY='annual-reports-v1';
export async function documentRequest(env:any,path:string,init:RequestInit={}){
 if(!env.DOCUMENT_SHARED_SECRET)throw Error('The local report library is not configured.');
 return fetch('http://documents:8790'+path,{...init,headers:{...init.headers,Authorization:'Bearer '+env.DOCUMENT_SHARED_SECRET},signal:init.signal||AbortSignal.timeout(15000)});
}
export async function annualDocumentIndex(env:any){
 if(!env.DOCUMENT_SHARED_SECRET)return {enabled:false,available:true,reports:[],revision:null};
 try{const r=await documentRequest(env,'/v1/reports');if(!r.ok)throw Error();return {enabled:true,...await r.json() as any};}catch{return {enabled:true,available:false,reports:[],revision:null};}
}
export function currentAnnualDocuments(reports:any[],ticker?:string){const seen=new Set();return reports.filter(r=>!ticker||r.ticker===ticker).sort((a,b)=>b.period.localeCompare(a.period)||(b.sequence||0)-(a.sequence||0)||b.addedAt.localeCompare(a.addedAt)).filter(r=>{const key=r.ticker+'|'+r.period;if(seen.has(key))return false;seen.add(key);return true}).slice(0,ticker?6:1000);}
export async function documentEvidence(env:any,ids:string[]){if(!ids.length)return [];const r=await documentRequest(env,'/v1/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});if(!r.ok)throw Error('Uploaded report evidence is unavailable.');return ((await r.json()) as any).reports;}
export async function annualReportsHandler(request:Request,env:any){
 const url=new URL(request.url),path=url.pathname.replace('/api/annual-reports','');
 if(request.method==='GET'&&!path){const index=await annualDocumentIndex(env);return Response.json(index,{status:index.available?200:503,headers:{'Cache-Control':'no-store'}});}
 if(request.method==='POST'&&!path){
  if(request.headers.get('Origin')!==url.origin)return Response.json({error:'Invalid request origin.'},{status:403});
  if(Number(request.headers.get('Content-Length'))>50*1024*1024)return Response.json({error:'Choose a PDF up to 50 MB.'},{status:413});
  if(request.headers.get('Content-Type')?.split(';')[0]!=='application/pdf')return Response.json({error:'Upload a PDF annual report.'},{status:415});
  const u=new URL('http://documents/v1/reports');for(const key of ['ticker','period','publishedAt','title','fileName'])if(url.searchParams.has(key))u.searchParams.set(key,url.searchParams.get(key)!);
  const headers:Record<string,string>={'Content-Type':'application/pdf'};if(request.headers.has('Content-Length'))headers['Content-Length']=request.headers.get('Content-Length')!;
  const response=await documentRequest(env,u.pathname+u.search,{method:'PUT',headers,body:request.body,signal:AbortSignal.timeout(120000),duplex:'half'} as RequestInit);return new Response(response.body,{status:response.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 }
 if(request.method==='DELETE'&&/^\/r_[a-f0-9]{64}$/.test(path)){if(request.headers.get('Origin')!==url.origin)return Response.json({error:'Invalid request origin.'},{status:403});const response=await documentRequest(env,'/v1/reports'+path,{method:'DELETE'});return new Response(response.body,{status:response.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}
 if(request.method==='GET'&&/^\/r_[a-f0-9]{64}\/summary$/.test(path)){const response=await documentRequest(env,'/v1/reports'+path);return new Response(response.body,{status:response.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}
 if(request.method==='GET'&&/^\/r_[a-f0-9]{64}\/download$/.test(path)){const response=await documentRequest(env,'/v1/reports'+path);return new Response(response.body,{status:response.status,headers:response.headers});}
 return Response.json({error:'Report route not found.'},{status:404});
}
