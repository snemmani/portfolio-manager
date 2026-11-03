import {spawnSync} from 'node:child_process';
import {Codex} from '@openai/codex-sdk';
import {fileURLToPath} from 'node:url';
const wrapper=fileURLToPath(new URL('./codex-subscription.sh',import.meta.url));
export function subscriptionEnvironment(source=process.env){
 const names=['HOME','PATH','USER','LOGNAME','LANG','LC_ALL','XDG_CONFIG_HOME','XDG_CACHE_HOME','XDG_DATA_HOME','XDG_RUNTIME_DIR','DBUS_SESSION_BUS_ADDRESS','GNOME_KEYRING_CONTROL','SSL_CERT_FILE','SSL_CERT_DIR','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy'];
 return Object.fromEntries(names.filter(k=>source[k]!==undefined).map(k=>[k,source[k]]));
}
export function verifySubscription(env=subscriptionEnvironment(),execute=spawnSync){
 let result;try{const r=execute(wrapper,['login','status'],{env,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:20000}); if(r.status!==0||r.error)throw Error('Login status failed'); result=String(r.stdout||'')+'\n'+String(r.stderr||'');}
 catch{throw Error('ChatGPT login unavailable. Run codex login on this machine. API fallback is disabled.');}
 if(!/^Logged in using ChatGPT\s*$/m.test(result)||/using an? API key/i.test(result))throw Error('Runner requires ChatGPT subscription authentication. API-key authentication is refused.');
 return 'chatgpt';
}
export function codexOptions(env=subscriptionEnvironment()){
 return {codexPathOverride:wrapper,env,config:{forced_login_method:'chatgpt',model_provider:'openai',features:{shell_tool:false,unified_exec:false,apps:false,plugins:false,hooks:false,multi_agent:false,browser_use:false,computer_use:false},mcp_servers:{}}};
}
export function newSubscriptionThread({model,workingDirectory},factory=options=>new Codex(options)){
 const env=subscriptionEnvironment();verifySubscription(env);
 const codex=factory(codexOptions(env));
 return codex.startThread({...(model?{model}:{}),workingDirectory,skipGitRepoCheck:true,sandboxMode:'read-only',approvalPolicy:'never',webSearchMode:'disabled',networkAccessEnabled:false,threadSource:'arthapalana-research'});
}
