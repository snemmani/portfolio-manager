'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {formatIST} from '../lib/time';
import {ReportCard} from './report-evidence';
const label=(r:any)=>r.status==='processing'?'Preparing PDF':r.status==='needs_ocr'?'Searchable/OCR copy needed':r.status==='failed'?'PDF could not be prepared':r.summaryStatus==='ready'?'Summary cached':r.summaryStatus==='needs_review'?'Financial evidence needs repair':'Ready to summarise';
export default function AnnualReports({tickers=[],standalone=false,initialTicker='',statementsFor}:{tickers?:string[];standalone?:boolean;initialTicker?:string;statementsFor?:(ticker:string)=>any}){
 const [reports,setReports]=useState<any[]>([]),[available,setAvailable]=useState(true),[enabled,setEnabled]=useState(true),[ticker,setTicker]=useState(initialTicker),[period,setPeriod]=useState(''),[publishedAt,setPublishedAt]=useState(''),[file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(''),[notice,setNotice]=useState(''),[summary,setSummary]=useState<any>(null),[filter,setFilter]=useState(initialTicker);
 const [shown,setShown]=useState(20);
 const input=useRef<HTMLInputElement>(null),revision=useRef<string|null>(null);
 const load=useCallback(async()=>{try{const r=await fetch('/api/annual-reports'),d:any=await r.json();setAvailable(r.ok&&d.available!==false);setEnabled(d.enabled!==false);if(r.ok){setReports(d.reports||[]);if(revision.current&&revision.current!==d.revision)window.dispatchEvent(new Event('arthapalana-report-change'));revision.current=d.revision;}}catch{setAvailable(false)}},[]);
 useEffect(()=>{load()},[load]);
 const processing=reports.some(r=>r.status==='processing');useEffect(()=>{const timer=setInterval(load,processing?2500:30000);return()=>clearInterval(timer)},[load,processing]);
 async function upload(e:React.FormEvent){
  e.preventDefault();
  if(!file||busy)return;
  if(file.size>200*1024*1024){setNotice('Choose a PDF up to 200 MB.');return;}
  setBusy('upload');setNotice('');
  try{
   const CHUNK_SIZE=25*1024*1024;
   let d:any;
   if(file.size<=CHUNK_SIZE){
    const query=new URLSearchParams({ticker:ticker.trim().toUpperCase(),period,fileName:file.name});
    if(publishedAt)query.set('publishedAt',publishedAt);
    const r=await fetch('/api/annual-reports?'+query,{method:'POST',headers:{'Content-Type':'application/pdf'},body:file});
    const text=await r.text();
    try{d=JSON.parse(text);}catch{throw Error(r.status===413?'The PDF exceeds the network gateway limit (HTTP 413).':`Upload returned an unexpected response (HTTP ${r.status}).`);}
    if(!r.ok)throw Error(d.error||'Upload failed.');
   }else{
    const uploadId=(typeof crypto!=='undefined'&&crypto.randomUUID)?crypto.randomUUID():Math.random().toString(36).slice(2)+Date.now().toString(36);
    const totalChunks=Math.ceil(file.size/CHUNK_SIZE);
    for(let i=0;i<totalChunks;i++){
     const start=i*CHUNK_SIZE,end=Math.min(file.size,start+CHUNK_SIZE);
     const chunk=file.slice(start,end),pct=Math.round(((i+1)/totalChunks)*100);
     setNotice(`Uploading report in parts (${i+1} of ${totalChunks}, ${pct}%)…`);
     const query=new URLSearchParams({uploadId,index:String(i),total:String(totalChunks),ticker:ticker.trim().toUpperCase(),period,fileName:file.name});
     if(publishedAt)query.set('publishedAt',publishedAt);
     const r=await fetch('/api/annual-reports/chunk?'+query,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:chunk});
     const text=await r.text();
     try{d=JSON.parse(text);}catch{throw Error(r.status===413?'Part exceeds network gateway limit (HTTP 413).':`Part ${i+1} failed (HTTP ${r.status}).`);}
     if(!r.ok)throw Error(d.error||`Part ${i+1} failed.`);
    }
   }
   setNotice(d.report?.duplicate?'This exact report is already saved. Its cached summary will be reused.':'PDF saved. Preparation does not call AI; use Review company to request the analysis.');
   setFile(null);
   if(input.current)input.current.value='';
   await load();
   window.dispatchEvent(new Event('arthapalana-report-change'));
  }catch(e:any){
   setNotice(e.message||'The PDF could not be uploaded.');
  }finally{
   setBusy('');
  }
 }
 async function review(symbol:string){setBusy(symbol);setNotice('');try{const r=await fetch('/api/analysis',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticker:symbol})}),d:any=await r.json();setNotice(d.message||d.error);if(r.ok)window.dispatchEvent(new Event('arthapalana-research-change'));}catch{setNotice('Company research could not be queued.')}finally{setBusy('')}}
 async function showSummary(id:string){setBusy(id);try{const r=await fetch('/api/annual-reports/'+id+'/summary'),d:any=await r.json();if(!r.ok)throw Error(d.error);setSummary(d.report);}catch(e:any){setNotice(e.message||'The cached summary is unavailable.')}finally{setBusy('')}}
 async function archive(id:string){setBusy(id);try{const r=await fetch('/api/annual-reports/'+id,{method:'DELETE'}),d:any=await r.json();if(!r.ok)throw Error(d.error);setNotice('Report removed from active research. Any investment case that used it needs a fresh review.');if(summary?.id===id)setSummary(null);await load();}catch(e:any){setNotice(e.message||'The report could not be removed.')}finally{setBusy('')}}
 const visible=reports.filter(r=>(r.ticker+' '+r.period+' '+r.title).toLowerCase().includes(filter.toLowerCase()));
 const tone=(r:any)=>r.status==='failed'||r.status==='needs_ocr'?'border-loss/30 bg-loss-soft text-loss':r.summaryStatus==='ready'?'border-gain/30 bg-gain-soft text-gain':r.summaryStatus==='needs_review'?'border-warn/30 bg-warn-soft text-warn':'border-line text-muted-foreground';
 return <div className="grid gap-3 text-xs leading-relaxed">
  {!enabled?<p className="text-muted-foreground">The report library needs the local Docker document service.</p>:<div className="grid items-start gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
   <form onSubmit={upload} className="grid gap-3 rounded-md border border-line bg-panel p-3">
    <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Add a report</h3>
    <label className="grid gap-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Stock symbol<input required list="report-tickers" placeholder="COFORGE.NS or ADBE" value={ticker} onChange={e=>setTicker(e.target.value)} className="h-8 rounded-md border border-line bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring font-mono normal-case tracking-normal"/><datalist id="report-tickers">{[...new Set(tickers)].map(t=><option value={t} key={t}/>)}</datalist></label>
    <div className="grid grid-cols-2 gap-2"><label className="grid gap-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Year ended<input required type="date" max={new Date().toISOString().slice(0,10)} value={period} onChange={e=>setPeriod(e.target.value)} className="h-8 rounded-md border border-line bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring font-mono"/></label><label className="grid gap-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Published<input type="date" max={new Date().toISOString().slice(0,10)} value={publishedAt} onChange={e=>setPublishedAt(e.target.value)} className="h-8 rounded-md border border-line bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring font-mono"/></label></div>
    <label className="grid gap-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Annual report PDF<input ref={input} required type="file" accept="application/pdf,.pdf" onChange={e=>setFile(e.target.files?.[0]||null)} className="text-xs normal-case tracking-normal text-foreground file:mr-2 file:h-7 file:rounded-md file:border file:border-line file:bg-raised file:px-2 file:text-xs file:text-foreground"/><span className="normal-case tracking-normal">Up to 200 MB · a searchable PDF is needed for page-cited research.</span></label>
    <button className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50" disabled={!!busy||!file||!available} type="submit">{busy==='upload'?'Uploading…':'Upload report'}</button>
    <p className="text-[11px] text-muted-foreground">Each file is summarised once and cached by its content; later reviews read the cache and fetch specific pages only when needed. Uploading does not start an AI run. PDFs stay in your local library, with an off-machine copy in R2.</p>
    {!available&&<p className="rounded-md border border-warn/40 bg-warn-soft px-2 py-1.5 text-warn">The local report library is unavailable. Uploads and report-backed checks resume when it returns.</p>}
   </form>
   <div className="grid min-w-0 gap-2">
    <div className="flex flex-wrap items-center gap-2"><h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-0">Saved reports <span className="font-mono">{reports.length}</span></h3><input value={filter} onChange={e=>{setFilter(e.target.value);setShown(20)}} placeholder="Symbol or year…" aria-label="Find a saved report" className="ml-auto h-7 w-48 rounded-md border border-line bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"/></div>
    <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-panel">{visible.slice(0,shown).map(r=><li key={r.id} className="grid gap-1.5 px-3 py-2.5"><div className="flex flex-wrap items-center gap-2"><strong className="font-mono text-[13px]">{r.ticker.replace(/\.(NS|BO)$/,'')}</strong><span className="font-mono text-muted-foreground">FY ended {r.period}</span><span className={'inline-flex h-5 items-center rounded-sm border px-1.5 text-[11px] font-semibold '+tone(r)}>{label(r)}</span></div><p className="truncate text-muted-foreground" title={r.fileName}>{r.fileName} · <span className="font-mono">{(r.size/1024/1024).toFixed(1)} MB{r.pageCount?` · ${r.pageCount} pages`:''}</span> · saved {formatIST(r.addedAt)}</p>{r.error&&<p className="text-loss">{r.error}</p>}{r.summaryErrors?.length>0&&<ul className="grid list-disc gap-0.5 pl-4 text-warn">{r.summaryErrors.map((error:string)=><li key={error}>{error}</li>)}</ul>}<div className="flex flex-wrap items-center gap-2"><a className="inline-flex h-7 items-center justify-center rounded-md border border-line px-2.5 text-xs font-medium hover:bg-hover disabled:opacity-50" href={'/api/annual-reports/'+r.id+'/download'}>PDF</a><button className="inline-flex h-7 items-center justify-center rounded-md border border-line px-2.5 text-xs font-medium hover:bg-hover disabled:opacity-50" disabled={!!busy||r.status!=='ready'} onClick={()=>review(r.ticker)}>Review company</button>{(r.summaryStatus==='ready'||r.summaryStatus==='needs_review')&&<button className="inline-flex h-7 items-center justify-center rounded-md border border-line px-2.5 text-xs font-medium hover:bg-hover disabled:opacity-50" disabled={!!busy} onClick={()=>showSummary(r.id)}>{r.summaryStatus==='ready'?'Report card':'See what failed'}</button>}<button className="ml-auto text-[11px] text-muted-foreground hover:text-loss disabled:opacity-50" disabled={!!busy} onClick={()=>archive(r.id)}>Remove</button></div></li>)}{!visible.length&&<li className="px-3 py-6 text-center text-muted-foreground">No saved reports match. Upload the relevant years, then request a company review.</li>}</ul>
    {visible.length>shown&&<button className="inline-flex h-7 items-center justify-center rounded-md border border-line px-2.5 text-xs font-medium hover:bg-hover disabled:opacity-50 justify-self-start" onClick={()=>setShown(shown+20)}>Show 20 more</button>}
   </div>
  </div>}
  {notice&&<p className="rounded-md border border-brand/40 bg-brand-soft px-3 py-2" role="status">{notice}</p>}
  {summary&&<ReportCard report={summary} statements={statementsFor?.(summary.ticker)} autoload onClose={()=>setSummary(null)}/>}
 </div>;
}
