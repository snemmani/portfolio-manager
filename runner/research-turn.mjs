/** Observe public research progress without recording portfolio contents or model reasoning. */
export async function runResearchTurn(thread,prompt,options,{log=()=>{},allowReports=false}={}){
 const {events}=await thread.runStreamed(prompt,options);let finalResponse='',usage=null,webSearches=0,documentReads=0;
 for await(const event of events){
  if(event.type==='turn.failed'||event.type==='error')throw Error(event.error?.message||event.message||'Company research failed');
  const item=event.item;
  const permittedReport=allowReports&&item?.type==='mcp_tool_call'&&item.server==='annual_reports'&&['list_reports','search_reports','read_report_pages','read_cached_summary','read_public_document'].includes(item.tool);
  if(item&&(['command_execution','file_change'].includes(item.type)||item.type==='mcp_tool_call'&&!permittedReport))throw Error('Company research attempted a tool outside public web research; no report published.');
  if(event.type==='item.completed'&&permittedReport){documentReads++;log({event:'targeted_report_read',tool:item.tool,documentReads});}
  if(event.type==='item.completed'&&item?.type==='web_search'){webSearches++;log({event:'public_research_progress',webSearches});}
  if(event.type==='item.completed'&&item?.type==='agent_message')finalResponse=item.text;
  if(event.type==='turn.completed')usage=event.usage;
 }
 if(!finalResponse)throw Error('Company research returned no completed document.');
 return {finalResponse,usage,webSearches,documentReads};
}
