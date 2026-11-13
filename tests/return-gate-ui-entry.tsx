import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {JarvisScorecard} from '../components/dashboard/scorecard';
import {withFinancialAssumptions,storedFundamental,bindReturnBasis} from './fundamental-fixture.mjs';
export function renderReturns(){
 const r:any=storedFundamental('AAA.NS','INR',150);r.policyVersion='materiality-v3';r.blockingReasons=[];r.warnings=[];r.valuation.returnProjection={...r.valuation.returnProjection,year3Value:160,year5Value:200,epsNow:200/60,year5Eps:200/60};withFinancialAssumptions(r);
 const scorecard={status:'eligible',summary:'Numerical screen passes.',gates:[{id:'solvency',label:'Solvency',status:'pass',detail:'Solvency passes.'}],warnings:[],warningCount:0,metrics:{},intrinsic:null};
 const render=(review:any,price=100)=>renderToStaticMarkup(<JarvisScorecard scorecard={scorecard} price={price} currency="INR" research={review}/>);
 const bank={value:834.58,currency:'INR',inputs:{roePct:19.51,growthPct:5,discountPct:12,bookPerShare:402.6}};
 const pfc:any=storedFundamental('PFC.NS','INR',402.6,bank);pfc.valuation.baseValue=443;pfc.valuation.returnProjection=null;
 const bankSc={...scorecard,intrinsic:bank};
 const conflict=renderToStaticMarkup(<JarvisScorecard scorecard={bankSc} price={341.15} currency="INR" research={pfc}/>);
 const resolved=structuredClone(pfc);resolved.valuation.returnProjection={...r.valuation.returnProjection,year3Value:443*1.05**3,year5Value:443*1.05**5,year3BearValue:350,year3BullValue:650,year5BearValue:400,year5BullValue:800};resolved.valuation.returnProjection.asOf=resolved.researchedAt;bindReturnBasis(resolved,bank);resolved.valuation.returnProjection.epsNow=402.6*.1951;resolved.valuation.returnProjection.year5Eps=resolved.valuation.returnProjection.epsNow*1.05**5;resolved.valuation.returnProjection.exitPe=resolved.valuation.returnProjection.year5Value/resolved.valuation.returnProjection.year5Eps;withFinancialAssumptions(resolved,bank);
 return {failed:render(r),passed:render(r,90),missing:render({...r,valuation:{...r.valuation,returnProjection:null}}),conflict,resolved:renderToStaticMarkup(<JarvisScorecard scorecard={bankSc} price={341.15} currency="INR" research={resolved}/>)};
}
