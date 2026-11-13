"""Business identity shared with the server; a broad sector never selects a lender model."""
import json,re
from pathlib import Path
CATALOG=json.loads((Path(__file__).resolve().parents[1]/'lib'/'business-models.json').read_text())
def business_kind(ticker,industry='',sector=''):
 if ticker in CATALOG['overrides']:return CATALOG['overrides'][ticker]
 for pattern,kind in CATALOG['industryRules']:
  if re.search(pattern,industry or '',re.I):return kind
 return 'unclassified-financial' if sector in ['Financials','Financial Services'] else 'operating'
