import {businessModel,type BusinessModel} from './business-model';
/**
 * Jarvis investment gates — the single source of truth for what blocks a
 * long-term purchase and what only reduces conviction.
 *
 * Mandatory gates (all must pass before a buy can be proposed):
 *   1. Data integrity        — usable price, matching currencies, recent statements
 *   2. Solvency              — D/E < 1, interest cover > 3, Altman Z > 1.8
 *                              (financials: capital adequacy and bad loans from the research review)
 *   3. Earnings quality      — 3-year operating cash flow ≥ 70% of profit, no serious forensic red flag
 *   4. Return on capital     — median ROCE ≥ 12% over the available years (financials: median ROE)
 *   5. Margin of safety      — price ≤ lower of the code valuation and the researched maximum entry
 *   6. Position/sector caps  — enforced by the allocation engine
 *   7. No serious red flag   — fraud, regulator action, auditor exit, default, pledge invocation…
 *
 * Everything else is a weighted warning. Warnings never block on their own; they
 * reduce the position size: 0 → normal targets, 1–2 → 3% cap, 3 or more → watchlist.
 *
 * A mandatory gate with missing evidence is `unknown`, which blocks like a failure
 * but is reported as "evidence needed" rather than a rejection.
 */

export type GateStatus='pass'|'fail'|'unknown'|'deferred';
export type GateStage='screen'|'research'|'event'|'portfolio';
export type GateId='integrity'|'solvency'|'earningsQuality'|'returnOnCapital'|'marginOfSafety'|'expectedReturn'|'caps'|'redFlags';
export interface Gate{id:GateId;label:string;stage:GateStage;status:GateStatus;detail:string}
export interface GateWarning{id:string;label:string;detail:string;weight:0|1}
export type Market='IN'|'US';
export type AnnualRow={period:string;[field:string]:number|string|null|undefined};

export const GATE_POLICY='jarvis-gates-v2';
export const GATE_LABELS:Record<GateId,string>={
 integrity:'Data integrity',
 solvency:'Solvency',
 earningsQuality:'Earnings quality',
 returnOnCapital:'Return on capital',
 marginOfSafety:'Margin of safety',
 expectedReturn:'Five-year price CAGR ≥15%',
 caps:'Position and sector caps',
 redFlags:'No serious red-flag event',
};
export const THRESHOLDS={
 debtEquityMax:1,
 interestCoverMin:3,
 nearDebtFreeDebtEquity:0.1,
 altmanMin:1.8,
 altmanSafe:3,
 cashConversionMin:0.7,
 cashConversionLatestWarn:0.8,
 roceMin:12,
 roeMinFinancial:12,
 roaMinFinancial:1,
 beneishFlag:-1.78,
 beneishAccruals:0.05,
 beneishReceivables:1.25,
 receivablesGapWarnPct:15,
 statementMaxAgeDays:550,
 watchlistWarnings:3,
 warnedPositionCapPct:3,
 eventCoverageHours:24,
};
/** Valuation assumptions by market (nominal, in the trading currency). */
export const VALUATION={
 IN:{discount:0.12,terminal:0.05,growthCap:0.15},
 US:{discount:0.09,terminal:0.03,growthCap:0.12},
};

const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const round=(v:number,d=2)=>Math.round(v*10**d)/10**d;
const pct=(v:number)=>`${round(v,1)}%`;
const median=(values:number[])=>{if(!values.length)return null;const s=[...values].sort((a,b)=>a-b),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;};

// ---------------------------------------------------------------- statements

/** Statement fields used by the gates (Yahoo annual time-series names). */
export const SERIES_FIELDS=['TotalRevenue','NetIncome','EBIT','InterestExpense','OperatingCashFlow','FreeCashFlow','CapitalExpenditure','TotalAssets','CurrentAssets','CurrentLiabilities','RetainedEarnings','TotalLiabilitiesNetMinorityInterest','AccountsReceivable','CostOfRevenue','GrossProfit','NetPPE','DepreciationAndAmortization','SellingGeneralAndAdministration','LongTermDebt','TotalDebt','StockholdersEquity','DilutedEPS','BasicEPS','OrdinarySharesNumber'] as const;

const field=(row:AnnualRow|undefined,key:string)=>{const v=row?.[key];return finite(v)?v:null;};

/** Newest-first, de-duplicated annual rows that contain at least revenue or profit. */
export function normaliseSeries(series:AnnualRow[]|null|undefined):AnnualRow[]{
 const rows=(series||[]).filter(r=>r&&/^\d{4}-\d{2}-\d{2}/.test(String(r.period))&&(finite(r.TotalRevenue)||finite(r.NetIncome)));
 const seen=new Set<string>();
 return rows.sort((a,b)=>String(b.period).localeCompare(String(a.period))).filter(r=>{const k=String(r.period).slice(0,10);if(seen.has(k))return false;seen.add(k);return true;}).slice(0,5);
}

function cagr(latest:number|null,oldest:number|null,years:number){
 if(latest===null||oldest===null||oldest<=0||latest<=0||years<=0)return null;
 return (Math.pow(latest/oldest,1/years)-1)*100;
}
const yearsBetween=(a:string,b:string)=>Math.max(0,(Date.parse(a)-Date.parse(b))/(365.25*86400000));

export interface MultiYear{
 years:number;latestPeriod:string|null;
 revenueGrowthLatest:number|null;earningsGrowthLatest:number|null;
 revenueCagr:number|null;earningsCagr:number|null;cagrYears:number|null;
 roceYears:number[];roceMedian:number|null;roeYears:number[];roeMedian:number|null;roaYears:number[];roaMedian:number|null;
 cashConversionCumulative:number|null;cashConversionLatest:number|null;cumulativeYears:number;
 debtEquity:number|null;liabilitiesToAssets:number|null;interestCoverage:number|null;interestExpense:number|null;
 altmanZ:number|null;beneishM:number|null;beneishDetail:{dsri:number;tata:number;neutral:string[]}|null;
 receivablesGap:number|null;
 eps:number|null;bookPerShare:number|null;
}

/**
 * @param marketCap market value in the statement currency (Altman Z)
 * @param sharesNow current shares outstanding; per-share values use it because Yahoo's
 *   historical EPS and share counts are not adjusted for later bonus issues or splits.
 */
export function multiYear(seriesInput:AnnualRow[]|null|undefined,marketCap?:number|null,sharesNow?:number|null):MultiYear{
 const s=normaliseSeries(seriesInput),r0=s[0],r1=s[1];
 const growth=(key:string)=>{const a=field(r0,key),b=field(r1,key);return a!==null&&b!==null&&b>0?(a/b-1)*100:null;};
 // Compound growth over the longest available window (up to four years).
 const oldest=s.length>1?s[s.length-1]:undefined,span=oldest&&r0?yearsBetween(String(r0.period),String(oldest.period)):0;
 const revenueCagr=span>=1.5?cagr(field(r0,'TotalRevenue'),field(oldest,'TotalRevenue'),span):null;
 // Net-profit growth is used instead of EPS growth: it is immune to unadjusted bonus issues/splits.
 const earningsCagr=span>=1.5?cagr(field(r0,'NetIncome'),field(oldest,'NetIncome'),span):null;
 const roceYears:number[]=[],roeYears:number[]=[],roaYears:number[]=[];
 for(const row of s){
  const ebit=field(row,'EBIT'),ta=field(row,'TotalAssets'),cl=field(row,'CurrentLiabilities');
  if(ebit!==null&&ta!==null&&cl!==null&&ta-cl>0)roceYears.push(ebit/(ta-cl)*100);
  const ni=field(row,'NetIncome'),eq=field(row,'StockholdersEquity');
  if(ni!==null&&eq!==null&&eq>0)roeYears.push(ni/eq*100);
  if(ni!==null&&ta!==null&&ta>0)roaYears.push(ni/ta*100);
 }
 // Cumulative cash conversion over the latest three years with both values.
 let ocfSum=0,niSum=0,cumulativeYears=0;
 for(const row of s.slice(0,3)){const ocf=field(row,'OperatingCashFlow'),ni=field(row,'NetIncome');if(ocf===null||ni===null)continue;ocfSum+=ocf;niSum+=ni;cumulativeYears++;}
 const latestNi=field(r0,'NetIncome'),latestOcf=field(r0,'OperatingCashFlow');
 const equity=field(r0,'StockholdersEquity'),debt=field(r0,'TotalDebt')??field(r0,'LongTermDebt'),ta=field(r0,'TotalAssets'),tl=field(r0,'TotalLiabilitiesNetMinorityInterest');
 const ebit=field(r0,'EBIT'),interest=field(r0,'InterestExpense');
 // Altman Z (original): 1.2·WC/TA + 1.4·RE/TA + 3.3·EBIT/TA + 0.6·MVE/TL + 1.0·Sales/TA
 const ca=field(r0,'CurrentAssets'),cl=field(r0,'CurrentLiabilities'),re=field(r0,'RetainedEarnings'),rev=field(r0,'TotalRevenue');
 const altmanZ=ta&&ta>0&&tl&&tl>0&&ca!==null&&cl!==null&&re!==null&&ebit!==null&&rev!==null&&finite(marketCap)&&marketCap>0
  ?1.2*(ca-cl)/ta+1.4*re/ta+3.3*ebit/ta+0.6*marketCap/tl+1.0*rev/ta:null;
 const shares=finite(sharesNow)&&sharesNow>0?sharesNow:field(r0,'OrdinarySharesNumber');
 const eps=finite(sharesNow)&&sharesNow>0&&latestNi!==null?latestNi/sharesNow:field(r0,'DilutedEPS')??field(r0,'BasicEPS');
 return {
  years:s.length,latestPeriod:r0?String(r0.period).slice(0,10):null,
  revenueGrowthLatest:growth('TotalRevenue'),earningsGrowthLatest:growth('NetIncome'),
  revenueCagr,earningsCagr,cagrYears:span>=1.5?round(span,1):null,
  roceYears:roceYears.map(v=>round(v)),roceMedian:median(roceYears),roeYears:roeYears.map(v=>round(v)),roeMedian:median(roeYears),roaYears:roaYears.map(v=>round(v)),roaMedian:median(roaYears),
  cashConversionCumulative:cumulativeYears>=2&&niSum>0?ocfSum/niSum:null,
  cashConversionLatest:latestNi!==null&&latestOcf!==null&&latestNi>0?latestOcf/latestNi:null,cumulativeYears,
  debtEquity:debt!==null&&debt>=0&&equity!==null&&equity>0?debt/equity:null,
  liabilitiesToAssets:tl!==null&&ta!==null&&ta>0?tl/ta:null,
  interestCoverage:ebit!==null&&interest!==null&&interest!==0?ebit/Math.abs(interest):null,interestExpense:interest,
  altmanZ,...beneish(r0,r1),
  receivablesGap:receivablesGap(r0,r1),
  eps,bookPerShare:equity!==null&&shares!==null&&shares>0?equity/shares:null,
 };
}

/**
 * Beneish M-score (eight-variable). Gross-margin, depreciation and SG&A indices are
 * set to the neutral value 1 when their inputs are not reported; the receivable,
 * sales-growth, accrual, asset-quality and leverage indices are required.
 */
function beneish(r0?:AnnualRow,r1?:AnnualRow):{beneishM:number|null;beneishDetail:MultiYear['beneishDetail']}{
 const none={beneishM:null,beneishDetail:null};if(!r0||!r1)return none;
 const g=(row:AnnualRow,key:string)=>field(row,key);
 const sales0=g(r0,'TotalRevenue'),sales1=g(r1,'TotalRevenue'),ar0=g(r0,'AccountsReceivable'),ar1=g(r1,'AccountsReceivable');
 const ta0=g(r0,'TotalAssets'),ta1=g(r1,'TotalAssets'),ca0=g(r0,'CurrentAssets'),ca1=g(r1,'CurrentAssets'),ppe0=g(r0,'NetPPE'),ppe1=g(r1,'NetPPE');
 const ni0=g(r0,'NetIncome'),ocf0=g(r0,'OperatingCashFlow'),cl0=g(r0,'CurrentLiabilities'),cl1=g(r1,'CurrentLiabilities');
 const ltd0=g(r0,'LongTermDebt')??g(r0,'TotalDebt'),ltd1=g(r1,'LongTermDebt')??g(r1,'TotalDebt');
 if([sales0,sales1,ar0,ar1,ta0,ta1,ca0,ca1,ppe0,ppe1,ni0,ocf0,cl0,cl1,ltd0,ltd1].some(v=>v===null)||!sales0||!sales1||!ta0||!ta1||ar1===0)return none;
 const neutral:string[]=[];
 const dsri=(ar0!/sales0)/(ar1!/sales1),sgi=sales0/sales1,tata=(ni0!-ocf0!)/ta0;
 const aqDen=1-(ca1!+ppe1!)/ta1,aqi=aqDen!==0?(1-(ca0!+ppe0!)/ta0)/aqDen:1;
 const lvgi=((cl0!+ltd0!)/ta0)/((cl1!+ltd1!)/ta1||1);
 const cogs=(row:AnnualRow)=>g(row,'CostOfRevenue')??(g(row,'GrossProfit')!==null&&g(row,'TotalRevenue')!==null?g(row,'TotalRevenue')!-g(row,'GrossProfit')!:null);
 const c0=cogs(r0),c1=cogs(r1);let gmi=1;
 if(c0!==null&&c1!==null&&(sales0-c0)/sales0!==0)gmi=((sales1-c1)/sales1)/((sales0-c0)/sales0);else neutral.push('gross margin');
 const d0=g(r0,'DepreciationAndAmortization'),d1=g(r1,'DepreciationAndAmortization');let depi=1;
 if(d0!==null&&d1!==null&&d0+ppe0!>0&&d1+ppe1!>0&&d0>0)depi=(d1/(d1+ppe1!))/(d0/(d0+ppe0!));else neutral.push('depreciation');
 const s0=g(r0,'SellingGeneralAndAdministration'),s1=g(r1,'SellingGeneralAndAdministration');let sgai=1;
 if(s0!==null&&s1!==null&&s1>0)sgai=(s0/sales0)/(s1/sales1);else neutral.push('SG&A');
 const m=-4.84+0.92*dsri+0.528*gmi+0.404*aqi+0.892*sgi+0.115*depi-0.172*sgai+4.679*tata-0.327*lvgi;
 return Number.isFinite(m)?{beneishM:round(m),beneishDetail:{dsri:round(dsri),tata:round(tata,3),neutral}}:none;
}

function receivablesGap(r0?:AnnualRow,r1?:AnnualRow){
 const ar0=field(r0,'AccountsReceivable'),ar1=field(r1,'AccountsReceivable'),s0=field(r0,'TotalRevenue'),s1=field(r1,'TotalRevenue');
 if(ar0===null||ar1===null||s0===null||s1===null||ar1<=0||s1<=0)return null;
 return (ar0/ar1-1)*100-(s0/s1-1)*100;
}

// ----------------------------------------------------------------- valuation

export interface Intrinsic{value:number;method:string;inputs:Record<string,number>;currency?:string;
 /** False when the inputs look distorted, so the code value is shown but does not cap the buy price. */
 binding?:boolean;note?:string;
 /** Statement-currency value before FX conversion; identifies the model independent of FX. */
 statementValue?:number;statementCurrency?:string}

/**
 * Conservative code valuation per share, in the statement currency.
 * Operating businesses (including exchanges and fee businesses): ten-year earnings-power model. Growth starts at the lower
 * of revenue and EPS compound growth (capped), fades linearly to the terminal rate,
 * and only the earnings not needed for reinvestment (g / ROCE) are counted.
 * Banks and lenders only: justified price-to-book, (ROE − g) / (r − g) × book value per share.
 */
export function intrinsicValue(m:MultiYear,market:Market,financial:boolean):Intrinsic|null{
 const p=VALUATION[market];
 const hist=[m.revenueCagr,m.earningsCagr].filter(finite);
 const g1=Math.min(p.growthCap,Math.max(0,hist.length?Math.min(...hist)/100:0));
 const gT=Math.min(p.terminal,g1);
 if(financial){
  const roe=m.roeMedian,bvps=m.bookPerShare;if(!finite(roe)||!finite(bvps)||bvps<=0||roe<=0)return null;
  const r=Math.min(roe/100,0.25),g=Math.min(gT,r*0.5);
  const value=bvps*(r-g)/(p.discount-g);
  return value>0?{value:round(value),method:'Justified price-to-book: (ROE − g) / (r − g) × book value per share',inputs:{roePct:round(r*100),growthPct:round(g*100),discountPct:p.discount*100,bookPerShare:round(bvps)}}:null;
 }
 const e0=m.eps,roce=m.roceMedian;if(!finite(e0)||e0<=0||!finite(roce)||roce<=0)return null;
 const rc=Math.min(0.5,Math.max(0.05,roce/100));
 const value=earningsPower(e0,g1,gT,rc,p.discount);
 return value>0?{value:round(value),method:'Two-stage earnings power: growth fades over 10 years; reinvestment = growth ÷ ROCE',inputs:{earningsPerShare:round(e0),startGrowthPct:round(g1*100),terminalGrowthPct:round(gT*100),discountPct:p.discount*100,rocePct:round(rc*100)}}:null;
}

/** Per-share value of earnings growing at g1, fading linearly to gT over ten years, net of reinvestment (g ÷ ROCE). */
function earningsPower(e0:number,g1:number,gT:number,rc:number,discount:number){
 let e=e0,pv=0;
 for(let t=1;t<=10;t++){const g=g1+(gT-g1)*(t-1)/9;e*=1+g;pv+=e*Math.max(0,1-g/rc)/Math.pow(1+discount,t);}
 return pv+e*(1+gT)*Math.max(0,1-gT/rc)/(discount-gT)/Math.pow(1+discount,10);
}

export interface ReverseDcf{
 /** Starting annual growth (fading to the terminal rate over ten years) that today's price requires. */
 impliedGrowthPct:number|null;
 /** Lower of revenue and profit compound growth over the available years. */
 historicalGrowthPct:number|null;
 verdict:'undemanding'|'in-line'|'demanding'|'unrealistic'|'value-destroying'|'unavailable';
 summary:string;
 assumptions:Record<string,number>;
}

/**
 * Reverse DCF: solve the code valuation model for the growth that makes value equal to price.
 * Same discount rate, ten-year fade and reinvestment rule as the forward valuation, so the two
 * views are consistent. Lenders: growth implied by price-to-book, g = (P/B·r − ROE) ÷ (P/B − 1).
 * `price` is in the statement currency.
 */
export function reverseDcf(m:MultiYear,market:Market,financial:boolean,price:number|null):ReverseDcf{
 const p=VALUATION[market],hist=[m.revenueCagr,m.earningsCagr].filter(finite),historical=hist.length?Math.min(...hist):null;
 const none=(summary:string,verdict:ReverseDcf['verdict']='unavailable'):ReverseDcf=>({impliedGrowthPct:null,historicalGrowthPct:historical===null?null:round(historical,1),verdict,summary,assumptions:{discountPct:p.discount*100,terminalGrowthPct:p.terminal*100}});
 if(!finite(price)||price<=0)return none('No usable price.');
 const judge=(implied:number):ReverseDcf=>{
  const h=historical,cap=p.growthCap*100*1.5;
  const verdict=implied>cap?'unrealistic':h===null?'in-line':implied<=h-2?'undemanding':implied<=h+3?'in-line':'demanding';
  const vs=h===null?'':` The company grew ${round(h,1)}% a year over the last ${m.cagrYears??'few'} years.`;
  const text={undemanding:'The price asks for less than the company has delivered.','in-line':'The price assumes roughly the growth already delivered.',demanding:'The price needs faster growth than the company has delivered.',unrealistic:`The price needs more than ${round(cap,0)}% a year for a decade, which few companies sustain.`}[verdict as 'undemanding'];
  return {impliedGrowthPct:round(implied,1),historicalGrowthPct:h===null?null:round(h,1),verdict,summary:`Today's price implies about ${round(implied,1)}% annual growth${financial?' (from price-to-book and ROE)':', fading over ten years'}.${vs} ${text}`,assumptions:{discountPct:p.discount*100,terminalGrowthPct:p.terminal*100}};
 };
 if(financial){
  // Price-to-book implies a perpetual growth rate, so it is judged against long-run growth
  // (the terminal rate), not against recent compound growth.
  const roe=m.roeMedian,bvps=m.bookPerShare;if(!finite(roe)||!finite(bvps)||bvps<=0||roe<=0)return none('Return on equity or book value is unavailable.');
  const r=Math.min(roe/100,0.25),pb=price/bvps,terminal=p.terminal*100,ceiling=(p.discount-0.02)*100;
  // P/B = (ROE − g)/(r − g) only has a solution with g below the discount rate. Above-cost ROE at or
  // under book value means the price assumes shrinkage; below-cost ROE above book can't be justified.
  if(r>p.discount&&pb<=1)return {impliedGrowthPct:null,historicalGrowthPct:historical===null?null:round(historical,1),verdict:'undemanding',summary:`At ${round(pb,2)}× book value with ${round(r*100,1)}% ROE (above the ${p.discount*100}% discount rate), the price assumes the business shrinks.`,assumptions:{discountPct:p.discount*100,terminalGrowthPct:terminal}};
  const g=Math.abs(pb-1)<0.02?r:(pb*p.discount-r)/(pb-1),pct=Math.min(g,p.discount)*100;
  const verdict=pct<=terminal?'undemanding':pct<=terminal+2?'in-line':pct<=ceiling?'demanding':'unrealistic';
  const text={undemanding:'That is at or below long-run economic growth.','in-line':'That is close to long-run economic growth.',demanding:'That is well above long-run economic growth.',unrealistic:'That is close to the discount rate, which no lender sustains forever.'}[verdict];
  return {impliedGrowthPct:round(pct,1),historicalGrowthPct:historical===null?null:round(historical,1),verdict,summary:`At ${round(pb,1)}× book value and ${round(r*100,1)}% ROE, today's price implies ${g>=p.discount?`growth at or above the ${p.discount*100}% discount rate`:`about ${round(pct,1)}% growth a year`} forever. ${text}${r*100<THRESHOLDS.roeMinFinancial?' Reported equity may include subsidiaries, so treat this as indicative.':''}`,assumptions:{discountPct:p.discount*100,terminalGrowthPct:terminal}};
 }
 const e0=m.eps,roce=m.roceMedian;if(!finite(e0)||e0<=0||!finite(roce)||roce<=0)return none('Positive earnings and return on capital are needed.');
 const rc=Math.min(0.5,Math.max(0.05,roce/100));
 const value=(g:number)=>earningsPower(e0,g,Math.min(p.terminal,Math.max(0,g)),rc,p.discount);
 // Growth only adds value when returns exceed the discount rate.
 if(rc<=p.discount)return none(`Return on capital (${round(rc*100,1)}%) does not exceed the ${p.discount*100}% discount rate, so growth adds no value and no growth rate can justify a higher price.`,'value-destroying');
 let lo=-0.1,hi=0.6;
 if(value(hi)<price)return judge(60.1);
 if(value(lo)>price)return judge(-10);
 for(let i=0;i<60;i++){const mid=(lo+hi)/2;if(value(mid)<price)lo=mid;else hi=mid;}
 return judge(((lo+hi)/2)*100);
}

// -------------------------------------------------------------- screen stage

export interface ScreenInput{
 ticker:string;market:Market;financial:boolean;sector?:string;industry?:string;
 price:number|null;quoteTime?:number|null;currency?:string|null;financialCurrency?:string|null;
 series?:AnnualRow[]|null;marketCap?:number|null;
 /** Multiplier from statement currency to trading currency when they differ (e.g. USD statements for an NSE listing). */
 statementRate?:number|null;
 /** Current shares outstanding (market cap ÷ price). */
 sharesOutstanding?:number|null;
 epsTtm?:number|null;epsForward?:number|null;peTtm?:number|null;peForward?:number|null;
 analystRating?:number|null;
 /** Jarvis bucket thresholds this stock matched (discovery only). */
 matchedScreens?:{bucket:string;criteria:string}[];
 /** Single-period metrics used by the bucket thresholds. */
 bucketMetrics?:Record<string,number|null|undefined>;
 now?:number;
}
export interface Scorecard{
 policy:typeof GATE_POLICY;
 /** Raw annual statement figures (statement currency, absolute units), newest first, for report cross-checks. */
 statements?:{currency:string;rows:{period:string;revenue:number|null;netIncome:number|null;operatingCashFlow:number|null;freeCashFlow:number|null}[]};
 gates:Gate[];warnings:GateWarning[];warningCount:number;
 status:'eligible'|'watchlist'|'rejected';
 blocking:Gate[];
 /** Distress or forensic signals serious enough to review an existing holding for exit. */
 severe:string[];
 metrics:MultiYear;intrinsic:Intrinsic|null;reverseDcf:ReverseDcf;businessModel?:BusinessModel;
 summary:string;
}

const gate=(id:GateId,stage:GateStage,status:GateStatus,detail:string):Gate=>({id,label:GATE_LABELS[id],stage,status,detail});
const warn=(id:string,label:string,detail:string,weight:0|1=1):GateWarning=>({id,label,detail,weight});
export const warningWeight=(w:GateWarning[])=>w.reduce((s,x)=>s+x.weight,0);

const BUCKET_CHECKS:[RegExp,string,string,'>'|'<',string][]=[
 [/Rev Growth>([\d.]+)%/i,'revenue_growth_yoy','Revenue growth','>','%'],
 [/NI Growth>([\d.]+)%/i,'earnings_growth_yoy','Earnings growth','>','%'],
 [/ROE>([\d.]+)%/i,'roe','ROE','>','%'],
 [/Net Margin>([\d.]+)%/i,'netMargin','Net margin','>','%'],
 [/P\/E<([\d.]+)/i,'pe_ttm','P/E','<',''],
 [/P\/B<([\d.]+)/i,'pb','P/B','<',''],
 [/PEG<([\d.]+)/i,'peg','PEG','<',''],
];

/** The best-matching Jarvis bucket; each missed threshold is one warning. */
function bucketWarnings(input:ScreenInput):GateWarning[]{
 const screens=input.matchedScreens||[];if(!screens.length||!input.bucketMetrics)return [];
 const scored=screens.map(screen=>{
  const misses:string[]=[];
  for(const [pattern,key,label,op,unit] of BUCKET_CHECKS){
   const match=String(screen.criteria).match(pattern);if(!match)continue;
   const threshold=Number(match[1]),v=input.bucketMetrics![key];
   if(!finite(v)){misses.push(`${label} unavailable (Jarvis ${screen.bucket} wants ${op} ${threshold}${unit})`);continue;}
   const ok=op==='>'?v>threshold:v>0&&v<threshold;
   if(!ok)misses.push(`${label} ${round(v)}${unit} (Jarvis ${screen.bucket} wants ${op} ${threshold}${unit})`);
  }
  return {screen,misses};
 }).sort((a,b)=>a.misses.length-b.misses.length);
 return scored[0].misses.map((detail,i)=>warn('bucket-'+i,'Jarvis bucket threshold',detail));
}

export function screenScorecard(input:ScreenInput):Scorecard{
 const model=businessModel(input),lender=model.lender,deferred=lender||model.specialist;
 const expected=input.market==='IN'?'INR':'USD',shares=input.sharesOutstanding??(finite(input.marketCap)&&finite(input.price)&&input.price>0?input.marketCap/input.price:null);
 let converted=!!input.financialCurrency&&input.financialCurrency!==expected&&finite(input.statementRate)&&input.statementRate>0,rate=converted?input.statementRate!:1,mislabelled=false;
 let m=multiYear(input.series,finite(input.marketCap)?input.marketCap/rate:null,shares);
 // Yahoo sometimes labels rupee statements as USD. If converting makes statement EPS disagree with
 // trailing EPS by more than 4× while the unconverted figure matches, the statements are already local.
 if(converted&&finite(input.epsTtm)&&input.epsTtm>0&&finite(m.eps)&&m.eps>0){const off=Math.abs(Math.log(m.eps*rate/input.epsTtm)),raw=Math.abs(Math.log(m.eps/input.epsTtm));if(off>Math.log(4)&&raw<Math.log(2)){converted=false;rate=1;mislabelled=true;m=multiYear(input.series,input.marketCap,shares);}}
 const severe:string[]=[];
 const now=input.now??Date.now(),gates:Gate[]=[],warnings:GateWarning[]=[];
 if(mislabelled)warnings.push(warn('currency-label','Statement currency label corrected',`Yahoo labels the statements ${input.financialCurrency}, but per-share figures match the ${expected} trailing EPS, so no conversion is applied.`,0));

 // 1. Data integrity
 const integrity:string[]=[];if(model.kind==='unclassified-financial')integrity.push('The financial business type is unknown; classification and a suitable valuation model are required.');
 if(!finite(input.price)||input.price<=0)integrity.push('No usable market price.');
 if(input.currency&&input.currency!==expected)integrity.push(`Trading currency ${input.currency} does not match ${expected}.`);
 if(input.financialCurrency&&input.financialCurrency!==expected&&!converted&&!mislabelled)integrity.push(`Statements are in ${input.financialCurrency}; no conversion rate is available.`);
 const age=m.latestPeriod?(now-Date.parse(m.latestPeriod))/86400000:null;
 if(age===null)integrity.push('Annual statements are unavailable.');
 else if(age<0||age>THRESHOLDS.statementMaxAgeDays)integrity.push(`Latest annual statements (${m.latestPeriod}) are ${age<0?'future-dated':'older than 18 months'}.`);
 gates.push(gate('integrity','screen',integrity.length?(age===null||!finite(input.price)||model.kind==='unclassified-financial'?'unknown':'fail'):'pass',integrity.length?integrity.join(' '):`Price and ${m.years} years of ${expected} statements through ${m.latestPeriod}.`));

 // 2. Solvency
 if(deferred)gates.push(gate('solvency','research','deferred',model.label+': '+model.checks));
 else{
  const issues:string[]=[],unknown:string[]=[],passes:string[]=[];
  let leverageOk:boolean|null=null;
  if(finite(m.debtEquity)){leverageOk=m.debtEquity<THRESHOLDS.debtEquityMax;(leverageOk?passes:issues).push(`debt/equity ${round(m.debtEquity)}`);}
  else if(finite(m.liabilitiesToAssets)&&m.liabilitiesToAssets<0.5){leverageOk=true;passes.push(`debt not reported; total liabilities are ${pct(m.liabilitiesToAssets*100)} of assets`);}
  else unknown.push('debt/equity unavailable');
  const negligibleDebt=finite(m.debtEquity)&&m.debtEquity<THRESHOLDS.nearDebtFreeDebtEquity||(m.debtEquity===null&&leverageOk===true);
  if(finite(m.interestCoverage))(m.interestCoverage>THRESHOLDS.interestCoverMin||negligibleDebt?passes:issues).push(`interest cover ${round(m.interestCoverage,1)}×`);
  else if(negligibleDebt||m.interestExpense===0)passes.push('negligible interest cost');
  else unknown.push('interest cover unavailable');
  if(finite(m.altmanZ)){if(m.altmanZ<=THRESHOLDS.altmanMin){issues.push(`Altman Z ${round(m.altmanZ)} (distress zone ≤ ${THRESHOLDS.altmanMin})`);severe.push(`Altman Z-score ${round(m.altmanZ)} is in the distress zone.`);}else passes.push(`Altman Z ${round(m.altmanZ)}`);
   if(m.altmanZ>THRESHOLDS.altmanMin&&m.altmanZ<THRESHOLDS.altmanSafe)warnings.push(warn('altman-grey','Altman Z in grey zone',`Altman Z is ${round(m.altmanZ)}, between ${THRESHOLDS.altmanMin} and ${THRESHOLDS.altmanSafe}.`));}
  else warnings.push(warn('altman-unavailable','Altman Z unavailable','The bankruptcy-risk score could not be calculated from the reported statements.',0));
  gates.push(gate('solvency','screen',issues.length?'fail':unknown.length?'unknown':'pass',issues.length?`Fails: ${issues.join('; ')}. Required: debt/equity < ${THRESHOLDS.debtEquityMax}, interest cover > ${THRESHOLDS.interestCoverMin}×, Altman Z > ${THRESHOLDS.altmanMin}. Consolidated figures include any lending or financing subsidiary.`:unknown.length?`Evidence needed: ${unknown.join('; ')}.`:`Passes: ${passes.join('; ')}.`));
 }

 // 3. Earnings quality
 if(deferred)gates.push(gate('earningsQuality','research','deferred',lender?'Credit quality, provisioning and accounting require source-backed lender research.':model.label+': accounting and cash flows require sector-specific source-backed research. '+model.checks));
 else{
  const issues:string[]=[],notes:string[]=[];let status:GateStatus='pass';
  if(finite(m.cashConversionCumulative)){
   if(m.cashConversionCumulative<THRESHOLDS.cashConversionMin){issues.push(`operating cash flow is ${pct(m.cashConversionCumulative*100)} of profit over ${m.cumulativeYears} years (needs ≥ ${THRESHOLDS.cashConversionMin*100}%)`);}
   else notes.push(`operating cash flow is ${pct(m.cashConversionCumulative*100)} of profit over ${m.cumulativeYears} years`);
  }else if(m.cumulativeYears>=2)issues.push('cumulative profit over the last three years is not positive');
  else status='unknown';
  const d=m.beneishDetail;
  if(finite(m.beneishM)&&m.beneishM>THRESHOLDS.beneishFlag){
   const corroborated=!!d&&(d.tata>THRESHOLDS.beneishAccruals||d.dsri>THRESHOLDS.beneishReceivables);
   if(corroborated)severe.push(`Beneish M-score ${m.beneishM} indicates possible earnings manipulation.`);
   if(corroborated)issues.push(`Beneish M-score ${m.beneishM} with ${d!.tata>THRESHOLDS.beneishAccruals?`high accruals (${d!.tata})`:`receivables outpacing sales (DSRI ${d!.dsri})`} — a serious forensic red flag`);
   else warnings.push(warn('beneish','Beneish M-score elevated',`M-score ${m.beneishM} is above ${THRESHOLDS.beneishFlag}, but accruals and receivables do not corroborate manipulation.`));
  }else if(finite(m.beneishM))notes.push(`Beneish M-score ${m.beneishM}`);
  if(issues.length)status='fail';
  gates.push(gate('earningsQuality','screen',status,status==='fail'?`Fails: ${issues.join('; ')}. A lending or financing subsidiary can depress consolidated operating cash flow.`:status==='unknown'?'Evidence needed: at least two years of operating cash flow and profit.':`Passes: ${notes.join('; ')}.`));
  if(finite(m.cashConversionLatest)&&m.cashConversionLatest<THRESHOLDS.cashConversionLatestWarn&&status==='pass')warnings.push(warn('cash-latest','Weak cash conversion last year',`Latest-year operating cash flow is ${pct(m.cashConversionLatest*100)} of profit.`));
  if(finite(m.receivablesGap)&&m.receivablesGap>THRESHOLDS.receivablesGapWarnPct)warnings.push(warn('receivables','Receivables growing faster than sales',`Receivables grew ${round(m.receivablesGap,1)} points faster than revenue last year.`));
 }

 // 4. Return on capital
 if(model.specialist)gates.push(gate('returnOnCapital','research','deferred',model.label+': profitability and capital requirements need sector-specific research.'));
 else{
  const values=lender?m.roeYears:m.roceYears,mid=lender?m.roeMedian:m.roceMedian,min=lender?THRESHOLDS.roeMinFinancial:THRESHOLDS.roceMin,name=lender?'ROE':'ROCE';
  const describe=`Median ${name} ${finite(mid)?pct(mid):'n/a'} over ${values.length} year${values.length===1?'':'s'}${values.length?` (${values.map(v=>pct(v)).join(', ')})`:''}; required ≥ ${min}%`;
  // Lenders: Yahoo equity can include insurance/asset-management subsidiaries, so a
  // median return on assets of at least 1% is accepted as the bank profitability test.
  const roaPass=lender&&finite(m.roaMedian)&&m.roaMedian>=THRESHOLDS.roaMinFinancial;
  const status:GateStatus=!finite(mid)&&!roaPass?'unknown':(finite(mid)&&mid>=min)||roaPass?'pass':'fail';
  gates.push(gate('returnOnCapital','screen',status,status==='unknown'?`Evidence needed: ${name} could not be calculated.`:lender&&finite(m.roaMedian)?`${describe}, or median ROA ≥ ${THRESHOLDS.roaMinFinancial}% (ROA ${pct(m.roaMedian)}).`:describe+'.'));
  if(values.length&&values.length<3)warnings.push(warn('short-history','Short financial history',`Only ${values.length} year${values.length===1?'':'s'} of ${name} could be calculated.`));
 }

 // Screen-stage warnings (never block on their own)
 if(finite(m.earningsGrowthLatest)&&m.earningsGrowthLatest<0)warnings.push(warn('earnings-decline','Profit fell last year',`Net profit changed ${pct(m.earningsGrowthLatest)} year on year${finite(m.earningsCagr)?`; compound profit growth is ${pct(m.earningsCagr)} a year`:''}.`));
 if(finite(m.revenueGrowthLatest)&&m.revenueGrowthLatest<0)warnings.push(warn('revenue-decline','Revenue fell last year',`Revenue changed ${pct(m.revenueGrowthLatest)} year on year.`));
 if(finite(input.epsTtm)&&finite(input.epsForward)&&input.epsTtm>0&&input.epsForward<input.epsTtm)warnings.push(warn('forward-eps','Forward EPS below trailing',`Forward EPS ${round(input.epsForward)} vs trailing ${round(input.epsTtm)} (${pct((input.epsForward/input.epsTtm-1)*100)}).`));
 if(finite(input.peTtm)&&finite(input.peForward)&&input.peTtm>0&&input.peForward>input.peTtm*1.2)warnings.push(warn('forward-pe','Forward P/E stretched',`Forward P/E ${round(input.peForward,1)} vs trailing ${round(input.peTtm,1)}.`));
 if(finite(input.analystRating)&&input.analystRating>=3)warnings.push(warn('analyst','Analysts cautious',`Average analyst rating ${round(input.analystRating,1)} (1 = strong buy, 5 = sell).`));
 if(model.financial)warnings.push(warn('business-model',model.label,model.checks,0));
 warnings.push(...bucketWarnings(input));

 const raw=model.model==='research-required'?null:intrinsicValue(m,input.market,lender);
 if(raw&&model.kind!=='operating'&&!lender)raw.method=model.label+' — '+raw.method;
 let intrinsic:Intrinsic|null=raw&&converted?{...raw,value:round(raw.value*rate),statementValue:raw.value,statementCurrency:input.financialCurrency!,method:raw.method+` (statements converted from ${input.financialCurrency} at ${round(rate,4)})`}:raw;
 if(intrinsic&&lender&&!(finite(m.roeMedian)&&m.roeMedian>=THRESHOLDS.roeMinFinancial))intrinsic={...intrinsic,binding:false,note:'Reported equity appears to include insurance or other subsidiaries, so this value is indicative only and does not cap the buy price.'};
 const statements={currency:mislabelled||!input.financialCurrency?expected:input.financialCurrency,rows:normaliseSeries(input.series).slice(0,3).map(r=>({period:String(r.period).slice(0,10),revenue:field(r,'TotalRevenue'),netIncome:field(r,'NetIncome'),operatingCashFlow:field(r,'OperatingCashFlow'),freeCashFlow:field(r,'FreeCashFlow')}))};
 return {...finishScorecard(gates,warnings,m,intrinsic?{...intrinsic,currency:expected}:null,severe,model.specialist?{impliedGrowthPct:null,historicalGrowthPct:null,verdict:'unavailable',summary:model.label+' requires a sector-specific researched valuation; a bank P/B or generic operating DCF is not applied.',assumptions:{}}:reverseDcf(m,input.market,lender,finite(input.price)?input.price/rate:null)),statements,businessModel:model};
}

function finishScorecard(gates:Gate[],warnings:GateWarning[],m:MultiYear,intrinsic:Intrinsic|null,severe:string[],reverse:ReverseDcf):Scorecard{
 const blocking=gates.filter(g=>g.status==='fail'||g.status==='unknown'),count=warningWeight(warnings);
 const status=gates.some(g=>g.status==='fail')?'rejected':blocking.length||count>=THRESHOLDS.watchlistWarnings?'watchlist':'eligible';
 const summary=status==='rejected'?`Fails ${blocking.filter(g=>g.status==='fail').map(g=>g.label.toLowerCase()).join(', ')}.`
  :blocking.length?`Evidence needed for ${blocking.map(g=>g.label.toLowerCase()).join(', ')}.`
  :count>=THRESHOLDS.watchlistWarnings?`Mandatory checks pass, but ${count} warnings are too many for a position.`
  :count?`Mandatory checks pass with ${count} warning${count===1?'':'s'}; position capped at ${THRESHOLDS.warnedPositionCapPct}%.`:'All mandatory checks pass with no warnings.';
 const pending=gates.filter(g=>g.status==='deferred');
 return {policy:GATE_POLICY,gates,warnings,warningCount:count,status,blocking,severe,metrics:m,intrinsic,reverseDcf:reverse,summary:pending.length&&status==='eligible'?`Initial numerical screen passed; ${pending.length} mandatory sector checks remain in company research. No purchase approval.`:summary};
}

/** Compact scorecard stored on candidates and holdings (no raw statements). */
export function compactScorecard(sc:Scorecard){
 const m=sc.metrics;
 return {policy:sc.policy,status:sc.status,summary:sc.summary,businessModel:sc.businessModel,statements:sc.statements,warningCount:sc.warningCount,severe:sc.severe,gates:sc.gates,warnings:sc.warnings,intrinsic:sc.intrinsic,reverseDcf:sc.reverseDcf,
  metrics:{years:m.years,latestPeriod:m.latestPeriod,revenueCagr:m.revenueCagr,earningsCagr:m.earningsCagr,cagrYears:m.cagrYears,roceMedian:m.roceMedian,roceYears:m.roceYears,roeMedian:m.roeMedian,roeYears:m.roeYears,roaMedian:m.roaMedian,cashConversionCumulative:m.cashConversionCumulative,debtEquity:m.debtEquity,interestCoverage:m.interestCoverage,altmanZ:m.altmanZ,beneishM:m.beneishM,revenueGrowthLatest:m.revenueGrowthLatest,earningsGrowthLatest:m.earningsGrowthLatest}};
}
/** Per-company gate summary used by the research gate (holdings take precedence over candidates). */
export function companyGateIndex(candidates:any[]=[],holdings:any[]=[]){
 const out:Record<string,{price?:number;currency?:string;status:string;warningCount:number;intrinsic:Intrinsic|null;financial:boolean;severe:string[];businessModel?:BusinessModel}>={};
 for(const x of [...holdings,...candidates]){const sc=x?.scorecard;if(!sc||!x.ticker||out[x.ticker])continue;out[x.ticker]={price:x.price,currency:x.currency,status:sc.status,warningCount:sc.warningCount,intrinsic:sc.intrinsic,financial:businessModel(x).lender,businessModel:businessModel(x),severe:sc.severe||[]};}
 return out;
}
/** Position cap implied by the total weighted warnings: 15 means "use the normal target". */
export function convictionCap(weightedWarnings:number){
 return weightedWarnings>=THRESHOLDS.watchlistWarnings?0:weightedWarnings>=1?THRESHOLDS.warnedPositionCapPct:15;
}

// --------------------------------------------------------------- event stage

/**
 * Headlines that can break an investment case. Everything else in the news feed —
 * results dates, dividends, ratings chatter, generic "buy or sell?" stories — is a warning.
 */
export const SERIOUS_EVENT=/\b(fraud\w*|forensic audit|probe[ds]?|investigat\w+|raid(?:s|ed)?|money laundering|whistle-?blower|insolvenc\w+|bankrupt\w*|chapter 11|nclt|defaults?|defaulted|auditors? (?:resign\w*|quit\w*|exit\w*)|resign\w* as auditor|restat(?:e|es|ed|ement)\w*|accounting (?:irregularit\w+|lapse\w*|fraud)|going concern|pledge\w* (?:invok\w+|rais\w+|increas\w+)|invok\w+ pledge\w*|delist\w*|trading (?:halt\w*|suspen\w+)|suspen\w+ (?:of )?trading|warning letter|import alert|sebi (?:order\w*|bars?|ban\w*|penal\w*)|sec (?:charges?|sues|probe)|sanction(?:s|ed)?)\b/i;

export interface EventClassification{serious:string[];warnings:GateWarning[]}
export function classifyEventIssues(issues:string[]|null|undefined):EventClassification{
 const serious:string[]=[],warnings:GateWarning[]=[];let headlines=0;const sample:string[]=[];
 for(const issue of issues||[]){
  if(/^(?:All news sources unavailable|Company calendar (?:unavailable|contains))/i.test(issue))continue;
  if(/^Results expected within/i.test(issue)){warnings.push(warn('results-soon','Results due soon',issue.replace(/^Results expected within 14 days: /,'Results expected around ')+'. Consider waiting for the numbers.'));continue;}
  if(/^Ex-dividend/i.test(issue)){warnings.push(warn('dividend','Ex-dividend date',issue+'.',0));continue;}
  const title=issue.replace(/^Possible material news: /,'');
  if(SERIOUS_EVENT.test(title)){serious.push(title);continue;}
  headlines++;if(sample.length<3)sample.push(title);
 }
 if(headlines)warnings.push(warn('headlines','Recent company headlines',`${headlines} recent headline${headlines===1?'':'s'} to skim: ${sample.join(' · ')}`));
 return {serious,warnings};
}
