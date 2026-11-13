"""Paginated Jarvis screening and resumable financial checks; no AI or paid API calls."""
import sys,json,time,math,re,logging,concurrent.futures,warnings,sqlite3,os
from datetime import datetime,timezone
from pathlib import Path
import yfinance as yf
from business_model import business_kind
from jarvis_screening import _build_sector_aware_queries,_is_us_common_stock,_assess_forward_risk,_parse_analyst_rating
warnings.filterwarnings('ignore',category=FutureWarning)
logging.getLogger('yfinance').setLevel(logging.CRITICAL)
VERSION='jarvis-paginated-v2'
FLOORS={'IN':{'A':50e9,'B':20e9,'C':10e9},'US':{'A':10e9,'B':2e9,'C':.5e9}}
EXCHANGES={'IN':['NSI'],'US':['NMS','NGM','NCM','NYQ','ASE']}
PAGE_SIZE=250
MAX_PAGES=20
MAX_COMPANIES=2000
BATCH_SIZE=32
TTL=6*3600

def number(v):
 try:
  n=float(v);return n if math.isfinite(n) else None
 except (TypeError,ValueError):return None

def stamp():return datetime.now(timezone.utc).isoformat()

def sector_filter(label):
 if 'Financial' in label:return ['Financial Services']
 if label=='Consumer / FMCG':return ['Consumer Defensive','Consumer Cyclical']
 if label=='Technology / IT Services':return ['Technology']
 if 'Pharma / Manufacturing' in label:return ['Healthcare','Industrials']
 if 'High-Growth' in label:return ['Technology','Consumer Defensive','Consumer Cyclical','Communication Services']
 if 'Cyclicals / Metals' in label:return ['Basic Materials','Energy','Utilities']
 return ['Technology','Healthcare','Industrials','Consumer Defensive','Consumer Cyclical','Communication Services','Basic Materials','Energy','Utilities']

def preliminary_query(query):
 """Yahoo's return-on-total-capital is not the annual EBIT ROCE calculation below.
 These ratios are verified from aligned statements instead of using proxy filters.
 """
 if query.operator in ('AND','OR'):
  children=[preliminary_query(q) for q in query.operands];children=[q for q in children if q is not None]
  return yf.EquityQuery(query.operator.lower(),children) if len(children)>1 else children[0] if children else None
 if query.operands[0] in ['returnontotalcapital.lasttwelvemonths','ltdebtequity.lasttwelvemonths','totaldebtequity.lasttwelvemonths','ebitinterestexpense.lasttwelvemonths']:return None
 return query

def stage_market(market,excluded,screen=yf.screen):
 seen={};screens=[];errors=[]
 for cat in ['A','B','C']:
  for label,criteria,query,sort in _build_sector_aware_queries(cat,FLOORS[market][cat],market):
   q=yf.EquityQuery('and',[preliminary_query(query),yf.EquityQuery('is-in',['sector',*sector_filter(label)])])
   retrieved=0;reported=None;pages=0;complete=False;page_ids=set();provider_ids=set();bucket_ids=set();excluded_ids=set();failure=None
   try:
    for page in range(MAX_PAGES):
     data=screen(q,offset=retrieved,size=PAGE_SIZE,sortField='ticker',sortAsc=True) or {};quotes=data.get('quotes')
     if not isinstance(quotes,list):raise ValueError('Missing quote page')
     total=number(data.get('total'));reported=max(reported or 0,int(total)) if total is not None else reported
     pages+=1
     if not quotes:
      complete=reported is not None and retrieved>=reported
      if not complete:failure='Provider returned an empty page before coverage could be confirmed.'
      break
     fingerprint=tuple(sorted(str(x.get('symbol')) for x in quotes))
     if fingerprint in page_ids:failure='Provider repeated a page; coverage is incomplete.';break
     page_ids.add(fingerprint)
     symbols={str(x.get('symbol')) for x in quotes}
     if provider_ids & symbols:failure='Provider pages overlap; coverage is incomplete.'
     provider_ids.update(symbols);retrieved+=len(quotes)
     for quote in quotes:
      ticker=quote.get('symbol','')
      if not re.fullmatch(r'[A-Z0-9.&^-]{1,25}',ticker) or quote.get('quoteType')!='EQUITY' or quote.get('exchange') not in EXCHANGES[market] or (market=='IN' and not ticker.endswith('.NS')) or (market=='US' and not _is_us_common_stock(quote)):
       excluded_ids.add(ticker);continue
      if ticker in excluded or ticker=='ORCL':excluded_ids.add(ticker);continue
      bucket_ids.add(ticker)
      item=seen.setdefault(ticker,{'ticker':ticker,'market':market,'category':cat,'quote':quote,'matchedScreens':[]})
      match={'category':cat,'bucket':label,'criteria':criteria}
      if match not in item['matchedScreens']:item['matchedScreens'].append(match)
     if failure:break
     if reported is not None and retrieved>=reported:complete=True;break
     if len(quotes)<PAGE_SIZE and reported is None:failure='Provider omitted the total; complete coverage cannot be confirmed.';break
    if not complete and not failure:failure='Pagination safety limit reached; coverage is incomplete.'
   except Exception as e:failure='Screen unavailable ('+type(e).__name__+'); coverage is incomplete.'
   if failure:errors.append(market+' '+cat+' / '+label+': '+failure)
   screens.append({'market':market,'category':cat,'bucket':label,'criteria':criteria,'matches':retrieved,'total':reported,'pages':pages,'uniqueCandidates':len(bucket_ids),'excluded':len(excluded_ids),'complete':complete,'error':failure,'filterNote':'Preliminary Yahoo query; ROCE, interest coverage and debt ratios are checked from annual statements.'})
 return list(seen.values()),screens,errors

def annual_metrics(income,cashflow,balance,now=None):
 """Ratios use one aligned annual period; comparatives must be 300–430 days apart."""
 now=now or datetime.now(timezone.utc);out={};evidence={}
 common=sorted(set(income.columns)&set(cashflow.columns)&set(balance.columns),reverse=True)
 if not common:return out,{'error':'Income, cash-flow and balance-sheet periods do not align.'}
 latest=common[0];date=str(latest)[:10];age=(now-datetime.fromisoformat(date).replace(tzinfo=timezone.utc)).days
 if age<0 or age>550:return out,{'error':'Aligned annual statements are future-dated or older than 550 days.','statementDate':date}
 previous=next((d for d in common[1:] if 300<=(latest-d).days<=430),None)
 def val(frame,*rows,period=latest):
  if period is None:return None
  for row in rows:
   if row in frame.index:
    value=number(frame.loc[row,period])
    if value is not None:return value
  return None
 def ratio(a,b):return a/b if a is not None and b is not None and b>0 else None
 def metric(key,value,method,inputs):out[key]=value;evidence[key]={'period':date,'previousPeriod':str(previous)[:10] if previous is not None else None,'method':method,'inputs':inputs}
 ni=val(income,'Net Income');rev=val(income,'Total Revenue');ocf=val(cashflow,'Operating Cash Flow');equity=val(balance,'Stockholders Equity','Common Stock Equity');old_equity=val(balance,'Stockholders Equity','Common Stock Equity',period=previous)
 for key,row,current in [('revenue_growth_yoy','Total Revenue',rev),('earnings_growth_yoy','Net Income',ni)]:
  old=val(income,row,period=previous);metric(key,(current/old-1)*100 if current is not None and old is not None and old>0 else None,'Aligned annual year-on-year growth (%)',{'current':current,'previous':old})
 avg_equity=(equity+old_equity)/2 if equity is not None and old_equity is not None and equity>0 and old_equity>0 else None
 metric('roe',ratio(ni,avg_equity)*100 if ratio(ni,avg_equity) is not None else None,'Annual net income / average shareholder equity (%)',{'netIncome':ni,'averageEquity':avg_equity})
 metric('cash_conversion_ratio',ratio(ocf,ni),'Annual operating cash flow / net income',{'operatingCashFlow':ocf,'netIncome':ni})
 debt=val(balance,'Total Debt');lt=val(balance,'Long Term Debt','Long Term Debt And Capital Lease Obligation')
 metric('debtEquity',ratio(debt,equity) if debt is not None and debt>=0 else None,'Year-end total debt / shareholder equity',{'debt':debt,'equity':equity})
 metric('longTermDebtEquity',ratio(lt,equity) if lt is not None and lt>=0 else None,'Year-end long-term debt / equity; includes leases when that is the reported line',{'longTermDebt':lt,'equity':equity})
 ebit=val(income,'EBIT');interest=val(income,'Interest Expense','Interest Expense Non Operating')
 metric('interestCoverage',ebit/abs(interest) if ebit is not None and interest is not None and interest!=0 else None,'Annual EBIT / absolute interest expense',{'ebit':ebit,'interestExpense':interest})
 out['noInterestExpense']=interest==0 and ebit is not None and ebit>0
 assets=val(balance,'Total Assets');current_liabilities=val(balance,'Current Liabilities');old_assets=val(balance,'Total Assets',period=previous);old_liabilities=val(balance,'Current Liabilities',period=previous)
 employed=assets-current_liabilities if assets is not None and current_liabilities is not None else None;old_employed=old_assets-old_liabilities if old_assets is not None and old_liabilities is not None else None
 average=(employed+old_employed)/2 if employed is not None and old_employed is not None and employed>0 and old_employed>0 else None
 metric('roce',ratio(ebit,average)*100 if ratio(ebit,average) is not None else None,'Annual EBIT / average (total assets − current liabilities) (%)',{'ebit':ebit,'averageCapitalEmployed':average})
 metric('netMargin',ratio(ni,rev)*100 if ratio(ni,rev) is not None else None,'Annual net profit / revenue (%)',{'netIncome':ni,'revenue':rev})
 fcf=val(cashflow,'Free Cash Flow');capex=val(cashflow,'Capital Expenditure')
 if fcf is None and ocf is not None and capex is not None:fcf=ocf-abs(capex)
 metric('fcf',fcf,'Reported annual free cash flow, or operating cash flow less capital expenditure',{'operatingCashFlow':ocf,'capitalExpenditure':capex})
 out['statementDate']=date;return out,evidence

SERIES_ROWS=['Total Revenue','Net Income','EBIT','Interest Expense','Operating Cash Flow','Free Cash Flow','Capital Expenditure','Total Assets','Current Assets','Current Liabilities','Retained Earnings','Total Liabilities Net Minority Interest','Accounts Receivable','Cost Of Revenue','Gross Profit','Net PPE','Depreciation And Amortization','Selling General And Administration','Long Term Debt','Total Debt','Stockholders Equity','Diluted EPS','Basic EPS','Ordinary Shares Number']

def annual_series(income,cashflow,balance):
 """Raw annual rows (newest first, up to five years) for the server-side Jarvis gates.
 Field names match Yahoo's annual time-series names, e.g. 'Total Revenue' -> 'TotalRevenue'."""
 periods=sorted(set(income.columns)|set(cashflow.columns)|set(balance.columns),reverse=True)[:5];rows=[]
 for period in periods:
  row={'period':str(period)[:10]}
  for name in SERIES_ROWS:
   for frame in (income,cashflow,balance):
    if name in frame.index and period in frame.columns:
     value=number(frame.loc[name,period])
     if value is not None:row[name.replace(' ','')]=value;break
  if len(row)>1:rows.append(row)
 return rows

CHECKS=[(r'Rev Growth>([\d.]+)%','revenue_growth_yoy','Revenue growth','>'),(r'NI Growth>([\d.]+)%','earnings_growth_yoy','Earnings growth','>'),(r'ROE>([\d.]+)%','roe','ROE','>'),(r'P/E<([\d.]+)','pe_ttm','P/E','<'),(r'P/B<([\d.]+)','pb','P/B','<'),(r'PEG<([\d.]+)','peg','PEG','<'),(r'ROCE>([\d.]+)%','roce','ROCE','>'),(r'Net Margin>([\d.]+)%','netMargin','Net margin','>'),(r'ICR>([\d.]+)','interestCoverage','Interest coverage','>'),(r'(?<!LT )D/E<([\d.]+)','debtEquity','Debt/equity','<'),(r'LT D/E<([\d.]+)','longTermDebtEquity','Long-term debt/equity','<')]
def screen_checks(candidate):
 results=[];m=candidate['metrics']
 for screen in candidate['matchedScreens']:
  failed=[];missing=[]
  for pattern,key,label,op in CHECKS:
   match=re.search(pattern,screen['criteria'],re.I)
   if not match:continue
   threshold=float(match[1]);v=number(m.get(key))
   if key=='interestCoverage' and m.get('noInterestExpense') is True:continue
   if v is None:missing.append(label+' is unavailable; required '+op+' '+str(threshold)+'.');continue
   if not (v>threshold if op=='>' else v>=0 and v<threshold and (key in ['debtEquity','longTermDebtEquity'] or v>0)):failed.append(label+' is '+str(round(v,2))+'; required '+op+' '+str(threshold)+'.')
  if 'FCF+ve' in screen['criteria'] and not (number(m.get('fcf')) is not None and m['fcf']>0):(missing if m.get('fcf') is None else failed).append('Positive free cash flow is required.')
  results.append({'bucket':screen['bucket'],'category':screen['category'],'failed':failed,'missing':missing,'passed':not failed and not missing})
 return results

def enrich(item):
 ticker=item['ticker'];q=item['quote'];obj=yf.Ticker(ticker);gaps=[]
 try:info=obj.info or {}
 except Exception:info={};gaps.append('Company summary unavailable.')
 def get(key,*aliases):
  for k in (key,*aliases):
   v=number(info.get(k,q.get(k)))
   if v is not None:return v
  return None
 provider_sector=info.get('sector') or q.get('sector') or ''
 kind=business_kind(ticker,info.get('industry') or q.get('industry') or '',provider_sector)
 financial=provider_sector=='Financial Services'
 series=[]
 try:
  income,cashflow,balance=obj.income_stmt,obj.cashflow,obj.balance_sheet
  annual,evidence=annual_metrics(income,cashflow,balance)
  series=annual_series(income,cashflow,balance)
 except Exception:annual,evidence={}, {'error':'Aligned annual financial statements unavailable.'}
 if evidence.get('error'):gaps.append(evidence['error'])
 metrics={**annual,'eps_ttm':get('trailingEps','epsTrailingTwelveMonths'),'eps_forward':get('forwardEps','epsForward'),'pe_ttm':get('trailingPE'),'pe_forward':get('forwardPE'),'pb':get('priceToBook'),'peg':get('trailingPegRatio','pegRatio'),'marketCap':get('marketCap'),'analystRating':_parse_analyst_rating(info.get('averageAnalystRating',q.get('averageAnalystRating'))),'financialCurrency':info.get('financialCurrency',q.get('financialCurrency'))}
 td={**metrics,'forensic_flags':[]};gate=_assess_forward_risk(ticker,{**q,**info},td,[])
 if kind in ['bank','lender','insurer','broker','investment-vehicle','diversified-financial','unclassified-financial'] and gate['status']=='eligible':gate['status']='watchlist';gate['all_reasons'].append('Sector-specific accounting, capital and valuation checks require company research; the initial screen is not a purchase approval.')
 missing=[key for key in ['revenue_growth_yoy','earnings_growth_yoy','eps_ttm','eps_forward','cash_conversion_ratio'] if metrics.get(key) is None]
 if missing:
  if gate['status']=='eligible':gate['status']='watchlist'
  gate['all_reasons']+=['Required '+key.replace('_',' ')+' evidence is missing.' for key in missing]
 price=get('currentPrice','regularMarketPrice');quote_time=get('regularMarketTime');currency=info.get('currency',q.get('currency'));expected='INR' if item['market']=='IN' else 'USD'
 if not price or price<=0 or not quote_time or currency!=expected:gate['status']='watchlist' if gate['status']!='rejected' else 'rejected';gate['all_reasons'].append('Valid market price, timestamp and trading currency are required.')
 if metrics['financialCurrency']!=expected and gate['status']!='rejected':gate['status']='watchlist';gate['all_reasons'].append('Statement currency must match the trading currency; conversion is not inferred.')
 sector=info.get('sector',q.get('sector','Unknown'));canonical='Financials' if financial else 'Technology' if sector=='Technology' else 'Healthcare' if sector=='Healthcare' else 'Consumer' if sector.startswith('Consumer') else 'Industrials' if sector=='Industrials' else 'Commodities' if sector in ['Basic Materials','Energy','Utilities'] else 'Services'
 c={'ticker':ticker,'name':info.get('shortName',q.get('shortName',ticker)),'market':item['market'],'category':item['category'],'sector':canonical,'industry':info.get('industry','Unknown'),'currency':currency,'price':price,'quoteTime':quote_time,'status':gate['status'],'gateReasons':[s.replace('₹','$') if item['market']=='US' else s for s in gate['all_reasons']],'matchedScreens':item['matchedScreens'],'metrics':metrics,'metricEvidence':evidence,'annualSeries':series,'headlines':[],'evidenceGaps':gaps+['News/calendar checks run separately for proposed trades.','Full five-year forensic accounting, moat and management delivery are unverified.'],'sourceUrl':'https://finance.yahoo.com/quote/'+ticker+'/','screenedAt':stamp(),'criteriaVersion':VERSION}
 checks=screen_checks(c);passed=next((s for s in checks if s['passed']),None)
 if not passed and c['status']=='eligible':c['status']='watchlist';c['gateReasons']+=list(dict.fromkeys(x for s in checks for x in s['failed']+s['missing']))
 if passed:c['category']=passed['category']
 c['screenChecks']=checks;c['assessmentState']='unverified' if (any(s['missing'] for s in checks) and not passed) or evidence.get('error') or missing else 'evaluated'
 c['financialDataUsable']=bool(annual.get('statementDate'));return c

def fair_order(items):
 pools={};out=[]
 for item in items:pools.setdefault((item['market'],item['category']),[]).append(item)
 for pool in pools.values():pool.sort(key=lambda x:x['ticker'])
 while any(pools.values()):
  for pool in pools.values():
   if pool:out.append(pool.pop(0))
 return out

def discover(excluded,cache_path=None,batch_size=BATCH_SIZE,screen=yf.screen,enricher=enrich):
 path=Path(cache_path or os.environ.get('ARTHAPALANA_SCREEN_CACHE',Path(__file__).resolve().parents[1]/'.runner-private'/'discovery.sqlite'));path.parent.mkdir(parents=True,exist_ok=True)
 db=sqlite3.connect(path);db.execute('CREATE TABLE IF NOT EXISTS metadata(id TEXT PRIMARY KEY,payload TEXT)');db.execute('CREATE TABLE IF NOT EXISTS companies(ticker TEXT PRIMARY KEY,updated REAL,payload TEXT)')
 row=db.execute("SELECT payload FROM metadata WHERE id='universe'").fetchone();universe=json.loads(row[0]) if row else None;now=time.time()
 if not universe or universe.get('version')!=VERSION or now-universe['started']>=TTL or (universe.get('errors') and now-universe['started']>=900):
  items=[];screens=[];errors=[]
  for market in ['IN','US']:
   found,rows,failures=stage_market(market,excluded,screen);items+=found;screens+=rows;errors+=failures
  universe={'version':VERSION,'started':time.time(),'items':fair_order(items),'screens':screens,'errors':errors};db.execute("INSERT OR REPLACE INTO metadata VALUES('universe',?)",(json.dumps(universe,separators=(',',':')),));db.commit()
 items=[x for x in universe['items'] if x['ticker'] not in excluded and x['ticker']!='ORCL'];selected=items[:MAX_COMPANIES]
 cached={ticker:(updated,json.loads(payload)) for ticker,updated,payload in db.execute('SELECT ticker,updated,payload FROM companies')}
 def fresh(item):
  hit=cached.get(item['ticker']);return hit is not None and hit[0]>=now-TTL and hit[1].get('criteriaVersion')==VERSION and hit[1].get('matchedScreens')==item['matchedScreens']
 pending=[x for x in selected if not fresh(x)]
 batch=pending[:max(1,min(batch_size,128))]
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
  futures={pool.submit(enricher,x):x for x in batch}
  for future in concurrent.futures.as_completed(futures):
   item=futures[future]
   try:c=future.result()
   except Exception:c={'ticker':item['ticker'],'market':item['market'],'category':item['category'],'sector':'Unknown','currency':'INR' if item['market']=='IN' else 'USD','status':'watchlist','price':None,'quoteTime':None,'metrics':{},'matchedScreens':item['matchedScreens'],'gateReasons':['Financial data could not be fetched. This stock is unverified, not a confirmed financial failure.'],'evidenceGaps':['Company evidence unavailable.'],'assessmentState':'data_error','financialDataUsable':False,'criteriaVersion':VERSION,'screenedAt':stamp()}
   completed=time.time();db.execute('INSERT OR REPLACE INTO companies VALUES(?,?,?)',(item['ticker'],completed,json.dumps(c,allow_nan=False,separators=(',',':'))));db.commit();cached[item['ticker']]=(completed,c)
 candidates=[];markets={}
 for market in ['IN','US']:
  own=[x for x in items if x['market']==market];evaluated=[]
  for item in selected:
   hit=cached.get(item['ticker'])
   if item['market']!=market or not fresh(item):continue
   c={**hit[1],'matchedScreens':item['matchedScreens']};candidates.append(c);evaluated.append(c)
  screens=[s for s in universe['screens'] if s['market']==market];markets[market]={'uniqueMatches':len(own),'evaluated':len(evaluated),'pending':len(own)-len(evaluated),'unverified':sum(c.get('assessmentState') in ['unverified','data_error'] for c in evaluated),'dataErrors':sum(c.get('assessmentState')=='data_error' for c in evaluated),'financialEligible':sum(c['status']=='eligible' for c in evaluated),'watchlist':sum(c['status']=='watchlist' for c in evaluated),'rejected':sum(c['status']=='rejected' for c in evaluated),'pages':sum(s['pages'] for s in screens),'queries':len(screens),'queriesComplete':sum(s['complete'] for s in screens),'paginationComplete':bool(screens) and all(s['complete'] for s in screens),'exchanges':EXCHANGES[market],'deferredByCapacity':sum(x['market']==market for x in items[MAX_COMPANIES:])}
 remaining=sum(not fresh(x) for x in selected)
 result={'asOf':datetime.fromtimestamp(universe['started'],timezone.utc).isoformat(),'source':'Yahoo Finance / yfinance paginated screener and annual statements','criteriaVersion':VERSION,'scope':'Nasdaq (Global Select, Global and Capital), NYSE, NYSE American and NSE; paginated Jarvis preliminary filters, followed by resumable financial checks. Not an exhaustive assessment of every exchange listing.','screens':universe['screens'],'candidates':candidates,'errors':universe['errors'],'coverage':{'markets':markets,'batchSize':batch_size,'processedThisBatch':len(batch),'pendingWork':remaining,'needsMore':remaining>0,'lastBatchAt':stamp(),'incompleteQueries':sum(not x['complete'] for x in universe['screens']),'maximumCompanies':MAX_COMPANIES,'pageSize':PAGE_SIZE,'maximumPagesPerQuery':MAX_PAGES,'methodology':{'roce':'Annual EBIT / average (assets − current liabilities).','interestCoverage':'Annual EBIT / absolute interest expense. Verified zero interest and positive EBIT meets the debt-service check without inventing an infinite ratio.','longTermDebtEquity':'Year-end long-term debt / equity; includes leases when only the combined reported line is available.','period':'Aligned annual statements; growth uses a 300–430-day comparative period. Yahoo preliminary filters can use TTM data, so a preliminary match is not a verified financial pass.'}}}
 db.close();return result

if __name__=='__main__':
 payload=json.load(sys.stdin);print(json.dumps(discover(set(payload.get('exclude',[]))),allow_nan=False,separators=(',',':')))
