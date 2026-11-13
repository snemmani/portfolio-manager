import assert from 'node:assert/strict';
import {businessModel} from '../lib/business-model';
import {screenScorecard,companyGateIndex,GATE_POLICY} from '../lib/jarvis-gates';
import {recheckCandidate} from '../lib/discovery-review';
import {fundamentalCheck,FUNDAMENTAL_POLICY} from '../lib/fundamental-policy';
import {validateFundamentals} from '../lib/fundamental-contract';
import {buyCeiling,hasUsableBuyCeiling} from '../lib/buy-ceiling';
import {fundamentalFixture,storedFundamental,bindReturnBasis} from './fundamental-fixture.mjs';
const now=Date.parse('2026-11-11T08:00:00Z');
const series=[0,1,2,3].map(i=>({period:`${2026-i}-03-31`,TotalRevenue:2000-i*150,NetIncome:300-i*20,OperatingCashFlow:350-i*20,FreeCashFlow:300-i*20,EBIT:400-i*20,StockholdersEquity:1200,TotalAssets:1800,CurrentAssets:700,CurrentLiabilities:300,TotalDebt:20,InterestExpense:2,OrdinarySharesNumber:10,BasicEPS:(300-i*20)/10}));
const input={ticker:'BSE.NS',market:'IN' as const,financial:true,price:3900,currency:'INR',financialCurrency:'INR',series,sharesOutstanding:10,now};
const exchange=screenScorecard(input);
assert.equal(exchange.businessModel?.kind,'exchange');assert.match(exchange.intrinsic?.method||'',/earnings power/);assert(!exchange.gates.some(g=>g.status==='deferred'),'An exchange must not silently skip accounting and solvency as if it were a lender');
assert.equal(screenScorecard({...input,series:series.map(r=>({...r,StockholdersEquity:r.StockholdersEquity*3}))}).intrinsic?.value,exchange.intrinsic?.value,'Exchange valuation must not be a book-value multiple');
assert.equal(screenScorecard({...input,series:series.map(r=>({...r,OperatingCashFlow:0}))}).gates.find(g=>g.id==='earningsQuality')?.status,'fail','Exchange cash generation is checked');
for(const ticker of ['ICICIAMC.NS','NAM-INDIA.NS','CAMS.NS','CDSL.NS','PYPL']){const sc=screenScorecard({...input,ticker});assert.match(sc.intrinsic?.method||'',/earnings power/);assert(!sc.gates.some(g=>g.status==='deferred'));}
for(const ticker of ['ICICIGI.NS','ABCAPITAL.NS','ARSSBL.NS','TATAINVEST.NS','ARCC']){const sc=screenScorecard({...input,ticker});assert.equal(sc.intrinsic,null);assert.equal(sc.reverseDcf.verdict,'unavailable');assert(sc.gates.some(g=>g.status==='deferred'));assert(!sc.summary.includes('All mandatory checks pass'));}
for(const ticker of ['HDFCBANK.NS','CANFINHOME.NS','PFC.NS','STT']){const sc=screenScorecard({...input,ticker});assert(sc.businessModel?.lender);assert.match(sc.intrinsic?.method||'',/price-to-book/);assert.equal(sc.gates.find(g=>g.id==='solvency')?.status,'deferred');}
const unknown=screenScorecard({...input,ticker:'UNIDENTIFIED.NS'});assert.equal(unknown.status,'watchlist');assert.equal(unknown.intrinsic,null);assert.equal(unknown.businessModel?.kind,'unclassified-financial');
for(let i=0;i<2000;i++)for(const [industry,kind] of [['Banks - Regional','bank'],['Insurance - Life','insurer'],['Asset Management','asset-manager'],['Capital Markets','broker'],['Financial Data & Stock Exchanges','exchange']]){
 const model=businessModel({ticker:'SYNTH'+i,sector:'Financials',industry});assert.equal(model.kind,kind);assert.equal(model.lender,kind==='bank','Sector never grants a lender model to other business types');
}
const ticker='BSE.NS',model=businessModel({ticker}),r:any=storedFundamental(ticker,'INR',1000);r.policyVersion='materiality-v3';r.blockingReasons=[];
const policy:any={fundamentalPolicy:FUNDAMENTAL_POLICY,fundamentalReviews:{[ticker]:r},companyGates:{[ticker]:{financial:false,businessModel:model,intrinsic:exchange.intrinsic}}};
assert.equal(fundamentalCheck(policy,ticker,900).status,'stale','An old lender-era review cannot approve the corrected model');
r.businessModelKey=model.reviewKey;bindReturnBasis(r,exchange.intrinsic);
let checked=fundamentalCheck(policy,ticker,900);assert.equal(checked.status,'return','Correct classification still cannot bypass the new five-year return hurdle');assert(hasUsableBuyCeiling(checked));
const prior=structuredClone(r);r.areas=r.areas.filter((a:any)=>a.area!=='sector_checks');checked=fundamentalCheck(policy,ticker,900);assert.equal(checked.status,'incomplete');assert(!hasUsableBuyCeiling(checked),'A positive provisional value is not an approved ceiling');
assert.equal(buyCeiling(null,exchange.intrinsic).ceiling,null);
const raw:any=fundamentalFixture(ticker),sourceChecks=raw.sources.map((s:any)=>({ticker,url:s.url,reachable:true}));
const snapshot:any={fundamentalPolicy:FUNDAMENTAL_POLICY,fundamentalScope:[{ticker,currency:'INR',statementPeriod:raw.statementPeriod,businessModel:model}],fundamentalProfiles:{[ticker]:{website:'https://issuer.example'}}};
const valid=validateFundamentals([raw],snapshot,sourceChecks)[0];assert.equal(valid.businessModelKey,model.reviewKey);assert.equal(valid.decision,'supported');
delete snapshot.fundamentalScope[0].businessModel;const late=validateFundamentals([raw],snapshot,sourceChecks)[0];assert.equal(late.decision,'incomplete');assert.equal(late.businessModelKey,null,'An old in-flight draft cannot stamp itself as reviewed under the new model');
const cached={ticker,sector:'Financials',status:'eligible',screenPolicy:'jarvis-gates-v1',scorecard:{policy:'jarvis-gates-v1',intrinsic:{value:467.43}}};
const stale=recheckCandidate(cached,true);assert.equal(stale.status,'watchlist');assert.equal(stale.scorecard.intrinsic,null);
const retained=recheckCandidate({...cached,screenRefreshPending:true,annualSeries:series,metrics:{financialCurrency:'INR'},market:'IN',currency:'INR',price:3900},true);assert.equal(retained.status,'watchlist');assert.match(retained.scorecard.intrinsic?.method||'',/earnings power/);
assert.equal(companyGateIndex([], [{ticker,sector:'Financials',scorecard:exchange}])[ticker].financial,false);
assert.equal(exchange.policy,GATE_POLICY);assert.equal(prior.businessModelKey,model.reviewKey);
console.log('PASS: 10,000 industry classifications, exchange cash-flow and book-value invariants, bank/BDC/custody exceptions, specialised models, old-review invalidation, late-draft rejection, mandatory sector evidence and safe cached-screen upgrades.');
