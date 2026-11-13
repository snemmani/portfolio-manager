import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {JarvisScorecard} from '../components/dashboard/scorecard';
import {SignalBadge} from '../components/terminal/ui';
import {businessModel} from '../lib/business-model';
import {storedFundamental} from './fundamental-fixture.mjs';
export function renderCases(){
 const model=businessModel({ticker:'BSE.NS'}),scorecard={status:'eligible',businessModel:model,summary:'Initial screen passed.',gates:[{id:'solvency',status:'pass',label:'Solvency',detail:'Debt and interest checked.'}],warnings:[],metrics:{},intrinsic:{value:992.38,currency:'INR',method:'Exchange operator — earnings power',inputs:{earningsPerShare:30,startGrowthPct:15,terminalGrowthPct:5,discountPct:12,rocePct:30}}};
 const r:any=storedFundamental('BSE.NS','INR',1200,scorecard.intrinsic);r.policyVersion='materiality-v3';r.businessModelKey=model.reviewKey;r.blockingReasons=[];
 const incomplete={...r,decision:'incomplete',blockingReasons:['The annual report and valuation evidence could not be verified.']};
 const chart=(context:any,sc:any=scorecard)=>renderToStaticMarkup(<JarvisScorecard scorecard={sc} price={3914.1} currency="INR" research={r} researchContext={context}/>);
 return {missing:renderToStaticMarkup(<JarvisScorecard scorecard={scorecard} price={3914.1} currency="INR"/>),incomplete:renderToStaticMarkup(<JarvisScorecard scorecard={scorecard} price={3914.1} currency="INR" research={incomplete}/>),ready:chart({}),offline:chart({documentPolicy:'annual-reports-v1',annualDocumentsAvailable:false}),changed:chart({documentPolicy:'annual-reports-v1',annualDocuments:[{id:'new',ticker:'BSE.NS',sha256:'new-hash',period:'2026-03-31',addedAt:new Date().toISOString()}]}),newer:chart({}, {...scorecard,metrics:{latestPeriod:'2027-03-31'}}),specialist:renderToStaticMarkup(<JarvisScorecard scorecard={{...scorecard,businessModel:businessModel({ticker:'ICICIGI.NS'}),intrinsic:null}} price={3914.1} currency="INR"/>),badge:renderToStaticMarkup(<SignalBadge action="Add candidate"/>)};
}
