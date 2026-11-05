import assert from 'node:assert/strict';
import {cashResearchCandidates} from '../lib/cash-research';
import {fundamentalScope} from '../lib/fundamental-store';
import {mergeSavedRecommendations,validateRecommendations,researchPrompt} from '../lib/runner-contract';
import {discoveryCoverage} from '../lib/discovery-review';
const c=(ticker:string,price=100,currency='INR')=>({ticker,name:ticker,currency,price,status:'eligible',market:currency==='INR'?'IN':'US',metrics:{cash_conversion_ratio:1.2,roce:25,debtEquity:.1,pe_ttm:15,revenue_growth_yoy:20}});
const snap:any={asOf:new Date().toISOString(),fx:85,holdings:[{ticker:'HELD.NS',portfolio:'Test',currency:'INR',value:4000}],portfolios:[{name:'Test',cash:2000,value:10000,complete:true}],fundamentalPolicy:'investor-v1'};
const d={candidates:[c('TOOEXPENSIVE.NS',1000),c('NEW.NS'),c('OLD.NS'),c('US',10,'USD')]},old={version:1,decision:'incomplete',researchedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString()};
const candidates=cashResearchCandidates(snap,d,{'OLD.NS':old},{portfolio:'Test',market:'India',budget:1000});assert.deepEqual(candidates.map((c:any)=>c.ticker),['OLD.NS','NEW.NS']);assert(candidates.every((c:any)=>c.affordableFor.includes('Test')));
const scope=fundamentalScope(snap,d,{'OLD.NS':old},undefined,2,[],{intent:'deploy-cash',portfolio:'Test',market:'India',budget:1000});assert.deepEqual(scope.map(s=>s.ticker),['OLD.NS','NEW.NS']);
const focus=fundamentalScope(snap,d,{},'HELD.NS',1);assert.equal(focus[0].ticker,'HELD.NS');
const fresh:any={...old,policyVersion:'materiality-v2'};assert(!cashResearchCandidates(snap,d,{'OLD.NS':fresh},{portfolio:'Test',market:'India'}).find((c:any)=>c.ticker==='OLD.NS')?.researchDue,'A completed recent attempt is not repeated automatically all day');
const ideas=d.candidates.map(c=>({portfolio:'Test',ticker:c.ticker,decision:'watch',fundamentalStatus:c.ticker==='OLD.NS'?'incomplete':'missing'}));const coverage=discoveryCoverage(d.candidates,'Test',ideas);assert.equal(coverage.pending,4);assert.equal(coverage.reviewed,0,'Rules-generated watch records are not completed investment decisions');
const prior=[{portfolio:'Test',ticker:'HELD.NS',action:'hold',reasons:['Strong cash generation.']}],other={portfolio:'Test',ticker:'OTHER.NS',currency:'INR'};
const merged=mergeSavedRecommendations(prior,[{portfolio:'Test',ticker:'OTHER.NS',action:'trim'}],[...snap.holdings,other],[{ticker:'OTHER.NS'}]);assert.equal(merged.find(r=>r.ticker==='HELD.NS')?.action,'hold');
const raw={summary:'Scoped company decision.',recommendations:[],evidence_gaps:[],new_stock_ideas:[],fundamental_reviews:[]};const scoped={...snap,fundamentalScope:[{ticker:'NEW.NS',currency:'INR'}]};assert.equal(validateRecommendations(raw,scoped).recommendations.length,0,'A new-company review must not invent review requests for other holdings');
const prompt=researchPrompt({...scoped,fundamentalProfiles:{},discovery:d});assert(prompt.includes('read_public_document'));assert(!prompt.includes('Parts A'));assert(!prompt.includes('REQUIRED OUTPUT STRUCTURE'));assert(prompt.length<16000);assert(prompt.includes('Perform the valuation yourself'));
console.log('PASS: portfolio/market/whole-share affordability, ranked cash research, obsolete-review repair, focused preservation, honest pending counts, no unrelated placeholder reviews and a concise non-conflicting mandate.');

assert.equal(cashResearchCandidates(snap,{candidates:[c('FOURPCT.NS',450)]},{},{portfolio:'Test',market:'India'}).length,1,'Research can consider an affordable clean 5% entry; the smaller warning cap is applied after assessment.');

const rejected={...fresh,decision:'reject',researchedAt:new Date(Date.now()-3*86400000).toISOString()};assert(!cashResearchCandidates(snap,d,{'OLD.NS':rejected},{portfolio:'Test',market:'India'}).find((c:any)=>c.ticker==='OLD.NS')?.researchDue,'A still-current evidence-based rejection is not repeated every day.');
const changedEvent={ok:true,issues:['Material event changed'],fingerprint:'new'};assert(cashResearchCandidates(snap,{...d,events:{'OLD.NS':changedEvent}},{'OLD.NS':{...fresh,eventFingerprint:'old'}},{portfolio:'Test',market:'India'}).find((c:any)=>c.ticker==='OLD.NS')?.researchDue,'Material event changes reprioritise even recent research.');
