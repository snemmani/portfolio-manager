import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import CashResearchQueue from '../components/cash-research-queue';
import FundamentalResearch from '../components/fundamental-research';
import PurchaseCard from '../components/purchase-card';
import {JarvisScorecard} from '../components/dashboard/scorecard';
import {storedFundamental,bindReturnBasis} from './fundamental-fixture.mjs';
export function renderCases(){
 const ticker='HERO.NS',r:any=storedFundamental(ticker,'INR',4400);r.policyVersion='materiality-v3';r.blockingReasons=[];r.warnings=[];
 const c={ticker,status:'eligible',market:'IN',currency:'INR',price:5410.5,metrics:{statementDate:r.statementPeriod},scorecard:{gates:[{id:'solvency',label:'Solvency',status:'pass',detail:'Verified'}],warnings:[],metrics:{},intrinsic:{value:4293.31,currency:'INR',inputs:{earningsPerShare:200,startGrowthPct:15,terminalGrowthPct:5,discountPct:12,rocePct:30}},status:'eligible'}};
 bindReturnBasis(r,c.scorecard.intrinsic);
 const discovery:any={fundamentalPolicy:'investor-v1',fundamentalReviews:{[ticker]:r},companyGates:{[ticker]:{intrinsic:c.scorecard.intrinsic,warningCount:0,severe:[]}},candidates:[c]},portfolio={name:'Test',cash:50000,value:500000,complete:true};
 return {purchase:renderToStaticMarkup(<PurchaseCard allocation={{ticker,quantity:3,price:4000,currency:'INR',amount:12000,isNew:true}} portfolio={portfolio} holdings={[]} discovery={discovery} budget="50000"/>),watch:renderToStaticMarkup(<CashResearchQueue data={{portfolios:[portfolio],holdings:[],fx:85}} discovery={discovery} portfolio={portfolio} market="India" budget={50000} onPrice={()=>{}}/>),research:renderToStaticMarkup(<FundamentalResearch discovery={discovery} holdings={[]} portfolio="Test" market="India"/>),band:renderToStaticMarkup(<JarvisScorecard scorecard={c.scorecard} price={5410.5} currency="INR" research={r}/>)};
}
