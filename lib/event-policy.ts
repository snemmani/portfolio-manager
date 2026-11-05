import {fundamentalCheck} from './fundamental-policy';
function routineResultsCovered(event:any,review:any,now:number){
 if(!review||review.decision!=='supported'||review.eventFingerprint!==event.fingerprint||!event.fingerprint||!Number.isFinite(Date.parse(review.expiresAt))||Date.parse(review.expiresAt)<=now||!Number.isFinite(Date.parse(review.researchedAt))||Date.parse(review.researchedAt)>now+60000)return false;
 const titles=(event.issues||[]).map((s:string)=>s.startsWith('Possible material news: ')?s.slice(24):'');
 const risk=/\b(fraud|investigation|lawsuit|default|bankruptcy|resign\w*|acquisition|merger|takeover|warning|recall|sanction\w*|regulatory|usfda|downgrad\w*|cuts?|miss(?:ed|es)?|fell|fall\w*|plung\w*|slump\w*|breach|cyberattack)\b/i;
 if(!titles.length||titles.some((t:string)=>!t||!(/earnings call (?:highlights|transcript)/i.test(t))||risk.test(t)))return false;
 return titles.every((title:string)=>{const article=event.headlines?.find((h:any)=>h.title===title),published=Date.parse(article?.publishedAt),reviewed=Date.parse(review.researchedAt);return Number.isFinite(published)&&published>=now-72*3600000&&published<=reviewed&&published<=now&&review.sources?.some((s:any)=>s.kind==='results'&&s.primary===true&&s.reachable===true&&Number.isFinite(Date.parse(s.publishedAt))&&Date.parse(s.publishedAt)<=reviewed&&Math.abs(Date.parse(s.publishedAt)-published)<=14*86400000)});
}
export function eventSafety(event:any,ack?:string,now=Date.now(),review?:any){
 if(event?.coverageVersion===2){
  const current=(part:any)=>part?.ok===true&&Number.isFinite(Date.parse(part.checkedAt))&&now-Date.parse(part.checkedAt)<=30*60000&&Date.parse(part.checkedAt)<=now+60000;
  const missing=[!current(event.news)?'Current company news coverage is unavailable or stale across the configured sources.':null,!current(event.calendar)?'Current earnings and dividend calendar coverage is unavailable or stale.':null].filter(Boolean);
  if(missing.length)return {clear:false,status:'unknown',reason:missing.join(' ')+' Buying waits for a fresh check.'};
 }
 if(!event?.ok||!Number.isFinite(Date.parse(event.checkedAt))||now-Date.parse(event.checkedAt)>30*60000||Date.parse(event.checkedAt)>now+60000)return {clear:false,status:'unknown',reason:'Current news and company-event checks are unavailable or older than 30 minutes. Buying waits for a fresh check.'};
 const issues=event.issues||[];
 if(issues.length&&ack!==event.fingerprint){if(routineResultsCovered(event,review,now))return {clear:true,status:'researched',reason:'The earnings-call coverage is included in the current source-backed investment review. Financial, valuation and technical checks still apply.'};return {clear:false,status:'paused',reason:'Review the flagged company events before buying: '+issues.join(' ')};}
 return {clear:true,status:issues.length?'reviewed':'clear',reason:issues.length?'The flagged events were marked reviewed. Financial and technical rules still apply.':'No pause-triggering event was found in the monitored feed. This is not a complete news or governance review.'};
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
