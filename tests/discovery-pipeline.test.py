"""Offline provider pagination, aligned annual ratios and durable batch resumption."""
import sys, tempfile, json, sqlite3
from pathlib import Path
from datetime import datetime, timezone
from unittest.mock import patch
import pandas as pd
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'runner'))
import discovery as d

query=d.yf.EquityQuery('eq',['exchange','NMS'])
def buckets(*args):return [('General GARP','ROE>15%',query,'ticker')]
quotes=[{'symbol':f'T{i:04}','exchange':['NMS','NGM','NCM','NYQ','ASE'][i%5],'quoteType':'EQUITY','financialCurrency':'USD'} for i in range(620)]
calls=[]
def screen(q,**kw):
 calls.append(kw)
 return {'total':len(quotes),'quotes':quotes[kw['offset']:kw['offset']+kw['size']]}
with patch.object(d,'_build_sector_aware_queries',buckets):
 found,rows,errors=d.stage_market('US',{'T0001'},screen)
 assert len(found)==619 and not errors and all(s['complete'] for s in rows)
 assert [c['offset'] for c in calls[:3]]==[0,250,500]
 assert all(c['size']==250 for c in calls)
 assert len(found[0]['matchedScreens'])==3, 'Deduplicate across categories without losing criteria'
 assert {x['quote']['exchange'] for x in found}==set(d.EXCHANGES['US'])
 def overlap(q,**kw):return {'total':500,'quotes':quotes[:250] if not kw['offset'] else quotes[200:450]}
 assert all(not r['complete'] for r in d.stage_market('US',set(),overlap)[1])
 def repeats(q,**kw):return {'total':600,'quotes':quotes[:250]}
 assert all(not r['complete'] for r in d.stage_market('US',set(),repeats)[1])
 def missing_total(q,**kw):return {'quotes':quotes[:5]}
 assert all(not r['complete'] for r in d.stage_market('US',set(),missing_total)[1])
 def outage(q,**kw):raise RuntimeError('provider unavailable')
 assert len(d.stage_market('US',set(),outage)[2])==3
def frame(rows):return pd.DataFrame(rows,index=pd.to_datetime(['2025-12-31','2024-12-31'])).T
income=frame({'Net Income':[120,100],'Total Revenue':[1200,1000],'EBIT':[200,150],'Interest Expense':[20,15]})
cash=frame({'Operating Cash Flow':[150,120],'Capital Expenditure':[-30,-20]})
balance=frame({'Stockholders Equity':[600,400],'Total Assets':[1200,1000],'Current Liabilities':[200,200],'Total Debt':[180,100],'Long Term Debt':[120,80]})
now=datetime(2026,11,4,tzinfo=timezone.utc)
m,e=d.annual_metrics(income,cash,balance,now)
assert abs(m['roce']-200/900*100)<1e-8 and m['interestCoverage']==10
assert m['longTermDebtEquity']==.2 and m['debtEquity']==.3 and m['roe']==24 and m['fcf']==120
assert abs(m['revenue_growth_yoy']-20)<1e-8 and m['cash_conversion_ratio']==1.25
assert e['roce']['previousPeriod']=='2024-12-31' and e['roce']['inputs']['averageCapitalEmployed']==900
zero=income.copy();zero.loc['Interest Expense']=0
m0,e0=d.annual_metrics(zero,cash,balance,now)
assert m0['noInterestExpense'] and m0['interestCoverage'] is None
assert d.screen_checks({'matchedScreens':[{'bucket':'Value','category':'C','criteria':'ICR>3 · LT D/E<1'}],'metrics':m0})[0]['passed']
assert d.annual_metrics(income,cash,balance.iloc[:,1:],now)[0].get('roce') is None
assert 'error' in d.annual_metrics(income,cash.rename(columns={cash.columns[0]:pd.Timestamp('2026-03-31'),cash.columns[1]:pd.Timestamp('2025-03-31')}),balance,now)[1]
assert 'error' in d.annual_metrics(income,cash,balance,datetime(2024,1,1,tzinfo=timezone.utc))[1]
negative=balance.copy();negative.loc['Stockholders Equity']=[-10,-20]
assert d.annual_metrics(income,cash,negative,now)[0]['roe'] is None
assert d.annual_metrics(income,cash.drop('Capital Expenditure'),balance,now)[0]['fcf'] is None
assert not d.screen_checks({'matchedScreens':[{'bucket':'Tech','category':'A','criteria':'LT D/E<0.25'}],'metrics':{'longTermDebtEquity':.2,'debtEquity':2}})[0]['failed']

enriched=[]
def enrich(item):
 enriched.append(item['ticker'])
 return {**item,'status':'eligible','metrics':{},'assessmentState':'evaluated','criteriaVersion':d.VERSION,'screenedAt':d.stamp()}
def stage(market,excluded,screen):
 items=[{'ticker':f'C{i:03}'+('.NS' if market=='IN' else ''),'market':market,'category':'ABC'[i%3],'matchedScreens':[{'category':'ABC'[i%3],'bucket':'Test','criteria':'ROE>15%'}]} for i in range(40)]
 return items,[{'market':market,'pages':1,'complete':True}],[]
with tempfile.TemporaryDirectory() as tmp,patch.object(d,'stage_market',stage):
 path=str(Path(tmp)/'cache.sqlite')
 a=d.discover(set(),path,batch_size=32,enricher=enrich)
 b=d.discover(set(),path,batch_size=32,enricher=enrich)
 assert len(a['candidates'])==32 and len(b['candidates'])==64 and len(set(enriched))==64
 assert b['coverage']['pendingWork']==16 and b['coverage']['markets']['US']['uniqueMatches']==40
 c=d.discover(set(),path,batch_size=32,enricher=enrich)
 assert len(c['candidates'])==80 and not c['coverage']['needsMore']
 held=c['candidates'][0]['ticker'];before=len(enriched)
 filtered=d.discover({held},path,batch_size=32,enricher=enrich)
 assert len(filtered['candidates'])==79 and len(enriched)==before
 db=sqlite3.connect(path);payload=json.loads(db.execute("SELECT payload FROM metadata WHERE id='universe'").fetchone()[0])
 changed=payload['items'][1]['ticker'];payload['items'][1]['matchedScreens'][0]['criteria']='ROE>20%'
 db.execute("UPDATE metadata SET payload=? WHERE id='universe'",(json.dumps(payload),));db.commit();db.close()
 d.discover(set(),path,batch_size=32,enricher=enrich)
 assert enriched[-1]==changed and len(enriched)==before+1, 'Changed criteria invalidate cached eligibility'

print('PASS: >250-result pagination, exchange coverage, deduplication, partial/overlapping pages, aligned ratios, zero-interest evidence, missing periods and resumable >24-company batches.')
