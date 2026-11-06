import {currentAnnualDocuments,DOCUMENT_POLICY} from './annual-documents';
import {classifyEventIssues,convictionCap,warningWeight,THRESHOLDS,type Gate} from './jarvis-gates';
import {candidateScorecard} from './discovery-review';
export const FUNDAMENTAL_POLICY='investor-v1';
/** Review policies whose blockers follow the current materiality rules (v3 = Jarvis gates). */
export const CURRENT_MATERIALITY=['materiality-v2','materiality-v3'];
export const REVIEW_AREAS=['financial_delivery','accounting','balance_sheet','moat','management','valuation','outlook','sector_checks'] as const;

type Check={clear:boolean;status:string;reason:string;review:any;blockers?:string[];warnings?:string[];warningCount?:number;positionCapPct?:number;gates?:Gate[];valuation?:{maxEntry:number|null;codeValue:number|null;ceiling:number|null;currency:string|null;codeBinding:boolean}};
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);

/** Annual-report uploads changed after the review was written. */
function documentsChanged(discovery:any,ticker:string,r:any){
 if(discovery.documentPolicy!==DOCUMENT_POLICY)return false;
 const reports=currentAnnualDocuments(discovery.annualDocuments||[],ticker),refs=r.documentRefs||[];
 return reports.some((d:any)=>!refs.some((ref:any)=>ref.id===d.id&&ref.sha256===d.sha256&&ref.period===d.period&&ref.summaryHash===(d.summaryHash||null)))
  ||refs.some((ref:any)=>!(discovery.annualDocuments||[]).some((d:any)=>d.id===ref.id&&d.sha256===ref.sha256&&d.ticker===ticker&&d.period===ref.period));
}

/** Scorecard for a candidate when the caller did not pre-compute the company index. */
function lazyCompanyGate(discovery:any,ticker:string){
 const c=discovery?.candidates?.find((x:any)=>x.ticker===ticker);if(!c)return null;
 const sc=c.scorecard||(Array.isArray(c.annualSeries)&&c.annualSeries.length?candidateScorecard(c):null);
 return sc?{status:sc.status,warningCount:sc.warningCount,intrinsic:sc.intrinsic,financial:c.sector==='Financials',severe:sc.severe||[]}:{status:'unknown',warningCount:0,intrinsic:null,financial:c.sector==='Financials',severe:[]};
}
/** Area judged acceptable: a source-backed pass, or a mitigated warning-level concern. */
const areaAcceptable=(a:any)=>a&&a.sourceBacked&&(a.status==='pass'||a.status==='concern'&&a.materiality!=='blocking'&&!!a.mitigation);
const areaBlocking=(a:any)=>a&&a.status==='concern'&&a.materiality==='blocking';

/**
 * Research-stage Jarvis gates: the company review must exist, be current, show no
 * serious accounting or balance-sheet problem and provide a maximum entry price.
 * The buy ceiling is the lower of that price and the code valuation (margin of safety).
 * Secondary research gaps (moat, management, older history, unverified details) are
 * warnings that reduce the position size instead of blocking.
 */
export function fundamentalCheck(discovery:any,ticker:string,price?:number|null,statementPeriod?:string|null,now=Date.now()):Check{
 // Fail closed: without the investment-review policy no purchase can be justified.
 if(discovery?.fundamentalPolicy!==FUNDAMENTAL_POLICY)return {clear:false,status:'missing',reason:'The company-review policy is not loaded, so no purchase can be justified. Refresh the market checks.',review:null};
 if(discovery.documentPolicy===DOCUMENT_POLICY&&discovery.annualDocumentsAvailable===false)return {clear:false,status:'missing',reason:'The report library is unavailable, so changes to the annual-report evidence cannot be checked. Buying waits for the library to return.',review:null};
 const r=discovery.fundamentalReviews?.[ticker];
 if(!r)return {clear:false,status:'missing',reason:'The company review has not been done yet. Passing the financial screen is not enough to propose buying.',review:null};
 if(documentsChanged(discovery,ticker,r))return {clear:false,status:'stale',reason:'New, replaced or removed annual reports require the investment case to be reviewed again. Cached summaries are reused; unchanged PDFs do not need to be reprocessed.',review:r};
 if(r.version!==1||!Number.isFinite(Date.parse(r.researchedAt))||Date.parse(r.researchedAt)>now+60000||!Number.isFinite(Date.parse(r.expiresAt))||Date.parse(r.expiresAt)<=now)return {clear:false,status:'stale',reason:'The company review has expired or its date is invalid. Refresh it before buying.',review:r};
 if(statementPeriod&&(!r.statementPeriod||statementPeriod>r.statementPeriod))return {clear:false,status:'stale',reason:'Newer annual financial statements are available than those in the review. The outlook and valuation need updating.',review:r};
 const event=discovery.events?.[ticker],classified=event?.ok?classifyEventIssues(event.issues):null;
 const lastResults=Date.parse(event?.calendar?.lastEarningsAt);
 if(Number.isFinite(lastResults)&&lastResults<=now&&lastResults>Date.parse(r.researchedAt))return {clear:false,status:'stale',reason:'New quarterly results were published after the company review. The review needs updating before buying.',review:r};
 if(classified?.serious.length&&event.fingerprint!==r.eventFingerprint)return {clear:false,status:'stale',reason:'A serious company event appeared after the review. The investment case must be reassessed; acknowledging the headline alone does not update it.',review:r};
 // materiality-v3 blockers are mandatory by construction; older reviews mixed in evidence gaps.
 if(r.policyVersion==='materiality-v3'&&r.blockingReasons?.length)return {clear:false,status:'incomplete',reason:r.blockingReasons[0],blockers:r.blockingReasons,warnings:r.warnings||[],review:r};
 const oldValuationGap=r.policyVersion!=='materiality-v3'&&(r.blockingReasons||[]).some((b:string)=>/valuation|maximum entry/i.test(b));
 if(r.decision==='reject')return {clear:false,status:'reject',reason:'The company review does not support owning this business.',blockers:r.blockingReasons||r.gaps||[],warnings:r.warnings||[],review:r};

 const company=discovery.companyGates?.[ticker]??lazyCompanyGate(discovery,ticker),financial=company?.financial===true;
 const area=(key:string)=>r.areas?.find((a:any)=>a.area===key);
 const gates:Gate[]=[],blockers:string[]=[],warnings:string[]=[];
 // Earnings quality (research part): serious accounting findings block.
 const accounting=area('accounting');
 if(r.accountingQuality==='serious_red_flag'||areaBlocking(accounting)){blockers.push('The review found a serious accounting red flag.');gates.push({id:'earningsQuality',label:'Earnings quality',stage:'research',status:'fail',detail:accounting?.finding||'Serious accounting red flag.'});}
 else{if(['unverified','moderate_concern'].includes(r.accountingQuality)||!areaAcceptable(accounting))warnings.push(r.accountingQuality==='moderate_concern'?'Accounting: moderate concern noted in the review.':'Accounting notes could not be fully verified in the review.');gates.push({id:'earningsQuality',label:'Earnings quality',stage:'research',status:'pass',detail:'No serious accounting red flag in the review.'});}
 // Solvency (research part): lenders need capital adequacy / bad-loan evidence; anyone with a blocking balance-sheet concern fails.
 const balance=area('balance_sheet');
 if(areaBlocking(balance)){blockers.push('The review found a material balance-sheet problem.');gates.push({id:'solvency',label:'Solvency',stage:'research',status:'fail',detail:balance.finding||'Material balance-sheet concern.'});}
 else if(financial&&!areaAcceptable(balance)){blockers.push('Capital adequacy and bad-loan ratios need source-backed review for a lender.');gates.push({id:'solvency',label:'Solvency',stage:'research',status:'unknown',detail:'Capital adequacy and bad loans are not yet verified.'});}
 else if(financial)gates.push({id:'solvency',label:'Solvency',stage:'research',status:'pass',detail:balance.finding||'Capital and asset quality reviewed.'});
 // Margin of safety
 const maxEntry=!oldValuationGap&&finite(r.valuation?.maxEntry)&&r.valuation.maxEntry>0?r.valuation.maxEntry:null;
 const code=company?.intrinsic,codeValue=finite(code?.value)&&code.value>0?code.value:null,codeBinding=codeValue!==null&&code.binding!==false;
 const ceiling=maxEntry===null?null:codeBinding?Math.min(maxEntry,codeValue!):maxEntry;
 const valuation={maxEntry,codeValue,ceiling,currency:r.valuation?.currency||null,codeBinding};
 if(maxEntry===null){blockers.push('The review has no supported maximum entry price yet.');gates.push({id:'marginOfSafety',label:'Margin of safety',stage:'research',status:'unknown',detail:'A researched maximum entry price is needed.'});}
 const notes=codeValue===null?['The code valuation is unavailable, so only the researched entry price limits the buy price.']:[];
 if(blockers.length)return {clear:false,status:r.decision==='supported'?'incomplete':r.decision||'incomplete',reason:blockers[0]+(blockers.length>1?` ${blockers.length-1} more check${blockers.length>2?'s':''} also need attention.`:''),blockers,warnings:[...warnings,...(r.warnings||[])],gates,valuation,review:r};

 // Warnings from the review, the screen and current events determine conviction.
 const researchNotes=[...new Set<string>([...(r.warnings||[]),...(r.blockingReasons||[]),...(r.decision!=='supported'?r.gaps||[]:[])])];
 if(researchNotes.length)warnings.push(`Research notes (${researchNotes.length}): ${researchNotes.slice(0,3).join(' · ')}`);
 const eventWarnings=classified?.warnings||[];
 const total=warnings.length+(finite(company?.warningCount)?company.warningCount:0)+warningWeight(eventWarnings);
 const allWarnings=[...warnings,...eventWarnings.filter(w=>w.weight).map(w=>`${w.label}: ${w.detail}`),...researchNotes,...notes];
 if(total>=THRESHOLDS.watchlistWarnings)return {clear:false,status:'watch',reason:`Mandatory checks pass, but ${total} warnings (screen, research and events) are too many for a position. Keep it on the watchlist.`,warnings:allWarnings,warningCount:total,gates,valuation,review:r};
 gates.push({id:'marginOfSafety',label:'Margin of safety',stage:'research',status:Number.isFinite(price)&&price!>ceiling!?'fail':'pass',detail:`Buy ceiling ${ceiling} ${valuation.currency||''}: lower of the researched entry (${maxEntry})${codeBinding?` and the code valuation (${codeValue})`:codeValue!==null?`; the code valuation (${codeValue}) is indicative only`:''}.`});
 if(Number.isFinite(price)&&price!>ceiling!)return {clear:false,status:'valuation',reason:`The price is above the buy ceiling of ${ceiling} ${valuation.currency||''} (lower of the researched entry ${maxEntry}${codeBinding?` and the code valuation ${codeValue}`:''}). Wait for a margin of safety.`,warnings:allWarnings,warningCount:total,gates,valuation,review:r};
 const cap=convictionCap(total);
 return {clear:true,status:'supported',reason:total?`Mandatory checks pass with ${total} warning${total===1?'':'s'}; the position is capped at ${cap}%.`:'All mandatory checks pass.',warnings:allWarnings,warningCount:total,positionCapPct:cap,gates,valuation,review:r};
}
