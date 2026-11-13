import {marketClock,exchangeSession} from './exchange-calendar';
export const RESEARCH_SCHEDULE={timeZone:'Asia/Kolkata',utcOffset:'+05:30',intervalMinutes:60,label:'Monday–Friday: hourly from 9:15 AM through 3:15 PM IST',startMinute:9*60+15,endMinute:15*60+30,times:[555,615,675,735,795,855,915]};
const offset=330*60000;
export function researchSlot(timestamp=Date.now()){
 const d=new Date(timestamp+offset),weekday=d.getUTCDay(),minute=d.getUTCHours()*60+d.getUTCMinutes();
 if(weekday===0||weekday===6||minute<RESEARCH_SCHEDULE.startMinute||minute>=RESEARCH_SCHEDULE.endMinute)return null;
 const slot=RESEARCH_SCHEDULE.times.filter(t=>t<=minute).at(-1)!;
 return d.toISOString().slice(0,10)+'T'+String(Math.floor(slot/60)).padStart(2,'0')+':'+String(slot%60).padStart(2,'0');
}
export function marketHours(timestamp=Date.now()){return ['INR','USD'].some(currency=>{const c=marketClock(timestamp,currency),s=exchangeSession(c.date,currency);return !!s&&c.minute>=s.open&&c.minute<s.close;});}
export function researchSchedule(enabled:boolean,lastSlot:string|null=null,timestamp=Date.now()){
 const slot=researchSlot(timestamp);let next:number|null=null;
 if(enabled){if(slot&&slot!==lastSlot)next=timestamp;else{const day=new Date(timestamp+offset);day.setUTCHours(0,0,0,0);outer:for(let i=0;i<8;i++)for(const minute of RESEARCH_SCHEDULE.times){const candidate=day.getTime()+i*86400000+minute*60000-offset;if(candidate>timestamp&&researchSlot(candidate)){next=candidate;break outer;}}}}
 return {...RESEARCH_SCHEDULE,withinBusinessHours:slot!==null,automaticAllowed:enabled&&slot!==null,nextAutomaticAt:next===null?null:new Date(next).toISOString(),outsideHours:'On demand only',holidays:'Weekday schedule; exchange holidays are not excluded.'};
}
