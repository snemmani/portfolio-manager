'use client';
import {useState,useMemo,useEffect} from 'react';
import {Activity,ArrowDownRight,ArrowUpRight,ArrowRight,BarChart3,Bell,Check,ChevronDown,ChevronRight,Clock,Download,ExternalLink,Eye,LayoutDashboard,LockKeyhole,RefreshCw,Search,Settings,ShieldCheck,SlidersHorizontal,Sparkles,Wallet,X,AlertTriangle,TrendingUp} from 'lucide-react';
import {money,compact,percent,date,badge,Spark,Markdown,HoldingsTable} from './shared';
import {useHoldings,useDiscovery,useAnalysis,queueResearch} from './view-data';
import type {ViewProps} from './types';
export default function View({data,portfolio,navigate,setSelected,showExecution}:ViewProps){
const holdings=useHoldings(data,portfolio);
const [search,setSearch]=useState(''),[filter,setFilter]=useState('All actions');const visible=holdings.filter((h:any)=>filter==='All actions'||h.action===filter);
const csv=()=>{const rows=[['Portfolio','Ticker','Shares','Price','Currency','Value INR','Weight %','Action','Quote time'],...visible.filter((h:any)=>(h.ticker+' '+h.sector+' '+h.portfolio).toLowerCase().includes(search.toLowerCase())).map((h:any)=>[h.portfolio,h.ticker,h.shares,h.price,h.currency,h.value,h.weight,h.action,date(h.quote?.time)])];const blob=new Blob([rows.map((r:any[])=>r.map(v=>'\"'+String(v??'').replaceAll('\"','\"\"')+'\"').join(',')).join('\n')],{type:'text/csv'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='arthapalana-holdings.csv';a.click();URL.revokeObjectURL(url)};
return <section className="panel holdings-panel"><div className="panel-heading"><h2>Open positions <span className="count">{visible.length}</span></h2><div className="table-tools"><label className="search"><Search size={15}/><input placeholder="Ticker, sector, portfolio…" value={search} onChange={e=>setSearch(e.target.value)}/></label><select value={filter} onChange={e=>setFilter(e.target.value)}><option>All actions</option>{[...new Set(holdings.map((h:any)=>h.action))].map((a:any)=><option key={a}>{a}</option>)}</select><button className="button" onClick={csv}><Download size={15}/>Export CSV</button></div></div><HoldingsTable holdings={holdings} setSelected={setSelected} search={search} filter={filter}/></section>;
}
