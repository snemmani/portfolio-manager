// Display urgency only: ordering never promotes a review into a trade approval.
export function actionPriority(action:unknown){
 const a=String(action||'').trim().toLowerCase();
 if(a==='locked')return 6;
 if(a.startsWith('exit')||a==='sell')return 0;
 if(a.startsWith('trim'))return 1;
 if(['buy','add','add candidate','enter'].includes(a))return 2;
 if(a==='watch'||a==='watchlist')return 4;
 if(a==='hold')return 5;
 return 3;
}
export function actionLabel(action:unknown){
 const a=String(action||'').trim().toLowerCase();
 return ({exit:'Exit',sell:'Sell',trim:'Trim',buy:'Buy',add:'Checking next step…','add candidate':'Checking next step…',review:'Review',watch:'Watch',hold:'Hold',locked:'Locked'} as Record<string,string>)[a]||String(action||'Review');
}
export function compareRecommendations(a:any,b:any){
 const value=(v:any)=>typeof v==='number'&&Number.isFinite(v)?v:-Infinity;
 const size=value(b.value)-value(a.value);
 const reviewOrder=actionPriority(a.action)<=1?Number(/review/i.test(String(a.action)))-Number(/review/i.test(String(b.action))):0;
 return actionPriority(a.action)-actionPriority(b.action)||reviewOrder||(Number.isNaN(size)?0:size)||String(a.ticker||'').localeCompare(String(b.ticker||''),'en')||String(a.portfolio||'').localeCompare(String(b.portfolio||''),'en')||String(a.source||'').localeCompare(String(b.source||''),'en');
}
export const priorityOrderLabel='Exit / Sell → Trim → Buy / Add → Review → Watch → Hold → Locked';
export function discoveryPriority(candidate:any,_decision?:string){
 return candidate.status==='eligible'?0:candidate.status==='watchlist'?1:2;
}
