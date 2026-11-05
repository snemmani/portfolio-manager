'use client';
import {useEffect,useState} from 'react';
import AnnualReports from '../annual-reports';
export default function ReportsView(){const [ticker,setTicker]=useState<string|null>(null);useEffect(()=>{setTicker(new URL(location.href).searchParams.get('ticker')||'')},[]);return <section className="panel report-library-page"><div className="panel-heading"><div><h2>Annual reports & company evidence</h2><p>One company library supports every portfolio, holding review, recommendation and cash plan. Add a report once; its cached, page-cited findings are reused throughout the app.</p></div></div>{ticker!==null&&<AnnualReports standalone initialTicker={ticker} tickers={ticker?[ticker]:[]}/>}</section>}
