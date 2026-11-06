import assert from 'node:assert/strict';
import {screenScorecard,multiYear,intrinsicValue,reverseDcf,classifyEventIssues,convictionCap,companyGateIndex,compactScorecard,THRESHOLDS,type AnnualRow} from '../lib/jarvis-gates';
import {holdingDecision,assess,RULES} from '../lib/engine';
import {applyScreenGates} from '../lib/discovery-review';

// A healthy, steadily growing company: four fiscal years, newest first.
const year=(y:number,scale:number):AnnualRow=>({period:`${y}-03-31`,TotalRevenue:1000*scale,NetIncome:150*scale,EBIT:220*scale,InterestExpense:10*scale,OperatingCashFlow:170*scale,FreeCashFlow:120*scale,TotalAssets:1500*scale,CurrentAssets:600*scale,CurrentLiabilities:300*scale,RetainedEarnings:700*scale,TotalLiabilitiesNetMinorityInterest:500*scale,AccountsReceivable:150*scale,CostOfRevenue:550*scale,NetPPE:500*scale,DepreciationAndAmortization:40*scale,SellingGeneralAndAdministration:150*scale,TotalDebt:200*scale,StockholdersEquity:1000*scale,DilutedEPS:15*scale,OrdinarySharesNumber:10});
const healthy=[year(2026,1.33),year(2025,1.21),year(2024,1.1),year(2023,1)];
const now=Date.parse('2026-09-01T00:00:00Z');
const base={ticker:'GOOD.NS',market:'IN' as const,financial:false,price:200,currency:'INR',financialCurrency:'INR',series:healthy,marketCap:2000,now};

// 1. All mandatory gates pass, no warnings → eligible with the normal position target.
let sc=screenScorecard(base);
assert.equal(sc.status,'eligible',sc.summary);assert.equal(sc.warningCount,0,JSON.stringify(sc.warnings));
assert.deepEqual(sc.gates.map(g=>g.status),['pass','pass','pass','pass']);
assert(sc.metrics.roceMedian!>12&&sc.metrics.cashConversionCumulative!>1&&sc.metrics.altmanZ!>3);
assert(sc.intrinsic&&sc.intrinsic.value>0,'Code valuation is produced');
assert.equal(convictionCap(0),15);assert.equal(convictionCap(1),3);assert.equal(convictionCap(2),3);assert.equal(convictionCap(3),0);

// 2. A single bad year is a warning, not a rejection (the old hard reject).
const dip=structuredClone(healthy);dip[0].NetIncome=100;dip[0].OperatingCashFlow=150;
sc=screenScorecard({...base,series:dip});
assert.equal(sc.status,'eligible',sc.summary);assert(sc.warnings.some(w=>w.id==='earnings-decline'));
// Forward EPS and analyst rating are warnings too.
sc=screenScorecard({...base,epsTtm:20,epsForward:15,analystRating:3.6});
assert.equal(sc.status,'eligible');assert.equal(sc.warningCount,2);
// Three warnings → watchlist, never rejected.
sc=screenScorecard({...base,series:dip,epsTtm:20,epsForward:15,analystRating:3.6});
assert.equal(sc.status,'watchlist');assert(sc.warningCount>=THRESHOLDS.watchlistWarnings);

// 3. Each mandatory gate fails on its own evidence.
const levered=structuredClone(healthy);levered[0].TotalDebt=1500;
assert.equal(screenScorecard({...base,series:levered}).gates.find(g=>g.id==='solvency')!.status,'fail','D/E above 1 fails solvency');
const coverage=structuredClone(healthy);coverage[0].InterestExpense=100;coverage[0].TotalDebt=900;
assert.equal(screenScorecard({...base,series:coverage}).gates.find(g=>g.id==='solvency')!.status,'fail','Interest cover below 3× fails solvency');
const distressed=structuredClone(healthy);Object.assign(distressed[0],{RetainedEarnings:-900,CurrentAssets:200,CurrentLiabilities:400,EBIT:30,TotalLiabilitiesNetMinorityInterest:1400,TotalDebt:300,InterestExpense:5});
sc=screenScorecard({...base,series:distressed,marketCap:200});
assert.equal(sc.gates.find(g=>g.id==='solvency')!.status,'fail','Altman distress fails solvency');assert(sc.severe.length,'Altman distress is a severe signal');
const cashPoor=structuredClone(healthy);for(const r of cashPoor)r.OperatingCashFlow=60*(r.NetIncome as number)/150;
assert.equal(screenScorecard({...base,series:cashPoor}).gates.find(g=>g.id==='earningsQuality')!.status,'fail','3-year cash conversion below 70% fails');
const lowReturn=structuredClone(healthy);for(const r of lowReturn)r.EBIT=(r.EBIT as number)*0.4;
sc=screenScorecard({...base,series:lowReturn});
assert.equal(sc.gates.find(g=>g.id==='returnOnCapital')!.status,'fail');assert.equal(sc.status,'rejected');

// 4. Missing mandatory evidence is "unknown" (watchlist, evidence needed), never a pass.
const noDebt=structuredClone(healthy);for(const r of noDebt){delete r.TotalDebt;r.TotalLiabilitiesNetMinorityInterest=900*(r.NetIncome as number)/150;}
assert.equal(screenScorecard({...base,series:noDebt}).gates.find(g=>g.id==='solvency')!.status,'unknown');
const lowLiabilities=structuredClone(healthy);for(const r of lowLiabilities)delete r.TotalDebt;
assert.equal(screenScorecard({...base,series:lowLiabilities}).gates.find(g=>g.id==='solvency')!.status,'pass','Liabilities below half of assets imply D/E < 1');
sc=screenScorecard({...base,series:[]});assert.equal(sc.status,'watchlist');assert(sc.gates.some(g=>g.status==='unknown'));
sc=screenScorecard({...base,price:null});assert.notEqual(sc.status,'eligible');
sc=screenScorecard({...base,financialCurrency:'USD'});assert.equal(sc.gates[0].status,'fail','Statement currency mismatch without a rate');
sc=screenScorecard({...base,financialCurrency:'USD',statementRate:80});assert.equal(sc.gates[0].status,'pass');assert(sc.intrinsic!.value>screenScorecard(base).intrinsic!.value*70,'Converted per-share value');
sc=screenScorecard({...base,financialCurrency:'USD',statementRate:80,epsTtm:20});assert(sc.warnings.some(w=>w.id==='currency-label'),'Rupee statements mislabelled as USD are detected');assert(Math.abs(sc.intrinsic!.value-screenScorecard(base).intrinsic!.value)<1e-6);
const stale=structuredClone(healthy).map(r=>({...r,period:r.period.replace('2026','2024').replace('2025','2023').replace('2024','2022').replace('2023','2021')}));
assert.equal(screenScorecard({...base,series:stale}).gates[0].status,'fail','Statements older than 18 months');

// 5. Beneish: an elevated M-score blocks only when accruals or receivables corroborate it.
const accrual=structuredClone(healthy);Object.assign(accrual[0],{AccountsReceivable:500,TotalRevenue:1600,OperatingCashFlow:60,NetIncome:260});
sc=screenScorecard({...base,series:accrual});
assert(sc.metrics.beneishM!>THRESHOLDS.beneishFlag);assert.equal(sc.gates.find(g=>g.id==='earningsQuality')!.status,'fail');assert(sc.severe.some(s=>s.includes('Beneish')));

// 6. Lenders: solvency/earnings quality come from research; ROA ≥ 1% passes when equity looks inflated.
const bank=[0,1,2,3].map(i=>({period:`${2026-i}-03-31`,TotalRevenue:1000,NetIncome:140,TotalAssets:10000,StockholdersEquity:1600,OrdinarySharesNumber:10,DilutedEPS:14}));
sc=screenScorecard({...base,ticker:'BANK.NS',financial:true,series:bank,marketCap:3000});
assert.equal(sc.gates.find(g=>g.id==='solvency')!.status,'deferred');assert.equal(sc.gates.find(g=>g.id==='returnOnCapital')!.status,'pass','ROA 1.4% passes despite ROE 8.75%');
assert.equal(sc.intrinsic?.binding,false,'Code value is indicative when ROE looks distorted');
assert.equal(screenScorecard({...base,financial:true,series:bank.map(r=>({...r,NetIncome:60}))}).gates.find(g=>g.id==='returnOnCapital')!.status,'fail');

// 7. Valuation: conservative and monotonic in growth.
const m=multiYear(healthy,2000);
const slow=intrinsicValue({...m,revenueCagr:2,earningsCagr:2},'IN',false)!,fast=intrinsicValue({...m,revenueCagr:14,earningsCagr:14},'IN',false)!;
assert(fast.value>slow.value);assert.equal(intrinsicValue({...m,eps:-1},'IN',false),null,'No value from losses');
assert(intrinsicValue({...m,revenueCagr:60,earningsCagr:60},'IN',false)!.inputs.startGrowthPct<=15,'Growth is capped');

// 7b. Reverse DCF: consistent with the forward valuation and monotonic in price.
{const sc0=screenScorecard(base),iv=sc0.intrinsic!.value,m0=sc0.metrics;
 const atValue=reverseDcf(m0,'IN',false,iv);const hist=Math.min(m0.revenueCagr!,m0.earningsCagr!);
 assert(Math.abs(atValue.impliedGrowthPct!-Math.min(15,hist))<0.2,'At the code value, implied growth equals the model\'s starting growth');
 const cheap=reverseDcf(m0,'IN',false,iv*0.6),dear=reverseDcf(m0,'IN',false,iv*2.5);
 assert(cheap.impliedGrowthPct!<atValue.impliedGrowthPct!&&dear.impliedGrowthPct!>atValue.impliedGrowthPct!);
 assert.equal(cheap.verdict,'undemanding');assert(['demanding','unrealistic'].includes(dear.verdict));
 assert.equal(reverseDcf({...m0,roceMedian:9},'IN',false,iv).verdict,'value-destroying','Growth cannot justify a price when ROCE is below the discount rate');
 assert.equal(reverseDcf({...m0,eps:-1},'IN',false,iv).verdict,'unavailable');
 assert.equal(sc0.reverseDcf.verdict,reverseDcf(m0,'IN',false,base.price).verdict,'The scorecard carries the reverse DCF at the current price');
 // Lenders: perpetual growth from P/B, judged against long-run growth; below book with high ROE = shrinkage priced in.
 const lender={...m0,roeMedian:18,bookPerShare:100};
 assert.equal(reverseDcf(lender,'IN',true,90).verdict,'undemanding');assert.equal(reverseDcf(lender,'IN',true,120).verdict,'undemanding');
 assert.equal(reverseDcf(lender,'IN',true,400).verdict,'demanding');assert.equal(reverseDcf(lender,'IN',true,600).verdict,'unrealistic');assert(reverseDcf(lender,'IN',true,200).impliedGrowthPct!>reverseDcf(lender,'IN',true,150).impliedGrowthPct!);}

// 8. Event classification: serious red flags vs warnings.
const ev=classifyEventIssues(['Results expected within 14 days: 2026-11-10','Ex-dividend event within 7 days: 2026-11-03','Possible material news: Buy, Sell, or Hold? Top Upgrades and Downgrades','Possible material news: SEBI bars promoters after forensic audit','Possible material news: Auditor resigns citing governance lapses','Possible material news: Company defaults on bond payment']);
assert.equal(ev.serious.length,3);assert.deepEqual(ev.warnings.map(w=>w.id).sort(),['dividend','headlines','results-soon']);
assert.equal(ev.warnings.find(w=>w.id==='dividend')!.weight,0,'Ex-dividend dates do not count');

// 9. Holdings: a mandatory failure stops additions; exit review only for severe signals.
const reasons:string[]=[],risks:string[]=[];
assert.equal(holdingDecision({weight:5},screenScorecard({...base,series:levered}),reasons,risks).action,'Watch');
assert.equal(holdingDecision({weight:5},screenScorecard({...base,series:lowReturn}),[],[]).action,'Hold');
assert.equal(holdingDecision({weight:5},screenScorecard({...base,series:distressed,marketCap:200}),[],[]).action,'Exit review');
assert.equal(holdingDecision({weight:5,recent:true},screenScorecard({...base,series:distressed,marketCap:200}),[],[]).action,'Watch');
assert.equal(holdingDecision({weight:5},screenScorecard(base),[],[]).action,'Add candidate');
assert.equal(holdingDecision({weight:16},screenScorecard(base),[],[]).action,'Hold','Inside the 15–17% band: no trim, no additions');
// Trim triggers only above 17% and sizes back to 15%.
const p={name:'P',value:100000,complete:true},h={ticker:'GOOD.NS',portfolio:'P',price:200,fx:1,shares:90,value:18000,weight:18,sector:'Technology',currency:'INR',quote:{stale:false}};
const f:any={date:'2026-03-31',currency:'INR',fresh:true,roe:15,revenueGrowth:10,earningsGrowth:10,cashConversion:1.1,debtEquity:0.2,fcf:1,eps:20,bookPerShare:100,pe:10,pb:2,peg:1,series:healthy,shares:10};
let a=assess(h,p,f);assert.equal(a.action,'Trim');assert.equal(a.quantity,15,'Trim back to 15% (3,000 / 200)');
a=assess({...h,weight:16.5,value:16500},p,f);assert.equal(a.action,'Hold');assert.equal(RULES.trimTrigger,17);
assert(a.scorecard&&!('series' in (a.fundamentals||{})&&a.fundamentals.series),'Holdings carry the compact scorecard, not raw statements');

// 10. Candidates use the gates whenever statements are attached; the company index feeds research.
const cand:any={ticker:'NEW.NS',market:'IN',sector:'Technology',currency:'INR',price:200,status:'rejected',metrics:{financialCurrency:'INR',marketCap:2000,revenue_growth_yoy:-3},annualSeries:dip,matchedScreens:[]};
const gated=applyScreenGates(cand);assert.notEqual(gated.status,'rejected','Python single-year rejections are re-decided by the gates');assert(gated.scorecard.gates.length===4);
const index=companyGateIndex([gated],[{ticker:'HELD.NS',sector:'Financials',scorecard:compactScorecard(screenScorecard({...base,financial:true,series:bank}))}]);
assert(index['NEW.NS']&&index['HELD.NS'].financial===true);
console.log('PASS: Jarvis mandatory gates (integrity, solvency, earnings quality, return on capital), warnings and conviction caps, unknown-evidence handling, currency conversion, corroborated Beneish, lender ROA test, conservative valuation, serious-event classification, holding decisions and the 17% trim band.');
