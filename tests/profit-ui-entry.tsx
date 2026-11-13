import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import RecommendationsView from '../components/dashboard/recommendations';
import SaleImpact from '../components/sale-impact';
import {decorateTrades,DEFAULT_TRADE_POLICY as policy} from '../lib/trade-policy';
import {saleAssessment} from '../lib/sale-assessment';
export function renderCases(){
 const realNow=Date.now;Date.now=()=>Date.parse('2026-11-11T08:00:00Z');
 try{
  const p={name:'Ishaan',value:100000,cash:10000,complete:true};
  const h={portfolio:p.name,ticker:'TANLA.NS',currency:'INR',shares:50,avg:100,price:126,value:6300,fx:1,lots:[{shares:50,cost:100,date:'2025-01-01'}],lastBuy:'2025-01-01',lastSell:'2026-11-03',lastSalePrice:130,historyKey:'original',action:'Add candidate',reasons:['Financial checks pass.'],quote:{stale:false},risks:[]};
  const snap=decorateTrades({holdings:[h],portfolios:[p],tradeHistory:[h]},policy),held=snap.holdings[0];
  const assessment=saleAssessment({...held,action:'Profit review'},p,{price:126,rsi14:80,sma20:100,atr14:4},policy);
  return {decisions:renderToStaticMarkup(<RecommendationsView data={snap} portfolio="All portfolios" navigate={()=>{}} setSelected={()=>{}} showExecution={()=>{}}/>),sale:renderToStaticMarkup(<SaleImpact assessment={assessment} ticker={h.ticker} portfolio={p.name}/>)};
 }finally{Date.now=realNow}
}
