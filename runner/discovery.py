"""Live, bounded Yahoo screening using Jarvis queries; no model API calls."""
import sys,json,time,math,re,logging,concurrent.futures,warnings
warnings.filterwarnings("ignore",category=FutureWarning)
from datetime import datetime,timezone,date
from pathlib import Path
import yfinance as yf
from jarvis_screening import _build_sector_aware_queries,_is_us_common_stock,_classify_sector,_assess_forward_risk
logging.getLogger('yfinance').setLevel(logging.CRITICAL)
FLOORS={'IN':{'A':50e9,'B':20e9,'C':10e9},'US':{'A':10e9,'B':2e9,'C':.5e9}}
RISK_WORDS=['investigation','fraud','resignation','warning letter','usfda','default','sanction','litigation','profit warning','pledge']
def number(v):
 try:
  n=float(v);return n if math.isfinite(n) else None
 except (TypeError,ValueError):return None
def sector_filter(label):
 if 'Financial' in label:return ['Financial Services']
 if label=='Consumer / FMCG':return ['Consumer Defensive','Consumer Cyclical']
 if label=='Technology / IT Services':return ['Technology']
 if 'Pharma / Manufacturing' in label:return ['Healthcare','Industrials']
 if 'High-Growth' in label:return ['Technology','Consumer Defensive','Consumer Cyclical','Communication Services']
 if 'Cyclicals / Metals' in label:return ['Basic Materials','Energy','Utilities']
 return ['Technology','Healthcare','Industrials','Consumer Defensive','Consumer Cyclical','Communication Services','Basic Materials','Energy','Utilities']
def stage_market(market,excluded):
 seen={};screens=[];errors=[]
 for cat in ['A','B','C']:
  for label,criteria,query,sort in _build_sector_aware_queries(cat,FLOORS[market][cat],market):
   try:
    q=yf.EquityQuery('and',[query,yf.EquityQuery('is-in',['sector',*sector_filter(label)])])
    data=yf.screen(q,sortField=sort,sortAsc=False,size=30) or {};quotes=data.get('quotes') or []
    screens.append({'market':market,'category':cat,'bucket':label,'criteria':criteria,'matches':len(quotes),'total':data.get('total',len(quotes))})
    # Keep three per bucket for a bounded, diverse deep-dive, not an exhaustive universe.
    count=0
    for quote in quotes:
     ticker=quote.get('symbol','')
     if not ticker or ticker in excluded or ticker=='ORCL' or (market=='US' and not _is_us_common_stock(quote)):continue
     if quote.get('quoteType')!='EQUITY':continue
     if market=='IN' and (not ticker.endswith('.NS') or quote.get('exchange')!='NSI'):continue
     if market=='US' and quote.get('exchange') not in ['NMS','NYQ']:continue
     item=seen.setdefault(ticker,{'ticker':ticker,'market':market,'category':cat,'quote':quote,'matchedScreens':[]})
     item['matchedScreens'].append({'category':cat,'bucket':label,'criteria':criteria})
     count+=1
     if count>=3:break
   except Exception as e:errors.append(f'{market} {cat} / {label}: screen unavailable ({type(e).__name__})')
 return list(seen.values()),screens,errors

def enrich(item):
 ticker=item['ticker'];q=item['quote'];obj=yf.Ticker(ticker);gaps=[];events=[];headlines=[]
 try:info=obj.info or {}
 except Exception:info={};gaps.append('Company fundamentals unavailable')
 def get(k,*aliases):
  for key in [k,*aliases]:
   v=number(info.get(key,q.get(key)))
   if v is not None:return v
  return None
 sector=info.get('sector') or 'Unknown';industry=info.get('industry') or 'Unknown';financial=sector=='Financial Services'
 ccr=None;statement_date=None
 if not financial:
  try:
   cf=obj.cashflow;income=obj.income_stmt
   dates=sorted(set(cf.columns)&set(income.columns),reverse=True)
   if dates:
    latest=dates[0];ocf=number(cf.loc['Operating Cash Flow',latest]);ni=number(income.loc['Net Income',latest]);statement_date=str(latest)[:10]
    if ni and ni>0 and ocf is not None:ccr=ocf/ni
  except Exception:gaps.append('Aligned annual operating-cash-flow / earnings check unavailable')
 if ccr is None:gaps.append('Cash-conversion check unavailable' if not financial else 'NPA/NIM/CAR/underwriting evidence unavailable for financial sector')
 try:
  for news in (obj.news or [])[:8]:
   content=news.get('content',news);title=content.get('title','');published=content.get('pubDate');url=(content.get('canonicalUrl') or {}).get('url')
   if published:
    try:
     age=(datetime.now(timezone.utc)-datetime.fromisoformat(published.replace('Z','+00:00'))).total_seconds()
     if age>72*3600:continue
    except ValueError:continue
   else:continue
   if title:headlines.append({'title':title[:400],'publishedAt':published,'url':url})
   if any(k in title.lower() for k in RISK_WORDS):events.append('Recent headline risk: '+title[:180])
 except Exception:gaps.append('Recent news feed unavailable')
 if not headlines:gaps.append('No verified headlines in the last 72 hours; absence is not a clean-news finding')
 now=time.time()
 for field,days,label in [('earningsTimestamp',14,'Earnings event'),('exDividendDate',7,'Ex-dividend event')]:
  ts=get(field)
  if ts and 0<=ts-now<=days*86400:events.append(f'{label} within {days} days ({datetime.fromtimestamp(ts,timezone.utc).date()})')
 td={'eps_ttm':get('trailingEps','epsTrailingTwelveMonths'),'eps_forward':get('forwardEps','epsForward'),'pe_ttm':get('trailingPE'),'pe_forward':get('forwardPE'),'revenue_growth_yoy':get('revenueGrowth')*100 if get('revenueGrowth') is not None else None,'earnings_growth_yoy':get('earningsGrowth')*100 if get('earningsGrowth') is not None else None,'cash_conversion_ratio':ccr,'forensic_flags':[]}
 gate=_assess_forward_risk(ticker,q,td,events)
 if financial and gate['status']=='eligible':gate['status']='watchlist';gate['all_reasons'].append('Financial-sector asset quality and underwriting checks need manual review')
 critical=['revenue_growth_yoy','earnings_growth_yoy','eps_ttm','eps_forward']
 missing=[k for k in critical if td[k] is None]
 if (missing or (not financial and ccr is None)) and gate['status']=='eligible':gate['status']='watchlist';gate['all_reasons'].append('Required growth, forward earnings or cash-conversion evidence is missing')
 price=get('currentPrice','regularMarketPrice');quote_time=get('regularMarketTime');currency=info.get('currency',q.get('currency'))
 expected='INR' if item['market']=='IN' else 'USD'
 if not price or not quote_time or currency!=expected:gate['status']='watchlist';gate['all_reasons'].append('Valid market price, timestamp and trading currency required')
 if item['market']=='US' and info.get('financialCurrency',q.get('financialCurrency'))!='USD':gate['status']='watchlist';gate['all_reasons'].append('USD financial statements required; ADR/FX mismatch needs review')
 canonical='Financials' if financial else 'Technology' if sector=='Technology' else 'Healthcare' if sector=='Healthcare' else 'Consumer' if sector.startswith('Consumer') else 'Industrials' if sector=='Industrials' else 'Commodities' if sector in ['Basic Materials','Energy','Utilities'] else 'Services'
 return {'ticker':ticker,'name':info.get('shortName',q.get('shortName',ticker)),'market':item['market'],'category':item['category'],'sector':canonical,'industry':industry,'currency':currency,'price':price,'quoteTime':quote_time,'status':gate['status'],'gateReasons':gate['all_reasons'],'matchedScreens':item['matchedScreens'],'metrics':{**td,'roe':get('returnOnEquity')*100 if get('returnOnEquity') is not None else None,'pb':get('priceToBook'),'peg':get('trailingPegRatio','pegRatio'),'debtEquity':get('debtToEquity')/100 if get('debtToEquity') is not None else None,'fcf':get('freeCashflow'),'marketCap':get('marketCap'),'statementDate':statement_date,'financialCurrency':info.get('financialCurrency')},'headlines':headlines[:4],'evidenceGaps':gaps+['Full five-year forensic accounting, moat and management-delivery checks are not verified'],'sourceUrl':'https://finance.yahoo.com/quote/'+ticker+'/', 'screenedAt':datetime.now(timezone.utc).isoformat()}

def discover(excluded):
 all_items=[];screens=[];errors=[]
 for market in ['IN','US']:
  items,rows,failures=stage_market(market,excluded);all_items+=items;screens+=rows;errors+=failures
 # Deep dives are bounded to 24: four per category per market, round-robin by bucket.
 selected=[]
 for market in ['IN','US']:
  for cat in ['A','B','C']:
   pool=[x for x in all_items if x['market']==market and x['category']==cat]
   buckets={}
   for item in pool:buckets.setdefault(item['matchedScreens'][0]['bucket'],[]).append(item)
   picks=[]
   while len(picks)<4 and any(buckets.values()):
    for values in buckets.values():
     if values and len(picks)<4:picks.append(values.pop(0))
   selected+=picks
 candidates=[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
  future_map={executor.submit(enrich,x):x for x in selected}
  for future,item in future_map.items():
   try:candidates.append(future.result())
   except Exception as e:errors.append(item['ticker']+': deep dive unavailable ('+type(e).__name__+')')
 return {'asOf':datetime.now(timezone.utc).isoformat(),'source':'Yahoo Finance via yfinance; Jarvis sector-aware screens','criteriaVersion':'jarvis-5750d4b','scope':'NSE and NYSE/Nasdaq; up to 30 matches per sub-screen, 24 diverse deep dives; not exhaustive','screens':screens,'candidates':candidates,'errors':errors}
if __name__=='__main__':
 payload=json.load(sys.stdin);result=discover(set(payload.get('exclude',[])));print(json.dumps(result,allow_nan=False,separators=(',',':')))
