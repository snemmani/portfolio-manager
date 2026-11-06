import assert from 'node:assert/strict';
import {fundamentalCheck,FUNDAMENTAL_POLICY} from '../lib/fundamental-policy';
import {validateFundamentals,primarySource,publicSourceUrl} from '../lib/fundamental-contract';
import {fundamentalScope} from '../lib/fundamental-store';
import {fundamentalFixture,storedFundamental} from './fundamental-fixture.mjs';
const raw=fundamentalFixture(),snapshot={fundamentalPolicy:FUNDAMENTAL_POLICY,fundamentalScope:[{ticker:raw.ticker,currency:'INR',statementPeriod:raw.statementPeriod}],fundamentalProfiles:{[raw.ticker]:{website:'https://issuer.example'}}};
const checks=raw.sources.map(s=>({ticker:raw.ticker,url:s.url,reachable:true}));
const record=validateFundamentals([raw],snapshot,checks)[0];assert.equal(record.decision,'supported');
let policy={fundamentalPolicy:FUNDAMENTAL_POLICY,fundamentalReviews:{[raw.ticker]:record}};
assert(fundamentalCheck(policy,raw.ticker,149).clear);assert.equal(fundamentalCheck(policy,raw.ticker,151).status,'valuation');assert.equal(fundamentalCheck(policy,'UNKNOWN').status,'missing');
assert.equal(fundamentalCheck(policy,raw.ticker,100,'2099-03-31').status,'stale');assert.equal(fundamentalCheck(policy,raw.ticker,100,null,Date.now()+31*86400000).status,"supported","Reviews no longer expire on a 30-day clock");assert.equal(fundamentalCheck(policy,raw.ticker,100,null,Date.now()+101*86400000).status,"stale","100-day backstop expiry");
assert.equal(validateFundamentals([raw],snapshot,[])[0].decision,'incomplete','A model cannot self-certify source availability');
// materiality-v3: mandatory research items still block…
for(const mutate of [(v:any)=>v.valuation.currency='USD',(v:any)=>v.valuation.maxEntry=999,(v:any)=>v.areas[0].sourceIds=['made-up-source'],(v:any)=>v.accountingQuality='serious_red_flag',(v:any)=>{const a=v.areas.find((a:any)=>a.area==='balance_sheet');a.status='concern';a.materiality='blocking';}]){
 const item=structuredClone(raw);mutate(item);assert.equal(validateFundamentals([item],snapshot,checks)[0].decision,'incomplete');
}
// …while evidence gaps the multi-year scorecard already covers become warnings.
for(const mutate of [(v:any)=>v.areas=v.areas.filter((a:any)=>a.area!=='accounting'),(v:any)=>v.annuals.pop(),(v:any)=>v.annuals[0].period=v.annuals[1].period,(v:any)=>v.sources[1].publishedAt='2000-01-01',(v:any)=>v.annuals[1].currency='USD',(v:any)=>v.accountingQuality='unverified']){
 const item=structuredClone(raw);mutate(item);const r=validateFundamentals([item],snapshot,checks)[0];assert.equal(r.decision,'supported',JSON.stringify(r.blockingReasons));assert(r.warnings.length,'The gap is reported as a warning');
}
assert.equal(validateFundamentals([],snapshot)[0].decision,'incomplete','Missing reviews stay explicit without inventing an investment case');
assert(primarySource('https://www.sec.gov/Archives/a',{}));assert(primarySource('https://ir.issuer.example/report',snapshot.fundamentalProfiles[raw.ticker]));assert(!primarySource('https://issuer.example.attacker.test/report',snapshot.fundamentalProfiles[raw.ticker]));
for(const u of ['http://issuer.example','https://127.0.0.1','https://[::1]/','https://issuer.example:8080/','https://user:pass@issuer.example'])assert.equal(publicSourceUrl(u),null);
const scope=fundamentalScope({holdings:[{ticker:'HELD',currency:'USD',value:1000},{ticker:'OTHER',currency:'USD',value:500}]},{candidates:[{ticker:'NEW',status:'eligible',currency:'USD'},{ticker:'WATCH',status:'watchlist',currency:'USD'}]},{HELD:storedFundamental('HELD','USD')},'NEW');assert.equal(scope[0].ticker,'NEW');assert(!scope.some(s=>s.ticker==='WATCH'));assert.equal(new Set(scope.map(s=>s.ticker)).size,scope.length);
console.log('PASS: investor fundamental gate, source-backed eight-area/five-year validation, explicit missing coverage, expiry/new results, valuation ceiling, currency consistency, issuer boundaries and bounded fair research scope.');

assert(scope.length<=2,'Deep research is bounded separately from the broad numerical screen');

// Real-world evidence is imperfect: optional gaps are warnings, never a hidden veto.
const imperfect:any=structuredClone(raw);imperfect.accountingQuality='clean';imperfect.areas=imperfect.areas.filter((a:any)=>a.area!=='moat');imperfect.annuals=imperfect.annuals.slice(-2);imperfect.warnings=['Peer comparison is limited.'];
const conditional=validateFundamentals([imperfect],snapshot,checks)[0];assert.equal(conditional.decision,'supported');assert(conditional.warnings.length>=2);assert.equal(conditional.positionCapPct,3);assert(fundamentalCheck({...policy,fundamentalReviews:{[raw.ticker]:conditional}},raw.ticker,140).clear);
for(const quality of ['unverified','moderate_concern']){const v={...imperfect,accountingQuality:quality},r=validateFundamentals([v],snapshot,checks)[0];assert.equal(r.decision,'supported','Unverified or moderate accounting is a warning');assert(r.warnings.some((w:string)=>/ccounting/.test(w)));}
assert.equal(validateFundamentals([{...imperfect,accountingQuality:'serious_red_flag'}],snapshot,checks)[0].decision,'incomplete','A serious accounting red flag remains mandatory');
const material:any=structuredClone(imperfect);material.areas.find((a:any)=>a.area==='balance_sheet').status='concern';material.areas.find((a:any)=>a.area==='balance_sheet').materiality='blocking';assert.equal(validateFundamentals([material],snapshot,checks)[0].decision,'incomplete');
const mitigated:any=structuredClone(imperfect);Object.assign(mitigated.areas.find((a:any)=>a.area==='balance_sheet'),{status:'concern',materiality:'warning',mitigation:'Net cash covers the identified current debt; monitor the next maturity disclosure.'});assert.equal(validateFundamentals([mitigated],snapshot,checks)[0].decision,'supported');
const undated:any=structuredClone(raw);undated.sources[0].publishedAt='';undated.sources[0].financialPeriod=raw.statementPeriod;assert.equal(validateFundamentals([undated],snapshot,checks)[0].decision,'supported','Unknown annual-report publication day is not a veto when its reporting period is identified');
const wrongPeriod:any=structuredClone(undated);wrongPeriod.sources[0].financialPeriod='2020-03-31';{const r=validateFundamentals([wrongPeriod],snapshot,checks)[0];assert(r.warnings.some((w:string)=>/annual rows|annual statements/.test(w)),'A historical report cannot reconcile future annual figures; the scorecard is the reference');}
console.log('PASS: mandatory accounting/solvency/valuation, optional warnings, two-year minimum with limited size, explicit materiality, source reporting-period consistency and no fabricated publication dates.');
