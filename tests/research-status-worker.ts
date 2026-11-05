import {analysisHandler,runnerHandler,researchStatusHandler} from '../lib/ai';
import {withRequestCache} from '../lib/request-cache';
export default {fetch(request:Request,env:any){return withRequestCache(()=>new URL(request.url).pathname==='/status'?researchStatusHandler(request,env):new URL(request.url).pathname==='/runner'?runnerHandler(request,env):analysisHandler(request,env))}};
