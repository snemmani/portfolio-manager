export const RESEARCH_SCHEDULE={timeZone:'Asia/Kolkata',utcOffset:'+05:30',intervalMinutes:120,label:'Monday–Friday: 9:15 AM, 11:15 AM, 1:15 PM and 3:15 PM IST',startMinute:9*60+15,endMinute:15*60+30,times:[555,675,795,915]};
const offset=330*60000;
export function researchSlot(timestamp=Date.now()){
 const d=new Date(timestamp+offset),weekday=d.getUTCDay(),minute=d.getUTCHours()*60+d.getUTCMinutes();
 if(weekday===0||weekday===6||minute<RESEARCH_SCHEDULE.startMinute||minute>=RESEARCH_SCHEDULE.endMinute)return null;
 const slot=RESEARCH_SCHEDULE.times.filter(t=>t<=minute).at(-1)!;
 return d.toISOString().slice(0,10)+'T'+String(Math.floor(slot/60)).padStart(2,'0')+':'+String(slot%60).padStart(2,'0');
}
export function marketHours(timestamp=Date.now()){
 const inside=(zone:string,start:number,end:number)=>{const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(timestamp));const v=Object.fromEntries(parts.map(p=>[p.type,p.value]));const minute=Number(v.hour)*60+Number(v.minute);return !['Sat','Sun'].includes(v.weekday)&&minute>=start&&minute<end;};
 return inside('Asia/Kolkata',555,930)||inside('America/New_York',570,960);
}
export function researchSchedule(enabled:boolean,lastSlot:string|null=null,timestamp=Date.now()){
 const slot=researchSlot(timestamp);let next:number|null=null;
 if(enabled){if(slot&&slot!==lastSlot)next=timestamp;else{const day=new Date(timestamp+offset);day.setUTCHours(0,0,0,0);outer:for(let i=0;i<8;i++)for(const minute of RESEARCH_SCHEDULE.times){const candidate=day.getTime()+i*86400000+minute*60000-offset;if(candidate>timestamp&&researchSlot(candidate)){next=candidate;break outer;}}}}
 return {...RESEARCH_SCHEDULE,withinBusinessHours:slot!==null,automaticAllowed:enabled&&slot!==null,nextAutomaticAt:next===null?null:new Date(next).toISOString(),outsideHours:'On demand only',holidays:'Weekday schedule; exchange holidays are not excluded.'};
}
