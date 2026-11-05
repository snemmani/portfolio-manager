export const APP_TIME_ZONE='Asia/Kolkata';
export function formatIST(value:string|number|Date|null|undefined,seconds=false){
 if(value===null||value===undefined||value==='')return 'Unavailable';
 const d=value instanceof Date?value:new Date(typeof value==='number'?value*1000:value);
 if(!Number.isFinite(d.getTime()))return 'Unavailable';
 return new Intl.DateTimeFormat('en-IN',{timeZone:APP_TIME_ZONE,day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',...(seconds?{second:'2-digit' as const}:{})}).format(d)+' IST';
}
