"""Offline regression checks: independent RSS failover never bypasses event or calendar gates."""
import sys,unittest,time
from pathlib import Path
from datetime import datetime,timezone
from email.utils import format_datetime
from unittest.mock import patch
from xml.sax.saxutils import escape
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'runner'))
import events
NOW=datetime(2026,11,4,13,0,tzinfo=timezone.utc).timestamp()
def rss(titles=None,dates=None,build=None):
 titles=['Adobe launches a new product'] if titles is None else titles
 dates=dates or [NOW-100]*len(titles)
 items=''.join('<item><title>'+escape(t)+'</title><pubDate>'+format_datetime(datetime.fromtimestamp(d,timezone.utc))+'</pubDate><link>https://publisher.example/article'+str(i)+'</link><source>Publisher</source></item>' for i,(t,d) in enumerate(zip(titles,dates)))
 return ('<rss version="2.0"><channel><title>Company news</title>'+(('<lastBuildDate>'+format_datetime(datetime.fromtimestamp(build,timezone.utc))+'</lastBuildDate>') if build else '')+items+'</channel></rss>').encode()
INFO={'symbol':'ADBE','shortName':'Adobe Inc.','longName':'Adobe Inc.'}
class EventTests(unittest.TestCase):
 def news(self,fetcher,info=INFO,ticker='ADBE'):return events.news_check(ticker,info,NOW,fetcher=fetcher)
 def test_primary_rss_works_without_the_broken_yfinance_news_endpoint(self):
  calls=[]
  def fetch(url,**kw):calls.append(url);return rss()
  data,items=self.news(fetch);self.assertTrue(data['ok']);self.assertEqual(data['source'],'Yahoo Finance RSS');self.assertEqual(len(calls),1);self.assertEqual(len(items),1)
 def test_yahoo_outage_fails_over_to_google(self):
  def fetch(url,**kw):
   if 'yahoo.com' in url:raise TimeoutError()
   return rss(['Adobe announces acquisition'])
  data,items=self.news(fetch);self.assertTrue(data['ok']);self.assertEqual(data['source'],'Google News RSS');self.assertEqual(data['attempts'][0]['status'],'unavailable');self.assertTrue(events.MATERIAL.search(items[0]['title']))
 def test_google_outage_fails_over_to_bing(self):
  def fetch(url,**kw):
   if 'bing.com' not in url:raise OSError()
   return rss()
  self.assertEqual(self.news(fetch)[0]['source'],'Bing News RSS')
 def test_all_sources_fail_closed(self):
  def fail(*args,**kwargs):raise OSError()
  result,items=self.news(fail);self.assertFalse(result['ok']);self.assertEqual(items,[]);self.assertEqual(len(result['attempts']),3)
 def test_http200_html_is_not_coverage(self):self.assertFalse(self.news(lambda *a,**k:b'<html>Access denied</html>')[0]['ok'])
 def test_malformed_feed_is_not_coverage(self):self.assertFalse(self.news(lambda *a,**k:b'<rss>')[0]['ok'])
 def test_stale_headlines_fall_back(self):
  def fetch(url,**kw):return rss(dates=[NOW-73*3600]) if 'yahoo.com' in url else rss()
  self.assertEqual(self.news(fetch)[0]['source'],'Google News RSS')
 def test_future_or_undated_news_is_not_coverage(self):
  self.assertFalse(self.news(lambda *a,**k:rss(dates=[NOW+3600]))[0]['ok'])
  self.assertIsNone(events.timestamp(None));self.assertIsNone(events.timestamp('2026-11-04T13:00:00'))
 def test_a_recent_valid_empty_search_is_distinct_from_a_source_failure(self):
  result,items=self.news(lambda *a,**k:rss([],build=NOW-20));self.assertTrue(result['ok']);self.assertTrue(result['empty']);self.assertEqual(result['source'],'Bing News RSS');self.assertFalse(items)
  self.assertFalse(self.news(lambda *a,**k:rss([],build=NOW-3600))[0]['ok'])
  self.assertFalse(self.news(lambda *a,**k:rss([]))[0]['ok'])
 def test_unrelated_news_cannot_clear_an_ambiguous_symbol(self):
  info={'longName':'Antero Resources Corporation'}
  self.assertFalse(self.news(lambda *a,**k:rss(['AR glasses transform retail']),info,'AR')[0]['ok'])
  self.assertTrue(events.relevant('Antero Resources announces guidance','AR',events.identities(info)))
  self.assertFalse(events.relevant('A new app launches','APP',['applovin']))
  self.assertTrue(events.relevant('AppLovin reports earnings','APP',['applovin']))
  self.assertTrue(events.relevant('NYSE:AR quarterly results','AR',[]))
 def test_company_name_is_required_for_search_fallback(self):
  def fetch(url,**kw):raise OSError()
  self.assertFalse(self.news(fetch,{},'AR')[0]['ok'])
  with self.assertRaises(ValueError):events.rss_url('Google News RSS','AR',[])
 def test_legal_suffix_and_indian_identity(self):
  self.assertIn('criteo',events.identities({'longName':'Criteo S.A.'}))
  names=events.identities({'longName':'Mahindra & Mahindra Limited'})
  self.assertTrue(events.relevant('Mahindra & Mahindra reports quarterly results','M&M.NS',names))
  self.assertFalse(events.relevant('Mahindra Finance reports quarterly results','M&M.NS',names))
  self.assertIn('gl=IN',events.rss_url('Google News RSS','M&M.NS',names))
 def test_scan_full_feed_before_truncating_or_prioritizing_material_news(self):
  titles=['Adobe new product '+str(i) for i in range(25)]+['Adobe faces regulatory investigation']
  result,articles=self.news(lambda *a,**k:rss(titles));self.assertTrue(result['ok']);self.assertEqual(len(articles),15);self.assertIn('investigation',articles[0]['title'])
 def test_duplicates_and_publisher_suffix_normalize(self):
  items,count,empty=events.parse_rss(rss(['Adobe launches tools - Publisher','Adobe launches tools']), 'ADBE',['adobe'],NOW)
  self.assertEqual(count,1);self.assertEqual(items[0]['title'],'Adobe launches tools')
 def test_overflow_cannot_hide_material_events(self):self.assertFalse(self.news(lambda *a,**k:rss(['Adobe investigation '+str(i) for i in range(16)]))[0]['ok'])
 def test_material_keyword_coverage(self):
  for title in ['Company earnings','Company acquisition','Company regulatory investigation','Citi cuts Adobe rating on rising risk','Adobe downgraded by broker','Company dividend cut','CRITEO REPORTS THIRD QUARTER 2026 RESULTS','Fiscal Year Results Reveal Commercial Metals']:
   self.assertTrue(events.MATERIAL.search(title),title)
 def test_earnings_and_dividend_checks_are_independent_of_news_source(self):
  calendar,issues=events.calendar_check({**INFO,'earningsTimestamp':NOW+86400,'earningsTimestampStart':NOW+86400,'exDividendDate':NOW+2*86400},NOW)
  self.assertTrue(calendar['ok']);self.assertEqual(len(issues),2);self.assertEqual({e['kind'] for e in calendar['events']},{'earnings','dividend'})
 def test_missing_calendar_cannot_be_fixed_by_healthy_news(self):self.assertFalse(events.calendar_check({},NOW)[0]['ok'])
 def test_invalid_calendar_date_blocks(self):self.assertFalse(events.calendar_check({**INFO,'earningsTimestamp':'bad'},NOW)[0]['ok'])
 def test_past_calendar_dates_do_not_create_new_pauses(self):self.assertEqual(events.calendar_check({**INFO,'earningsTimestamp':NOW-1,'exDividendDate':NOW-10},NOW)[1],[])
 def inspect_with(self,info,news_ok=True):
  class Fake:pass
  fake=Fake();fake.info=info
  news={'ok':news_ok,'source':'Google News RSS' if news_ok else None,'checkedAt':events.stamp(),'attempts':[]}
  with patch.object(events.yf,'Ticker',lambda *a,**k:fake),patch.object(events,'news_check',lambda *a,**k:(news,[{'title':'Adobe announces acquisition','publishedAt':events.stamp(),'url':'https://example.com/a'}] if news_ok else [])):
   return events.inspect('ADBE')
 def test_fallback_does_not_remove_material_or_calendar_flags(self):
  data=self.inspect_with({**INFO,'earningsTimestamp':time.time()+86400});self.assertTrue(data['ok']);self.assertEqual(data['coverageVersion'],2);self.assertEqual(len(data['issues']),2)
 def test_top_level_ok_requires_both_checks(self):
  self.assertFalse(self.inspect_with({},True)['ok']);self.assertFalse(self.inspect_with(INFO,False)['ok'])
 def test_discovery_name_supports_news_during_calendar_outage_but_does_not_clear_it(self):
  class Fake:info={}
  def news(ticker,info,**kwargs):
   self.assertEqual(info['longName'],'Adobe Inc.');return ({'ok':True,'source':'Google News RSS'},[])
  with patch.object(events.yf,'Ticker',lambda *a,**k:Fake()),patch.object(events,'news_check',news):
   result=events.inspect('ADBE',name_hint='Adobe Inc.');self.assertTrue(result['news']['ok']);self.assertFalse(result['calendar']['ok']);self.assertFalse(result['ok'])
 def test_wrong_company_metadata_cannot_clear_calendar(self):self.assertFalse(self.inspect_with({**INFO,'symbol':'OTHER'})['calendar']['ok'])
 def test_review_deadline_never_skips_to_clear(self):
  data,_=events.news_check('ADBE',INFO,NOW,fetcher=lambda *a,**k:rss(),deadline=time.monotonic()-1);self.assertFalse(data['ok'])
 def test_empty_yahoo_feed_cannot_silently_skip_independent_company_search(self):
  def fetch(url,**kw):return rss([],build=NOW) if 'yahoo.com' in url else rss(['Adobe faces regulatory investigation'])
  result,items=self.news(fetch);self.assertEqual(result['source'],'Google News RSS');self.assertIn('investigation',items[0]['title'])
 def test_short_company_brands_retain_exact_search_identity(self):
  for name,ticker,title in [('Sea Limited','SE','Sea stock earnings rise'),('KLA Corporation','KLAC','KLA shares rise after earnings'),('F5 Inc.','FFIV','F5 stock reports earnings')]:
   names=events.identities({'longName':name});self.assertTrue(names);self.assertGreaterEqual(len(names[0]),4);self.assertTrue(events.relevant(title,ticker,names))
  self.assertFalse(events.relevant('Sea levels rise in the Atlantic','SE',events.identities({'longName':'Sea Limited'})))
 def test_quote_pages_and_indexed_repository_pages_are_not_news(self):
  self.assertFalse(self.news(lambda *a,**k:rss(['Adobe Stock Price, News, Quote & History']))[0]['ok'])
  self.assertFalse(self.news(lambda *a,**k:rss(['Adobe Stock Forecasts']))[0]['ok'])
 def test_bing_redirect_resolves_to_publisher_without_fetching_it(self):
  self.assertEqual(events.safe_url('http://www.bing.com/news/apiclick.aspx?url=https%3A%2F%2Fpublisher.example%2Fnews'),'https://publisher.example/news')
 def test_urls_cannot_inject_schemes_credentials_or_tracking(self):
  self.assertIsNone(events.safe_url('javascript:alert(1)'));self.assertIsNone(events.safe_url('https://user:password@example.com'))
  self.assertEqual(events.safe_url('https://example.com/a?utm_source=feed&article=1#top'),'https://example.com/a?article=1')
if __name__=='__main__':unittest.main()
