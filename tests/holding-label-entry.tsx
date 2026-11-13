import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {HoldingsGrid} from '../components/terminal/holdings-grid';
import HoldingDrawer from '../components/dashboard/holding-drawer';
import {withHoldingSteps} from '../lib/holding-steps';
import {storedFundamental} from './fundamental-fixture.mjs';
export function renderCases(){
 const company=(ticker:string)=>({ticker,portfolio:'Test',action:'Add candidate',currency:'INR',price:200,avg:100,value:2000,shares:10,weight:5,quote:{stale:false,history:[]},fundamentals:{date:'2026-03-31'},reasons:[]});
 const names=['MISSING.NS','EVIDENCE.NS','VALUE.NS','WAIT.NS'],holdings=names.map(company),reviews:any={};
 for(const ticker of names.slice(1)){const r:any=storedFundamental(ticker,'INR',150);r.policyVersion='materiality-v3';r.blockingReasons=ticker==='EVIDENCE.NS'?['Annual-report evidence is missing.']:ticker==='VALUE.NS'?['A supported valuation and maximum entry price are missing.']:[];if(r.blockingReasons.length)r.decision='incomplete';reviews[ticker]=r;}
 const snapshot=withHoldingSteps({holdings,portfolios:[{name:'Test',complete:true}]},{fundamentalPolicy:'investor-v1',fundamentalReviews:reviews,events:{},annualDocumentsAvailable:true});
 return {grid:renderToStaticMarkup(<HoldingsGrid holdings={snapshot.holdings} onSelect={()=>{}}/>),drawer:renderToStaticMarkup(<HoldingDrawer selected={snapshot.holdings[3]} setSelected={()=>{}} showExecution={()=>{}}/>)};
}
