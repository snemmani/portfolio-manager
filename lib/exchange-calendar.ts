/** Reviewed exchange calendars. Never infer closures from missing price bars.
 * NSE: https://www.nseindia.com/resources/exchange-communication-holidays
 * Special session: https://nsearchives.nseindia.com/content/circulars/CMTR76941.pdf
 * US: https://www.nyse.com/trade/hours-calendars
 * Add each newly published NSE year here; unknown years use weekday checks and report limited coverage.
 */
const indiaHolidays:Record<string,string[]>={2026:['01-15','01-26','03-03','03-26','03-31','04-03','04-14','05-01','05-28','06-26','09-14','10-02','10-20','11-10','11-24','12-25']};
const usHolidays:Record<string,string[]>={
 2026:['01-01','01-19','02-16','04-03','05-25','06-19','07-03','09-07','11-26','12-25'],
 2027:['01-01','01-18','02-15','03-26','05-31','06-18','07-05','09-06','11-25','12-24'],
 2028:['01-17','02-21','04-14','05-29','06-19','07-04','09-04','11-23','12-25'],
};
const earlyCloses=new Set(['2026-11-27','2026-12-24','2027-11-26','2028-07-03','2028-11-24']);
const formatters=new Map<string,Intl.DateTimeFormat>();
export function marketClock(timestamp:number,currency:string){
 const zone=currency==='INR'?'Asia/Kolkata':currency==='FX'?'UTC':'America/New_York';
 let f=formatters.get(zone);if(!f){f=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});formatters.set(zone,f);}
 const p=Object.fromEntries(f.formatToParts(new Date(timestamp)).map(p=>[p.type,p.value]));
 return {date:`${p.year}-${p.month}-${p.day}`,minute:Number(p.hour)*60+Number(p.minute)};
}
export function exchangeSession(date:string,currency:string):{open:number;close:number}|null{
 if(currency==='INR'&&date==='2026-11-08')return {open:860,close:930};
 const weekday=new Date(date+'T12:00:00Z').getUTCDay();
 if(weekday===0||weekday===6)return null;
 const holidays=currency==='INR'?indiaHolidays:usHolidays;
 if(currency!=='FX'&&holidays[date.slice(0,4)]?.includes(date.slice(5)))return null;
 return currency==='INR'?{open:555,close:930}:currency==='FX'?{open:0,close:1440}:{open:570,close:earlyCloses.has(date)?780:960};
}
const previousDate=(date:string)=>new Date(Date.parse(date+'T12:00:00Z')-86400000).toISOString().slice(0,10);
export function quoteFreshness(time:number|null,now=Date.now(),currency='INR'){
 const local=marketClock(now,currency),session=exchangeSession(local.date,currency);
 const covered=currency==='FX'||!!(currency==='INR'?indiaHolidays:usHolidays)[local.date.slice(0,4)];
 // Thirty minutes at open permit delayed feeds. After that, yesterday's quote cannot size a live portfolio.
 const intraday=currency!=='FX'&&!!session&&local.minute>=session.open+30&&local.minute<session.close+30;
 let expected=local.date;
 if(session&&local.minute<session.open+30)expected=previousDate(expected);
 for(let i=0;i<14&&!exchangeSession(expected,currency);i++)expected=previousDate(expected);
 const valid=typeof time==='number'&&Number.isFinite(time)&&time>0&&time*1000<=now+60000;
 const quoteSession=valid?marketClock(time!*1000,currency).date:null;
 const expectedHours=exchangeSession(expected,currency)!;
 const completed=expected!==local.date||!session||local.minute>=session.close+30;
 const missedClose=currency!=='FX'&&quoteSession===expected&&completed&&marketClock(time!*1000,currency).minute<expectedHours.close-30;
 const stale=!valid||quoteSession!<expected||missedClose||(intraday&&now-time!*1000>30*60000);
 return {stale,expectedSession:expected,quoteSession,calendarCovered:covered,sessionOpen:!!session&&local.minute>=session.open&&local.minute<session.close,reason:!valid?'Missing or invalid quote timestamp':stale?'Quote is older than the expected exchange session or delayed-feed allowance':intraday?'Current-session quote':currency==='FX'?'Latest business-day FX quote':'Latest exchange-session quote'};
}
