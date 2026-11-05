"""Public issuer identity metadata only; never reads portfolio credentials."""
import concurrent.futures,json,re,sys
import yfinance as yf
def profile(ticker):
 try:
  info=yf.Ticker(ticker).get_info()
  website=info.get('website') or ''
  if website.startswith('http://'):website='https://'+website[7:]
  elif website and '://' not in website:website='https://'+website
  return {'ticker':ticker,'name':info.get('longName') or info.get('shortName') or ticker,'website':website}
 except Exception:return {'ticker':ticker,'name':ticker,'website':''}
if __name__=='__main__':
 raw=json.load(sys.stdin);tickers=raw.get('tickers',[])
 if len(tickers)>4 or any(not isinstance(t,str) or not re.fullmatch(r'[A-Z0-9.&-]{1,25}(?:\.NS|\.BO)?',t) for t in tickers):raise ValueError('Invalid research scope')
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:print(json.dumps({'profiles':list(pool.map(profile,tickers))}))
