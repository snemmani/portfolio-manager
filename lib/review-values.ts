export async function revision(value:any){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))).map(n=>n.toString(16).padStart(2,'0')).join('');}
export function ledgerRows(rows:any[]){return [...rows].sort((a,b)=>Number(a.Id)-Number(b.Id));}
export async function pack(value:any){const bytes=new Uint8Array(await new Response(new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());if(bytes.length>1400000)throw Error('Review snapshot exceeds the safe storage limit');let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);}
export async function unpack(value:string){return JSON.parse(await new Response(new Blob([Uint8Array.from(atob(value),c=>c.charCodeAt(0))]).stream().pipeThrough(new DecompressionStream('gzip'))).text());}
export function compactSnapshot(s:any){
 const holding=(h:any)=>{const {history,...rest}=h;return {...rest,quote:h.quote?{...h.quote,history:[]}:h.quote};};
 const {indices,recent,...rest}=s;return {...rest,holdings:s.holdings.map(holding),tradeHistory:(s.tradeHistory||[]).map(holding)};
}
