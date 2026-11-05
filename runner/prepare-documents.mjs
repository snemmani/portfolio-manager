/** Validate report evidence before spending tokens on the investment decision. */
export async function prepareAnnualDocuments({snapshot,createThread,runTurn,apply,prompt,schema,signal,log=()=>{},activity=()=>{}}){
 let current=snapshot,issues=[],reads=0;
 for(let attempt=0;attempt<2;attempt++){
  const pending=(current.annualDocumentEvidence||[]).filter(r=>r.status==='ready'&&r.summaryStatus!=='ready');if(!pending.length)return {...current,documentPreparationComplete:true};
  // Subscription calls are ephemeral. A repair receives the saved draft and
  // exact diagnostics in a fresh context; ephemeral sessions cannot resume.
  const thread=createThread();const turn=await runTurn(thread,prompt(current,issues),{outputSchema:schema([...pending].sort((a,b)=>b.period.localeCompare(a.period)).slice(0,3)),signal},{allowReports:true,log:event=>{log(event);activity({...event,...(event.documentReads!==undefined?{documentReads:reads+event.documentReads}:{})})}});reads+=turn.documentReads||0;
  const raw=JSON.parse(turn.finalResponse);if(!Array.isArray(raw.document_summaries)||!raw.document_summaries.length)throw Error('Annual-report verification stopped: no financial evidence summary was returned.');
  const accepted=await apply(raw.document_summaries);current=accepted.snapshot;issues=accepted.checks?.checks?.filter(c=>!c.valid)||[];
  log({event:'document_preparation',attempt:attempt+1,accepted:accepted.checks?.checks?.filter(c=>c.valid).length||0,pending:(current.annualDocumentEvidence||[]).filter(r=>r.status==='ready'&&r.summaryStatus!=='ready').length});
 }
 const pending=(current.annualDocumentEvidence||[]).filter(r=>r.status==='ready'&&r.summaryStatus!=='ready');const latest=new Map();for(const r of current.annualDocumentEvidence||[])if(!latest.has(r.ticker)||latest.get(r.ticker).period<r.period)latest.set(r.ticker,r);if(pending.some(r=>latest.get(r.ticker)?.id===r.id))throw Error('Annual-report verification stopped: '+(issues[0]?.errors?.[0]||'Some financial statement evidence still needs repair.'));
 return {...current,documentPreparationComplete:true};
}
