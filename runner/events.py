"""Keyless RSS news failover plus independent company-calendar checks. No AI calls."""
import sys,json,time,logging,concurrent.futures,re,html,unicodedata
from datetime import datetime,timezone
from email.utils import parsedate_to_datetime
from urllib.parse import urlencode,urlparse,parse_qs,urlunparse
from urllib.request import Request,urlopen
import xml.etree.ElementTree as ET
import yfinance as yf
from curl_cffi import requests
logging.getLogger('yfinance').setLevel(logging.CRITICAL)
WINDOW=72*3600
HTTP_TIMEOUT=8
MAX_BYTES=1_000_000
SOURCES=('Yahoo Finance RSS','Google News RSS','Bing News RSS')
MATERIAL=re.compile(r'\b(fraud|investigation|lawsuit|default|bankruptcy|resigns?|resignation|acquisition|merger|takeover|guidance|profit warning|recall|sanctions?|regulatory|usfda|earnings|quarterly results|(?:quarter(?:ly)?|fiscal|annual|half[- ]year).{0,25}results|stock split|downgrad(?:e|es|ed)|upgrad(?:e|es|ed)|cuts? .{0,45}rating|dividend cut|cyberattack|data breach)\b',re.I)
SUFFIX=re.compile(r'\b(incorporated|inc|corporation|corp|limited|ltd|plc|holdings|holding|company|co|group|s a|n v|sa|nv|ag|se)\b',re.I)
def stamp(now=None):return datetime.fromtimestamp(time.time() if now is None else now,timezone.utc).isoformat()
def normal(value):return re.sub(r'[^a-z0-9]+',' ',unicodedata.normalize('NFKD',html.unescape(str(value))).encode('ascii','ignore').decode().lower().replace('&',' and ')).strip()
def identities(info):
 names=[]
 for field in ['longName','shortName']:
  raw=normal(info.get(field,''));name=' '.join(SUFFIX.sub(' ',raw).split())
  # Preserve legal names for short brands: Sea Limited, KLA Corporation and F5 Inc.
  for alias in ([name] if len(name)>=4 else [raw,name]):
   if len(alias)>=2 and alias not in names:names.append(alias)
 return names

def relevant(title,ticker,names):
 text=' '+normal(title)+' '
 if any(len(name)>=4 and ' '+name+' ' in text for name in names):return True
 context=re.search(r'\b(stock|shares?|earnings|revenue|quarter|profit|company|corporation|nasdaq|nyse|nse|dividend|guidance|acquisition|merger|semiconductor|cyberattack|data breach)\b',title,re.I)
 if context and any(len(name)<4 and ' '+name+' ' in text for name in names):return True
 symbol=ticker.removesuffix('.NS');quoted=re.escape(symbol)
 return bool(re.search(r'(?:\b(?:NASDAQ(?:GS|GM|CM)?|NYSE(?:AMERICAN)?|NSE|BSE)\s*:\s*|\$)'+quoted+r'(?![A-Z0-9])',title,re.I) or (ticker.endswith('.NS') and re.search(r'(?<![A-Z0-9])'+re.escape(ticker)+r'(?![A-Z0-9])',title,re.I)))

def safe_url(value,depth=0):
 try:
  if depth>1:return None
  u=urlparse(value)
  if u.hostname in ['bing.com','www.bing.com'] and u.path.lower().endswith('/apiclick.aspx'):
   target=parse_qs(u.query).get('url',[None])[0]
   return safe_url(target,depth+1) if target else None
  if u.scheme not in ['http','https'] or not u.hostname or u.username or u.password:return None
  # Do not fetch publisher links; only display them. Remove common tracking parameters.
  query={k:v for k,v in parse_qs(u.query).items() if not k.lower().startswith('utm_') and k not in ['guccounter','gucereferrer','gucereferrersig']}
  return urlunparse((u.scheme,u.netloc,u.path,u.params,urlencode(query,doseq=True),''))
 except (TypeError,ValueError):return None

def timestamp(value):
 if not isinstance(value,str):return None
 try:
  try:d=datetime.fromisoformat(value.replace('Z','+00:00'))
  except ValueError:d=parsedate_to_datetime(value)
  return d.timestamp() if d.tzinfo else None
 except (TypeError,ValueError,OverflowError):return None

def rss_url(source,ticker,names):
 if source==SOURCES[0]:return 'https://feeds.finance.yahoo.com/rss/2.0/headline?'+urlencode({'s':ticker,'region':'IN' if ticker.endswith('.NS') else 'US','lang':'en-US'})
 # Exact company name prevents ambiguous symbols such as AR, APP and T from matching ordinary words.
 if not names:raise ValueError('A verified company name is required for a search fallback.')
 query='"'+names[0]+'"'
 if source==SOURCES[1]:
  country='IN' if ticker.endswith('.NS') else 'US'
  return 'https://news.google.com/rss/search?'+urlencode({'q':query+' when:3d','hl':'en-'+country,'gl':country,'ceid':country+':en'})
 return 'https://www.bing.com/news/search?'+urlencode({'q':query,'format':'rss','mkt':'en-IN' if ticker.endswith('.NS') else 'en-US','qft':'interval="7"','count':100})

def fetch_rss(url,timeout=HTTP_TIMEOUT):
 with urlopen(Request(url,headers={'User-Agent':'Mozilla/5.0 (compatible; Arthapalana/1.0)','Accept':'application/rss+xml, application/xml, text/xml'}),timeout=timeout) as response:
  if response.status!=200:raise ValueError('News source returned an unsuccessful response.')
  body=response.read(MAX_BYTES+1)
  if len(body)>MAX_BYTES or b'<!DOCTYPE' in body.upper() or b'<!ENTITY' in body.upper():raise ValueError('Invalid or oversized news feed.')
  return body

def parse_rss(body,ticker,names,now):
 root=ET.fromstring(body)
 if root.tag!='rss' or root.find('channel') is None:raise ValueError('Response is not an RSS news feed.')
 channel=root.find('channel');items=channel.findall('item')
 if len(items)>200:raise ValueError('Feed exceeds the bounded review size.')
 articles=[];seen=set();invalid=0
 for item in items:
  title=' '.join(html.unescape(item.findtext('title') or '').split());publisher=item.findtext('source') or ''
  if publisher and title.endswith(' - '+publisher):title=title[:-len(' - '+publisher)]
  published=timestamp(item.findtext('pubDate'));url=safe_url(item.findtext('link'))
  if published is None or published>now+60 or not title or not url:invalid+=1;continue
  if now-published>WINDOW or not relevant(title,ticker,names):continue
  if re.search(r'stock price.*news.*quote.*history|stock forecasts$',title,re.I) or urlparse(url).hostname in ['github.com','www.github.com'] or ('yahoo.' in (urlparse(url).hostname or '') and urlparse(url).path.startswith('/quote/')):continue
  key=(normal(title),int(published)//3600)
  if key in seen:continue
  seen.add(key);articles.append({'title':title[:500],'url':url,'publishedAt':stamp(published),'publisher':publisher[:150]})
 # A dated, valid empty response to an exact company query is a completed search, not an outage.
 # Stale, malformed and unrelated-only responses cannot establish current company coverage.
 built=timestamp(channel.findtext('lastBuildDate'));empty=not items and bool(names) and built is not None and -60<=now-built<=1800
 if invalid or (not articles and not empty):raise ValueError('No usable current company coverage in this feed.')
 material=[a for a in articles if MATERIAL.search(a['title'])]
 if len(material)>15:raise ValueError('Too many material headlines to review within one bounded snapshot.')
 articles.sort(key=lambda a:(not bool(MATERIAL.search(a['title'])),-timestamp(a['publishedAt'])))
 return articles[:15],len(articles),empty

def news_check(ticker,info,now=None,fetcher=fetch_rss,deadline=None):
 now=time.time() if now is None else now;names=identities(info);attempts=[];empty_result=None
 for source in SOURCES:
  try:
   remaining=deadline-time.monotonic() if deadline is not None else HTTP_TIMEOUT
   if remaining<=0:raise TimeoutError('Review time budget ended.')
   articles,count,empty=parse_rss(fetcher(rss_url(source,ticker,names),timeout=min(HTTP_TIMEOUT,remaining)),ticker,names,now)
   if empty and source==SOURCES[0]:raise ValueError('Empty ticker feed; an independent company search is required.')
   attempts.append({'source':source,'status':'available'})
   result={'ok':True,'source':source,'checkedAt':stamp(now),'articlesMatched':count,'empty':empty,'attempts':attempts}
   if empty:empty_result=result;continue
   return result,articles
  except Exception as e:
   attempts.append({'source':source,'status':'unavailable','reason':str(e)[:180] if isinstance(e,ValueError) else type(e).__name__})
 if empty_result:return {**empty_result,'attempts':attempts},[]
 return {'ok':False,'source':None,'checkedAt':stamp(now),'articlesMatched':0,'empty':False,'attempts':attempts},[]

class BoundedSession(requests.Session):
 def __init__(self,deadline=None):super().__init__(impersonate='chrome');self.deadline=deadline
 def request(self,*args,**kwargs):
  remaining=self.deadline-time.monotonic() if self.deadline is not None else HTTP_TIMEOUT
  if remaining<=0:raise TimeoutError('Calendar time budget ended.')
  kwargs['timeout']=min(HTTP_TIMEOUT,remaining);return super().request(*args,**kwargs)

def calendar_check(info,now):
 notices=[];events=[]
 if not info or not info.get('symbol'):return {'ok':False,'source':'Yahoo Finance company calendar','checkedAt':stamp(now),'events':[]},['Company calendar unavailable; event coverage cannot be confirmed.']
 for field in ['earningsTimestamp','earningsTimestampStart','earningsTimestampEnd','exDividendDate']:
  value=info.get(field)
  if value is None:continue
  if isinstance(value,bool) or not isinstance(value,(int,float)) or not (0<value<253402300800):
   return {'ok':False,'source':'Yahoo Finance company calendar','checkedAt':stamp(now),'events':events},['Company calendar contains an invalid event date; buying waits for verification.']
  days=7 if field=='exDividendDate' else 14
  if 0<=value-now<=days*86400:
   date=datetime.fromtimestamp(value,timezone.utc).date().isoformat();notice=('Ex-dividend event within 7 days: ' if field=='exDividendDate' else 'Results expected within 14 days: ')+date
   if notice not in notices:notices.append(notice);events.append({'kind':'dividend' if field=='exDividendDate' else 'earnings','at':stamp(value)})
 return {'ok':True,'source':'Yahoo Finance company calendar','checkedAt':stamp(now),'events':events},notices

SESSION=BoundedSession()

def inspect(ticker,deadline=None,name_hint=None):
 info={}
 for attempt in range(2):
  if deadline is not None and time.monotonic()>=deadline:break
  try:
   obj=yf.Ticker(ticker,session=SESSION);info=obj.info or {}
   if info.get('symbol','').upper()==ticker.upper():break
   info={}
  except Exception:pass
 # A signed portfolio/discovery name can identify news even if the independent calendar fails.
 identity=info or ({'longName':name_hint} if isinstance(name_hint,str) else {})
 news,headlines=news_check(ticker,identity,deadline=deadline)
 calendar,issues=calendar_check(info,time.time())
 if not news['ok']:issues.insert(0,'All news sources unavailable or without usable company coverage; buying waits for a fresh check.')
 issues+=['Possible material news: '+h['title'] for h in headlines if MATERIAL.search(h['title'])]
 return {'ticker':ticker,'ok':news['ok'] and calendar['ok'],'coverageVersion':2,'news':news,'calendar':calendar,'issues':issues[:30],'headlines':headlines}

if __name__=='__main__':
 payload=json.load(sys.stdin);tickers=list(dict.fromkeys(payload.get('tickers',[])))[:250]
 if any(not re.fullmatch(r'[A-Z0-9.&-]{1,25}',t) for t in tickers):raise ValueError('Invalid ticker')
 deadline=time.monotonic()+210;SESSION.deadline=deadline
 hints=payload.get('companyNames',{})
 if not isinstance(hints,dict):hints={}
 with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:events=list(pool.map(lambda t:inspect(t,deadline,hints.get(t)),tickers))
 print(json.dumps({'events':events},allow_nan=False,separators=(',',':')))
