import {uploadedSource,uploadedResearchGaps,uploadedReferences} from './document-research';
import {REVIEW_AREAS} from './fundamental-policy';
/** Backstop only: reviews go stale earlier when new results, statements, reports or serious events arrive. */
export const REVIEW_LIFETIME_DAYS=100;
const text={type:'string'},strings={type:'array',items:text};
const object=(properties:any)=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
export const FUNDAMENTAL_SCHEMA={type:'array',items:object({ticker:text,decision:{type:'string',enum:['supported','watch','reject','incomplete']},summary:text,statementPeriod:text,thesis:text,catalysts:strings,risks:strings,breakConditions:strings,gaps:strings,warnings:strings,accountingQuality:{type:'string',enum:['clean','mild_concern','moderate_concern','serious_red_flag','unverified']},
 sources:{type:'array',items:object({id:text,url:text,title:text,publishedAt:text,financialPeriod:text,kind:{type:'string',enum:['annual_report','results','filing','earnings_call','governance']}})},
 areas:{type:'array',items:object({area:{type:'string',enum:REVIEW_AREAS},status:{type:'string',enum:['pass','concern','unverified']},rationale:text,materiality:{type:'string',enum:['none','warning','blocking']},mitigation:text,sourceIds:strings})},
 annuals:{type:'array',items:object({period:text,currency:text,revenue:{type:'number'},netIncome:{type:'number'},operatingCashFlow:{type:'number'},debt:{type:'number'},equity:{type:'number'},sourceIds:strings})},
 valuation:object({currency:text,maxEntry:{type:'number'},bearValue:{type:'number'},baseValue:{type:'number'},bullValue:{type:'number'},assumptions:text,sourceIds:strings})})};
export function publicSourceUrl(raw:any){try{const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||!u.hostname.includes('.')||/^(?:localhost|\d+(?:\.\d+){3}|\[)/.test(u.hostname)||u.hostname.endsWith('.local'))return null;return u;}catch{return null}}
export function primarySource(raw:string,profile:any){const u=publicSourceUrl(raw);if(!u)return false;const host=u.hostname.toLowerCase(),issuer=publicSourceUrl(profile?.website)?.hostname.replace(/^www\./,'');return ['sec.gov','nseindia.com','bseindia.com','bseindia.in'].some(h=>host===h||host.endsWith('.'+h))||!!issuer&&(host===issuer||host.endsWith('.'+issuer));}
const sentence=(v:any)=>typeof v==='string'&&v.length>0&&v.length<=4000;
const list=(v:any)=>Array.isArray(v)&&v.length<=25&&v.every(sentence);
export function validateFundamentals(input:any,snapshot:any,checks:any[]=[]){
 if(input===undefined){if(snapshot.fundamentalPolicy==='investor-v1')input=[];else return [];}
 if(!Array.isArray(input)||input.length>4)throw Error('Invalid fundamental research batch');
 const scope=snapshot.fundamentalScope||[],seen=new Set(),time=Date.now();
 const date=(v:any)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 const output=input.map((item:any)=>{
  const target=scope.find((s:any)=>s.ticker===item.ticker);if(!target||seen.has(item.ticker)||!['supported','watch','reject','incomplete'].includes(item.decision)||!sentence(item.summary)||!sentence(item.thesis)||!['catalysts','risks','breakConditions','gaps'].every(k=>list(item[k]))||item.warnings!==undefined&&!list(item.warnings)||!Array.isArray(item.sources)||item.sources.length>20||!Array.isArray(item.areas)||item.areas.length>8||!Array.isArray(item.annuals)||item.annuals.length>6)throw Error('Invalid company review');seen.add(item.ticker);
  const blockers=[...item.gaps,...uploadedResearchGaps(item,snapshot)],warnings=[...(item.warnings||[])],profile=snapshot.fundamentalProfiles?.[item.ticker],ids=new Set<string>();
  const sources=item.sources.map((s:any)=>{const uploaded=uploadedSource(s,item.ticker,snapshot);if(!sentence(s.id)||ids.has(s.id)||!sentence(s.title)||!['annual_report','results','filing','earnings_call','governance'].includes(s.kind)||!uploaded&&!publicSourceUrl(s.url))throw Error('Invalid source citation');ids.add(s.id);if(uploaded)return uploaded;const checked=checks.find(c=>c.ticker===item.ticker&&c.url===s.url&&c.reachable===true),primary=primarySource(s.url,profile);
   // Historical annual reports need an identified reporting period, not an invented release day.
   const citedPeriods=item.annuals.filter((a:any)=>a.sourceIds?.includes(s.id)&&date(a.period)).map((a:any)=>a.period).sort();
   const knownYear:string[]=(String(s.title)+' '+decodeURIComponent(s.url)).match(/(?:19|20)\d{2}/g)||[];
   const inferred=citedPeriods.filter((p:string)=>knownYear.includes(p.slice(0,4))).at(-1);
   const financialPeriod=date(s.financialPeriod)?s.financialPeriod:inferred||null;
   return {...s,financialPeriod,publicationDateKnown:Number.isFinite(Date.parse(s.publishedAt)),primary,reachable:!!checked};});
  const cited=(a:any)=>Array.isArray(a)&&a.length>0&&a.length<=20&&a.every((id:any)=>typeof id==='string'&&ids.has(id));
  const validSources=new Set(sources.filter((s:any)=>s.reachable&&((s.uploaded&&s.identityMatched&&Date.parse(s.financialPeriod)<=time)||(s.primary&&((Number.isFinite(Date.parse(s.publishedAt))&&Date.parse(s.publishedAt)<=time)||(s.kind==='annual_report'&&date(s.financialPeriod)&&Date.parse(s.financialPeriod)<=time))))).map((s:any)=>s.id));
  const backed=(a:any)=>cited(a)&&a.some((id:string)=>validSources.has(id));
  const areas=item.areas.map((a:any)=>{if(!REVIEW_AREAS.includes(a.area)||!['pass','concern','unverified'].includes(a.status)||!sentence(a.rationale)||!Array.isArray(a.sourceIds))throw Error('Invalid research section');if(a.sourceIds.length&&!cited(a.sourceIds))blockers.push(`The ${a.area.replaceAll('_',' ')} assessment contains an unknown source reference.`);return {...a,sourceBacked:backed(a.sourceIds),status:a.status==='pass'&&!backed(a.sourceIds)?'unverified':a.status};});
  if(new Set(areas.map((a:any)=>a.area)).size!==areas.length)throw Error('Duplicate fundamental section');
  // materiality-v3: only the Jarvis mandatory research items block (serious accounting or
  // balance-sheet problems, a lender's capital/asset-quality evidence, and a usable valuation).
  // Everything else is a warning that reduces the position size.
  const financial=[...(snapshot.holdings||[]),...(snapshot.discovery?.candidates||[])].some((x:any)=>x.ticker===item.ticker&&x.sector==='Financials');
  const core=financial?['balance_sheet','valuation']:['valuation'],blockingAreas=['accounting','balance_sheet'];
  for(const key of REVIEW_AREAS){const a=areas.find((a:any)=>a.area===key),label=key.replaceAll('_',' ');if(!a||a.status==='unverified'||!a.sourceBacked){(core.includes(key)?blockers:warnings).push(`${label} still needs source-backed analysis.`);continue;}if(a.status==='concern'){const managed=a.materiality!=='blocking'||!blockingAreas.includes(key);(managed?warnings:blockers).push(`${label}: ${a.rationale}${a.mitigation&&sentence(a.mitigation)?' Monitor: '+a.mitigation:''}`);}}
  const accounting=areas.find((a:any)=>a.area==='accounting'),quality=item.accountingQuality||(accounting?.status==='pass'?'assessed':'unverified');
  if(!['clean','mild_concern','moderate_concern','serious_red_flag','unverified','assessed'].includes(quality))blockers.push('The accounting-quality classification is invalid.');
  if(quality==='serious_red_flag')blockers.push('Serious accounting red flag; buying remains blocked.');
  else if(quality==='unverified')warnings.push('Accounting notes could not be fully verified.');
  else if(quality==='moderate_concern')warnings.push('Moderate accounting concern; monitor the flagged items.');
  if(quality==='mild_concern')warnings.push('Minor accounting-control weaknesses need monitoring; no material misstatement may remain unresolved.');
  const annuals=[...item.annuals].sort((a,b)=>String(a.period).localeCompare(String(b.period)));let yearsValid=annuals.length>=2;
  annuals.forEach((a:any,i)=>{if(!date(a.period)||Date.parse(a.period)>time||!['revenue','netIncome','operatingCashFlow','debt','equity'].every(k=>Number.isFinite(a[k]))||a.revenue<=0||a.debt<0||!backed(a.sourceIds)||!a.sourceIds.some((id:string)=>{const source=sources.find((s:any)=>s.id===id);return validSources.has(id)&&Date.parse(source?.financialPeriod||source?.publishedAt)>=Date.parse(a.period)})||!/^[A-Z]{3}$/.test(a.currency))yearsValid=false;if(i){const diff=Date.parse(a.period)-Date.parse(annuals[i-1].period);if(diff<300*86400000||diff>430*86400000||a.currency!==annuals[i-1].currency)yearsValid=false;}});
  if(!yearsValid)warnings.push('Sourced annual rows were not reconciled; the multi-year scorecard is the reference.');
  else if(annuals.length<5)warnings.push(`Financial history covers ${annuals.length} annual periods; a five-year trend is not yet complete.`);
  const newest=annuals.at(-1)?.period,statementPeriod=date(item.statementPeriod)?item.statementPeriod:newest||'';
  if(!annuals.length||statementPeriod!==newest||time-Date.parse(statementPeriod)>550*86400000)warnings.push('The latest annual statements were not reconciled in the review.');
  if(!sources.some((s:any)=>s.kind==='results'&&validSources.has(s.id)&&time-Date.parse(s.publishedAt)<=150*86400000))warnings.push('No dated primary source for the latest results was cited.');
  if(!sources.some((s:any)=>s.kind==='annual_report'&&validSources.has(s.id)))warnings.push('No accessible issuer or uploaded annual report was cited.');
  const v=item.valuation,anchor=v&&['maxEntry','baseValue'].every(k=>Number.isFinite(v[k])&&v[k]>0)&&v.maxEntry<=v.baseValue&&v.currency===target.currency&&sentence(v.assumptions)&&backed(v.sourceIds);
  if(!anchor)blockers.push('A source-backed valuation and maximum entry price in the trading currency are required.');
  else if(!v.bearValue||!v.bullValue)warnings.push('The valuation has a supported entry ceiling; a complete bear/bull comparison remains unavailable.');
  if(v&&(v.bearValue>0&&v.bearValue>v.baseValue||v.bullValue>0&&v.baseValue>v.bullValue))blockers.push('The valuation scenario values are inconsistent.');
  if(!item.catalysts.length||!item.risks.length||!item.breakConditions.length)warnings.push('The thesis needs concrete drivers, risks and conditions that would invalidate it.');
  if(target.statementPeriod&&statementPeriod<target.statementPeriod)blockers.push('The review predates the supplied annual statements.');
  const unique=(a:string[])=>[...new Set(a)];return {...item,statementPeriod,policyVersion:'materiality-v3',accountingQuality:quality,documentRefs:uploadedReferences(item.ticker,snapshot),eventFingerprint:snapshot.events?.[item.ticker]?.fingerprint||null,version:1,decision:item.decision==='supported'&&blockers.length?'incomplete':item.decision,areas,annuals,sources,gaps:unique(blockers),blockingReasons:unique(blockers),warnings:unique(warnings),positionCapPct:warnings.length?3:15,researchedAt:new Date(time).toISOString(),expiresAt:new Date(time+REVIEW_LIFETIME_DAYS*86400000).toISOString()};
 });
 if(snapshot.fundamentalPolicy==='investor-v1')for(const target of scope)if(!seen.has(target.ticker))output.push({ticker:target.ticker,version:1,decision:'incomplete',summary:'Company research did not complete this review.',statementPeriod:target.statementPeriod||'',thesis:'The investment case has not been established.',catalysts:[],risks:['The company has not received a complete source-backed review.'],breakConditions:[],sources:[],areas:[],annuals:[],valuation:{currency:target.currency,maxEntry:0,bearValue:0,baseValue:0,bullValue:0,assumptions:'Not assessed.',sourceIds:[]},gaps:['This company was omitted from the completed research batch; it remains on the watchlist.'],researchedAt:new Date(time).toISOString(),expiresAt:new Date(time+REVIEW_LIFETIME_DAYS*86400000).toISOString()});
 return output;
}
