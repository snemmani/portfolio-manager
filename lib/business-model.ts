import catalog from './business-models.json';
export type BusinessKind='bank'|'lender'|'exchange'|'financial-infrastructure'|'asset-manager'|'payments'|'insurance-broker'|'insurer'|'broker'|'investment-vehicle'|'diversified-financial'|'unclassified-financial'|'operating';
const labels:Record<BusinessKind,string>={bank:'Bank',lender:'Lender',exchange:'Exchange operator','financial-infrastructure':'Financial infrastructure','asset-manager':'Asset manager',payments:'Payments business','insurance-broker':'Insurance broker',insurer:'Insurer',broker:'Broker / capital markets','investment-vehicle':'Investment vehicle','diversified-financial':'Diversified financial group','unclassified-financial':'Financial business — classification needed',operating:'Operating business'};
export function businessModel(x:{ticker?:string;industry?:string|null;sector?:string|null;financial?:boolean}){
 const ticker=String(x.ticker||'').toUpperCase();
 const override=(catalog.overrides as Record<string,BusinessKind>)[ticker];
 const rule=catalog.industryRules.find(([pattern])=>new RegExp(pattern,'i').test(x.industry||''));
 const financial=x.financial===true||['Financials','Financial Services'].includes(x.sector||'');
 const kind:BusinessKind=override||(rule?.[1] as BusinessKind)|| (financial?'unclassified-financial':'operating');
 const lender=kind==='bank'||kind==='lender';
 const specialist=['insurer','broker','investment-vehicle','diversified-financial','unclassified-financial'].includes(kind);
 const model=lender?'lender-pb':specialist?'research-required':'earnings-power';
 const reviewKey=kind==='operating'||lender?null:catalog.version+':'+kind;
 const checks=lender?'Capital adequacy, credit quality, provisioning and funding/ALM.':kind==='insurer'?'Regulatory solvency, underwriting/reserving, claims and investment assets.':kind==='investment-vehicle'?'NAV, underlying assets, liabilities, holding-company discounts and distributions.':kind==='broker'?'Client-money segregation, regulatory capital, margin lending, trading exposures and normalised fee earnings.':kind==='diversified-financial'?'Segment-by-segment lending, insurance and fee businesses; reconcile a sum-of-parts valuation.':kind==='unclassified-financial'?'Identify the actual business and select a supported valuation method before buying.':kind==='exchange'||kind==='financial-infrastructure'?'Separate client/clearing/settlement balances from corporate cash; normalise fee earnings and assess regulation, volumes, technology and capital needs.':kind==='asset-manager'?'Fee revenue, AUM mix and flows, fee compression, client concentration and corporate cash; AUM is not company equity.':kind==='payments'||kind==='insurance-broker'?'Normalised fee earnings, client funds, regulatory obligations and any credit/underwriting exposure.':'Operating cash flow, reinvestment, returns on capital and balance-sheet resilience.';
 return {kind,label:labels[kind],model,lender,specialist,financial:kind!=='operating',reviewKey,checks,source:override?'reviewed ticker mapping':rule?'provider industry':'sector fallback'};
}
export type BusinessModel=ReturnType<typeof businessModel>;
