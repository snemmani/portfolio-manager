"""Public issuer identity metadata only; never reads portfolio credentials."""
import concurrent.futures,json,re,sys,urllib.request,urllib.parse
from datetime import datetime,timezone,timedelta
import yfinance as yf
from pathlib import Path
ISSUER_SOURCES=json.loads(Path(__file__).with_name('issuer-sources.json').read_text())
def profile(ticker):
 try:
  info=yf.Ticker(ticker).get_info()
  website=info.get('website') or ''
  if website.startswith('http://'):website='https://'+website[7:]
  elif website and '://' not in website:website='https://'+website
  return {'ticker':ticker,'name':info.get('longName') or info.get('shortName') or ticker,'website':website}
 except Exception:return {'ticker':ticker,'name':ticker,'website':''}
raw_profile=profile
def nse_source_hints(ticker,read_json=None):
 """Discover exact primary attachments; hints never validate the company's financial conclusions."""
 if not re.fullmatch(r'[A-Z0-9.&-]{1,25}\.NS',ticker):return []
 def fetch(url):
  with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Accept':'application/json'}),timeout=8) as response:
   raw=response.read(2*1024*1024+1)
   if len(raw)>2*1024*1024:raise ValueError('Issuer metadata exceeds limit')
   return json.loads(raw)
 read_json=read_json or fetch;symbol=ticker[:-3];hints=[]
 def attachment(url):
  if not isinstance(url,str):return False
  u=urllib.parse.urlsplit(url)
  return u.scheme=='https' and u.hostname in ['nsearchives.nseindia.com','archives.nseindia.com'] and not u.username and not u.password and not u.port and u.path.lower().endswith('.pdf')
 try:
  result=read_json('https://www.nseindia.com/api/annual-reports?'+urllib.parse.urlencode({'index':'equities','symbol':symbol}))
  for row in result.get('data',[])[:2]:
   if attachment(row.get('fileName')):hints.append({'title':f"{row.get('companyName',symbol)} annual report {row.get('fromYr','')}–{row.get('toYr','')} — NSE filing",'url':row['fileName'],'kind':'annual_report'})
 except Exception:pass
 try:
  today=(datetime.now(timezone.utc)+timedelta(hours=5,minutes=30)).date()
  rows=read_json('https://www.nseindia.com/api/corporate-announcements?'+urllib.parse.urlencode({'index':'equities','symbol':symbol,'from_date':(today-timedelta(days=180)).strftime('%d-%m-%Y'),'to_date':today.strftime('%d-%m-%Y')}))
  if not isinstance(rows,list):raise ValueError('Missing announcements')
  rows=[r for r in rows if r.get('symbol')==symbol and attachment(r.get('attchmntFile'))]
  rows.sort(key=lambda r:str(r.get('sort_date') or ''),reverse=True)
  results=[r for r in rows if re.search(r'financial results',str(r.get('attchmntText',''))+' '+str(r.get('desc','')),re.I)]
  if results:hints.append({'title':symbol+' latest financial results — NSE filing','url':results[0]['attchmntFile'],'kind':'results'})
  presentations=[r for r in rows if re.search(r'investor presentation',str(r.get('desc','')),re.I)]
  if presentations:hints.append({'title':symbol+' recent investor presentation — NSE filing','url':presentations[0]['attchmntFile'],'kind':'filing'})
 except Exception:pass
 return hints[:4]
def profile(ticker):
 result={**raw_profile(ticker),**ISSUER_SOURCES.get(ticker,{})};seen=set();hints=[]
 for hint in [*result.get('sourceHints',[]),*nse_source_hints(ticker)]:
  if hint['url'] not in seen:seen.add(hint['url']);hints.append(hint)
 if hints:result['sourceHints']=hints[:4]
 return result

if __name__=='__main__':
 raw=json.load(sys.stdin);tickers=raw.get('tickers',[])
 if len(tickers)>4 or any(not isinstance(t,str) or not re.fullmatch(r'[A-Z0-9.&-]{1,25}(?:\.NS|\.BO)?',t) for t in tickers):raise ValueError('Invalid research scope')
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:print(json.dumps({'profiles':list(pool.map(profile,tickers))}))
