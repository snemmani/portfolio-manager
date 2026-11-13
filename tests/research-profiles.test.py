import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'runner'))
from research_profiles import nse_source_hints
class ProfileLinks(unittest.TestCase):
 def test_exact_primary_attachments(self):
  seen=[]
  def data(url):
   seen.append(url)
   if 'annual-reports?' in url:return {'data':[{'companyName':'BSE Limited','fromYr':'2025','toYr':'2026','fileName':'https://nsearchives.nseindia.com/annual_reports/report.pdf'},{'fileName':'https://evil.example/a.pdf'}]}
   return [{'symbol':'OTHER','desc':'Financial results','attchmntFile':'https://nsearchives.nseindia.com/corporate/wrong.pdf'},{'symbol':'BSE','attchmntText':'Financial results for the quarter','sort_date':'2026-11-04','attchmntFile':'https://nsearchives.nseindia.com/corporate/results.pdf'},{'symbol':'BSE','desc':'Investor Presentation','sort_date':'2026-11-04','attchmntFile':'https://nsearchives.nseindia.com/corporate/slides.pdf'}]
  hints=nse_source_hints('BSE.NS',data)
  self.assertEqual(len(seen),2);self.assertEqual([h['kind'] for h in hints],['annual_report','results','filing']);self.assertFalse(any('wrong' in h['url'] for h in hints));self.assertTrue(all('financialPeriod' not in h for h in hints),'Fiscal end dates are read from reports, never guessed from year labels')
 def test_symbol_encoding_and_bounded_failure(self):
  calls=[]
  def fail(url):calls.append(url);raise OSError('Synthetic outage')
  self.assertEqual(nse_source_hints('M&M.NS',fail),[]);self.assertEqual(len(calls),2);self.assertTrue(all('M%26M' in u for u in calls))
  for ticker in ['MSFT','bad/NS','ORCL','AAA.NS?secret=1']:self.assertEqual(nse_source_hints(ticker,fail),[])
  self.assertEqual(len(calls),2)
if __name__=='__main__':unittest.main()
