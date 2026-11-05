'use client';
import {useState,useMemo,useEffect} from 'react';
import {Activity,ArrowDownRight,ArrowUpRight,ArrowRight,BarChart3,Bell,Check,ChevronDown,ChevronRight,Clock,Download,ExternalLink,Eye,LayoutDashboard,LockKeyhole,RefreshCw,Search,Settings,ShieldCheck,SlidersHorizontal,Sparkles,Wallet,X,AlertTriangle,TrendingUp} from 'lucide-react';
import {money,compact,percent,date,badge,Spark,Markdown,HoldingsTable} from './shared';
import {useHoldings,useDiscovery,useAnalysis,queueResearch} from './view-data';
import type {ViewProps} from './types';
export default function View({data,portfolio,navigate,setSelected,showExecution}:ViewProps){
const holdings=useHoldings(data,portfolio);
return <section className="panel"><div className="panel-heading"><div><h2>Recent ledger activity</h2><p>{data.recordCount} records in NocoDB · latest 30 records shown</p></div><span className="badge gray">READ ONLY</span></div><div className="table-scroll"><table><thead><tr>{['Date','Portfolio','Ticker','Type','Shares','Recorded cost','Note'].map(s=><th key={s}>{s}</th>)}</tr></thead><tbody>{data.recent.filter((r:any)=>portfolio==='All portfolios'||r.Portfolio===portfolio).map((r:any)=><tr key={r.Id}><td>{r.Date}</td><td>{r.Portfolio}</td><td><strong>{r.Ticker}</strong></td><td><span className={'badge '+(r.TransactionType==='Buy'||r.TransactionType==='Deposit'?'green':'amber')}>{r.TransactionType}</span></td><td>{r.NoOfShares}</td><td>{money(r.CostPerShare,r.Ticker==='CASH'||r.Ticker.endsWith('.NS')||r.Ticker.endsWith('.BO')?'INR':'USD')}</td><td>{r.Note||'—'}</td></tr>)}</tbody></table></div></section>;
}
