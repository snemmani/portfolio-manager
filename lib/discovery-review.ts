import {screenScorecard,compactScorecard,GATE_POLICY} from './jarvis-gates';
/** A missing portfolio assessment is not an investment rejection. */
export function candidateReview(candidate:any,portfolio:string,ideas:any[]=[]){
 const idea=ideas.find(i=>i.portfolio===portfolio&&i.ticker===candidate.ticker);
 const checks=[...(candidate.gateReasons||[]),...(candidate.evidenceGaps||[])];
 if(candidate.status!=='eligible')return {state:candidate.status,label:candidate.status==='rejected'?'Rejected by screening':'On watchlist',reasons:checks.length?checks:['The screening checks have not passed.'],idea};
 if(!portfolio||portfolio==='All portfolios')return {state:'choose',label:'Choose a portfolio',reasons:['Select a portfolio to check whether this stock fits its holdings and available cash.'],idea:null};
 if(!idea||['missing','incomplete','stale'].includes(idea.fundamentalStatus)&&idea.decision!=='reject')return {state:'pending',label:idea?.fundamentalStatus==='incomplete'?'Research unfinished':'Investment research pending',reasons:[idea?.thesis||`Investment research for this company has not been completed. Review the next candidates to prepare a purchase plan for ${portfolio}.`],idea:idea||null};
 const reasons=[idea.fundamentalStatus&&idea.fundamentalStatus!=='supported'&&idea.fundamentalStatus!=='legacy'&&`Investment case: ${idea.thesis}`,idea.risk&&`Main concern: ${idea.risk}`,idea.portfolioFit&&`Portfolio fit: ${idea.portfolioFit}`].filter(Boolean) as string[];
 return {state:idea.decision,label:idea.source==='rules'?(idea.decision==='enter'?'Financial & event rules pass — check price plan':'Buying paused by the current checks'):idea.decision==='enter'?'Buy approved for this portfolio':idea.decision==='reject'?'Not recommended for this portfolio':'Wait before buying',reasons,idea};
}
export function discoveryCoverage(candidates:any[],portfolio:string,ideas:any[],allocations:any[]=[]){
 const eligible=candidates.filter(c=>c.status==='eligible'),reviews=eligible.map(c=>candidateReview(c,portfolio,ideas));
 return {screened:candidates.length,eligible:eligible.length,reviewed:reviews.filter(r=>!['pending','choose'].includes(r.state)).length,pending:reviews.filter(r=>r.state==='pending').length,approved:reviews.filter(r=>r.state==='enter').length,sized:allocations.filter(a=>a.isNew).length};
}
/** Flag conflicting refreshed fundamentals instead of calling a stale screen match a pass. */
/** Jarvis gates for a screened candidate; the Python status is only a fallback for rows without statements. */
export function candidateScorecard(c:any){
 const metrics=c.metrics||{};
 return screenScorecard({ticker:c.ticker,market:c.market==='US'?'US':'IN',financial:c.sector==='Financials',price:Number.isFinite(c.price)?c.price:null,quoteTime:c.quoteTime,currency:c.currency,financialCurrency:metrics.financialCurrency,series:c.annualSeries,marketCap:metrics.marketCap,epsTtm:metrics.eps_ttm,epsForward:metrics.eps_forward,peTtm:metrics.pe_ttm,peForward:metrics.pe_forward,analystRating:metrics.analystRating,matchedScreens:c.matchedScreens,bucketMetrics:metrics});
}
export function applyScreenGates(c:any){
 const sc=candidateScorecard(c);
 const reasons=[sc.summary,...sc.blocking.map(g=>`${g.label}: ${g.detail}`),...sc.warnings.filter(w=>w.weight).map(w=>`Warning — ${w.label}: ${w.detail}`)];
 return {...c,status:sc.status,gateReasons:reasons,scorecard:compactScorecard(sc),screenPolicy:sc.policy};
}
export function recheckCandidate(candidate:any,strict=false){
 if(Array.isArray(candidate.annualSeries)&&candidate.annualSeries.length)return applyScreenGates(candidate);
 // Already decided by the gates (statements stripped from the live payload): keep that decision.
 if(candidate.screenPolicy===GATE_POLICY)return candidate;
 if(candidate.status!=='eligible')return candidate;
 const checks:[RegExp,string,string,string][]=[[/Rev Growth>([\d.]+)%/i,'revenue_growth_yoy','Revenue growth','%'],[/NI Growth>([\d.]+)%/i,'earnings_growth_yoy','Earnings growth','%'],[/ROE>([\d.]+)%/i,'roe','ROE','%'],[/P\/E<([\d.]+)/i,'pe_ttm','P/E',''],[/P\/B<([\d.]+)/i,'pb','P/B',''],[/PEG<([\d.]+)/i,'peg','PEG',''],[/ROCE>([\d.]+)%/i,'roce','Return on capital employed','%'],[/Net Margin>([\d.]+)%/i,'netMargin','Net profit margin','%'],[/ICR>([\d.]+)/i,'interestCoverage','Interest coverage',''],[/(?<!LT )D\/E<([\d.]+)/i,'debtEquity','Debt/equity',''],[/LT D\/E<([\d.]+)/i,'longTermDebtEquity','Long-term debt/equity','']];
 const screens=(candidate.matchedScreens||[]).map((screen:any)=>{
 const issues:string[]=[];
 for(const [pattern,key,label,unit] of checks){const match=String(screen.criteria).match(pattern),metric=key,v=candidate.metrics?.[metric];if(!match)continue;if(key==='interestCoverage'&&candidate.metrics?.noInterestExpense===true)continue;const threshold=Number(match[1]);if(typeof v!=='number'||!Number.isFinite(v)){if(strict)issues.push(`${label} is unavailable; the ${screen.bucket} screen requires ${pattern.source.includes('>')?'above':'below'} ${threshold}${unit}.`);continue;}const pass=pattern.source.includes('>')?v>threshold:['debtEquity','longTermDebtEquity'].includes(key)?v>=0&&v<threshold:v>0&&v<threshold;
 if(!pass)issues.push(`${label} is ${Number(v.toFixed(2))}${unit}; the ${screen.bucket} screen requires ${pattern.source.includes('>')?'above':'below'} ${threshold}${unit}.`);}
 if(strict&&String(screen.criteria).includes('FCF+ve')&&!(candidate.metrics?.fcf>0))issues.push('Positive free cash flow could not be confirmed for this screen.');
 return issues;
 });
 if(screens.length&&screens.every((issues:string[])=>issues.length))return {...candidate,status:'watchlist',gateReasons:[...(candidate.gateReasons||[]),...new Set(screens.flat()),'One or more required checks is missing or below its threshold. Preliminary Yahoo matches do not establish financial eligibility.']};
 return candidate;
}
