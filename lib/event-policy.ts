import {fundamentalCheck} from './fundamental-policy';
import {classifyEventIssues,THRESHOLDS} from './jarvis-gates';
function routineResultsCovered(event:any,review:any,now:number){
 if(!review||review.decision!=='supported'||review.eventFingerprint!==event.fingerprint||!event.fingerprint||!Number.isFinite(Date.parse(review.expiresAt))||Date.parse(review.expiresAt)<=now||!Number.isFinite(Date.parse(review.researchedAt))||Date.parse(review.researchedAt)>now+60000)return false;
 const titles=(event.issues||[]).map((s:string)=>s.startsWith('Possible material news: ')?s.slice(24):'');
 const risk=/\b(fraud|investigation|lawsuit|default|bankruptcy|resign\w*|acquisition|merger|takeover|warning|recall|sanction\w*|regulatory|usfda|downgrad\w*|cuts?|miss(?:ed|es)?|fell|fall\w*|plung\w*|slump\w*|breach|cyberattack)\b/i;
 if(!titles.length||titles.some((t:string)=>!t||!(/earnings call (?:highlights|transcript)/i.test(t))||risk.test(t)))return false;
 return titles.every((title:string)=>{const article=event.headlines?.find((h:any)=>h.title===title),published=Date.parse(article?.publishedAt),reviewed=Date.parse(review.researchedAt);return Number.isFinite(published)&&published>=now-72*3600000&&published<=reviewed&&published<=now&&review.sources?.some((s:any)=>s.kind==='results'&&s.primary===true&&s.reachable===true&&Number.isFinite(Date.parse(s.publishedAt))&&Date.parse(s.publishedAt)<=reviewed&&Math.abs(Date.parse(s.publishedAt)-published)<=14*86400000)});
}
/**
 * Event gate (Jarvis mandatory gate 7). Only serious red flags — fraud, regulator action,
 * auditor exit, default, pledge invocation and similar — pause buying until reviewed.
 * Results dates, dividends and ordinary headlines are returned as warnings.
 * Coverage counts as current for 24 hours so a long-term decision survives the overnight gap.
 */
export function eventSafety(event:any,ack?:string,now=Date.now(),review?:any){
 const window=THRESHOLDS.eventCoverageHours*3600000;
 const current=(at:any)=>Number.isFinite(Date.parse(at))&&now-Date.parse(at)<=window&&Date.parse(at)<=now+60000;
 if(event?.coverageVersion===2){
  const missing=[!(event.news?.ok===true&&current(event.news.checkedAt))?'Company news coverage is unavailable or older than 24 hours.':null,!(event.calendar?.ok===true&&current(event.calendar.checkedAt))?'The earnings and dividend calendar is unavailable or older than 24 hours.':null].filter(Boolean);
  if(missing.length)return {clear:false,status:'unknown',reason:missing.join(' ')+' Buying waits for a fresh check.',warnings:[] as string[],serious:[] as string[]};
 }
 if(!event?.ok||!current(event.checkedAt))return {clear:false,status:'unknown',reason:'News and company-event checks are unavailable or older than 24 hours. Buying waits for a fresh check.',warnings:[] as string[],serious:[] as string[]};
 const {serious,warnings}=classifyEventIssues(event.issues),notes=warnings.map(w=>`${w.label}: ${w.detail}`);
 if(serious.length&&ack!==event.fingerprint){
  if(routineResultsCovered(event,review,now))return {clear:true,status:'researched',reason:'The flagged results coverage is included in the current source-backed company review.',warnings:notes,serious};
  return {clear:false,status:'paused',reason:'Serious company event — review before buying: '+serious.join(' · '),warnings:notes,serious};
 }
 if(serious.length)return {clear:true,status:'reviewed',reason:'The serious events were marked reviewed. Financial, valuation and price checks still apply.',warnings:notes,serious};
 return {clear:true,status:warnings.some(w=>w.weight)?'warning':'clear',reason:warnings.some(w=>w.weight)?'No serious red flag. '+notes.filter((_,i)=>warnings[i].weight).join(' '):'No serious red flag in the monitored news and calendar. This is not a complete news or governance review.',warnings:notes,serious};
}
/** Only a still-valid company case can account for routine results already analysed. */
export function eventSafetyFor(discovery:any,ticker:string,now=Date.now()){
 const investment=fundamentalCheck(discovery,ticker,undefined,undefined,now);
 return eventSafety(discovery?.events?.[ticker],discovery?.eventAcks?.[ticker],now,investment.clear?investment.review:null);
}
export function ruleIdeas(portfolios:any[],discovery:any){
 return portfolios.flatMap(p=>(discovery.candidates||[]).map((c:any)=>{
 const event=eventSafetyFor(discovery,c.ticker);
 const fresh=Number.isFinite(Date.parse(c.ruleAsOf||discovery.asOf))&&Date.now()-Date.parse(c.ruleAsOf||discovery.asOf)<=6*3600000;
 const gate=discovery.buyGates?.[JSON.stringify([p.name,c.ticker])];
 const investment=fundamentalCheck(discovery,c.ticker,c.price,c.metrics?.statementDate);
 const enter=investment.clear&&(!gate||gate.allowed)&&c.status==='eligible'&&fresh&&p.complete&&p.cash>0&&event.clear;
 const reasons=!investment.clear?investment.reason:gate&&!gate.allowed?gate.reasons.join(' '):c.status!=='eligible'?c.gateReasons?.join(' '):!fresh?'The financial screen needs refreshing.':!p.complete?'Portfolio prices are incomplete.':p.cash<=0?'No cash is available.':event.reason;
 return {portfolio:p.name,ticker:c.ticker,market:c.market,category:c.category,source:'rules',decision:enter?'enter':c.status==='rejected'?'reject':'watch',conviction:'low',targetWeightPct:Math.min(5,investment.positionCapPct||5),warnings:investment.warnings||[],thesis:enter&&investment.review?investment.review.thesis:enter?'The financial screening rules pass. Cash and exposure limits determine whether a position can be sized.':reasons||'Screening checks are incomplete.',driver:`Revenue growth ${Number.isFinite(c.metrics?.revenue_growth_yoy)?c.metrics.revenue_growth_yoy.toFixed(2)+'%':'unavailable'}; earnings growth ${Number.isFinite(c.metrics?.earnings_growth_yoy)?c.metrics.earnings_growth_yoy.toFixed(2)+'%':'unavailable'}.`,risk:!investment.clear?investment.reason:event.clear?'News monitoring is limited to the available feed. Business quality and future returns are not guaranteed.':event.reason,portfolioFit:`A new entry is capped at ${Math.min(5,investment.positionCapPct||5)}% of this portfolio${investment.warnings?.length?' because the investment case has warnings':''}.`,eventStatus:event.status,fundamentalStatus:investment.status};
 }));
}
