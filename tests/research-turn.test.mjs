import assert from 'node:assert/strict';import {runResearchTurn} from '../runner/research-turn.mjs';
const thread=events=>({runStreamed:async()=>({events:(async function*(){yield* events})()})});let logs=[];
const result=await runResearchTurn(thread([{type:'item.completed',item:{type:'reasoning',text:'Private reasoning must not be logged'}},{type:'item.completed',item:{type:'web_search',query:'Issuer annual reports'}},{type:'item.completed',item:{type:'agent_message',text:'{"fundamental_reviews":[]}'}},{type:'turn.completed',usage:{input_tokens:10,output_tokens:20}}]),'research',{}, {log:e=>logs.push(e)});
assert.equal(result.webSearches,1);assert.equal(JSON.parse(result.finalResponse).fundamental_reviews.length,0);assert(!JSON.stringify(logs).includes('Private reasoning'));assert.equal(result.usage.output_tokens,20);
for(const type of ['command_execution','file_change','mcp_tool_call'])await assert.rejects(()=>runResearchTurn(thread([{type:'item.started',item:{type}}]),'',{}),/outside public web/);
await assert.rejects(()=>runResearchTurn(thread([{type:'turn.failed',error:{message:'Provider unavailable'}}]),'',{}),/Provider unavailable/);
await assert.rejects(()=>runResearchTurn(thread([]),'',{}),/no completed document/);
console.log('PASS: streamed public-research progress, final output/usage capture, no reasoning/portfolio logging, prohibited-tool rejection and explicit provider/incomplete-document failures.');

const reportTurn=await runResearchTurn(thread([{type:'item.completed',item:{type:'mcp_tool_call',server:'annual_reports',tool:'read_cached_summary'}},{type:'item.completed',item:{type:'agent_message',text:'{}'}}]),'',{},{allowReports:true});assert.equal(reportTurn.documentReads,1);
for(const item of [{type:'mcp_tool_call',server:'other_server',tool:'read_cached_summary'},{type:'mcp_tool_call',server:'annual_reports',tool:'write_file'}])await assert.rejects(()=>runResearchTurn(thread([{type:'item.started',item}]),'',{},{allowReports:true}),/outside public web/);
