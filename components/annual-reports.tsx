'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {formatIST} from '../lib/time';
const label=(r:any)=>r.status==='processing'?'Preparing PDF':r.status==='needs_ocr'?'Searchable/OCR copy needed':r.status==='failed'?'PDF could not be prepared':r.summaryStatus==='ready'?'Summary cached':r.summaryStatus==='needs_review'?'Financial evidence needs repair':'Ready to summarise';
export default function AnnualReports({tickers=[],standalone=false,initialTicker=''}:{tickers?:string[];standalone?:boolean;initialTicker?:string}){
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
 return <details className="annual-report-library" open={standalone||undefined}><summary><strong>Annual report library</strong><span>{reports.length} saved · Upload PDFs & reuse summaries</span></summary><p>Reports anchor the business and accounting analysis. Current prices, market ratios and subsequent results still come from fresh internet data. PDFs stay in your local document library.</p><p>Each file is summarised once and cached by its content. Later reviews use a compact evidence pack and retrieve individual pages only when needed. Uploading a PDF does not start an AI run.</p>{!enabled?<p>The report library requires the local Docker document service.</p>:<><form className="report-upload-form" onSubmit={upload}><label>Stock symbol<input required list="report-tickers" placeholder="COFORGE.NS or ADBE" value={ticker} onChange={e=>setTicker(e.target.value)}/><datalist id="report-tickers">{[...new Set(tickers)].map(t=><option value={t} key={t}/>)}</datalist></label><label>Financial year ended<input required type="date" max={new Date().toISOString().slice(0,10)} value={period} onChange={e=>setPeriod(e.target.value)}/></label><label>Published on · optional<input type="date" max={new Date().toISOString().slice(0,10)} value={publishedAt} onChange={e=>setPublishedAt(e.target.value)}/></label><label className="report-file">Annual report PDF<input ref={input} required type="file" accept="application/pdf,.pdf" onChange={e=>setFile(e.target.files?.[0]||null)}/><small>Up to 200 MB · a searchable PDF is needed for page-cited research.</small></label><button className="button" disabled={!!busy||!file||!available} type="submit">{busy==='upload'?'Uploading…':'Upload report'}</button></form>{!available&&<div className="alert">The local report library is unavailable. Uploads and report-backed purchase checks will resume when it returns.</div>}<label className="report-filter">Find a saved report<input value={filter} onChange={e=>{setFilter(e.target.value);setShown(20)}} placeholder="Stock symbol or financial year"/></label>{visible.slice(0,shown).map(r=><article className="saved-report" key={r.id}><div><strong>{r.ticker} · Year ended {r.period}</strong><span className={'badge '+(r.summaryStatus==='ready'?'green':'amber')}>{label(r)}</span></div><p>{r.fileName} · {(r.size/1024/1024).toFixed(1)} MB{r.pageCount?` · ${r.pageCount} pages`:''} · Saved {formatIST(r.addedAt)}</p>{r.error&&<p>{r.error}</p>}{r.summaryErrors?.length>0&&<ul>{r.summaryErrors.map((error:string)=><li key={error}>{error}</li>)}</ul>}<div className="report-actions"><a className="button" href={'/api/annual-reports/'+r.id+'/download'}>Download PDF</a><button className="button" disabled={!!busy||r.status!=='ready'} onClick={()=>review(r.ticker)}>Review company</button>{r.summaryStatus==='ready'&&<button className="button" disabled={!!busy} onClick={()=>showSummary(r.id)}>View cached summary</button>}<button className="text-link" disabled={!!busy} onClick={()=>archive(r.id)}>Remove from active reports</button></div></article>)}{visible.length>shown&&<button className="button" onClick={()=>setShown(shown+20)}>Show 20 more reports</button>}{!visible.length&&<p>No saved reports match this view. Upload the relevant years, then request a company review.</p>}</>}{notice&&<div className="alert" role="status">{notice}</div>}{summary?.summary&&<section className="cached-report-summary"><h3>Cached summary · {summary.ticker} · {summary.period}</h3><p>{summary.summary.summary}</p><h4>Key findings</h4><ul>{summary.summary.highlights?.map((s:string)=><li key={s}>{s}</li>)}</ul><h4>Risks & evidence gaps</h4><ul>{[...(summary.summary.risks||[]),...(summary.summary.gaps||[])].map((s:string)=><li key={s}>{s}</li>)}</ul><h4>Page citations</h4><ul>{summary.summary.evidence?.map((e:any,i:number)=><li key={i}>PDF page {e.page}: {e.note}</li>)}</ul><small>Cached {formatIST(summary.summary.createdAt)}. This is an evidence summary; investment approval still requires the complete fundamental, valuation and current-market checks.</small><button className="button" onClick={()=>setSummary(null)}>Close summary</button></section>}</details>;
}
