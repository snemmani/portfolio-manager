'use client';
import {useEffect,useSyncExternalStore} from 'react';
import {apiResource,EMPTY_RESOURCE,invalidateResources} from './resource-store';
const serverSnapshot=()=>EMPTY_RESOURCE;const noSubscribe=()=>()=>{};
export function useApi(path:string,{enabled=true,interval=60000,timeout=45000,staleTime=1000}:{enabled?:boolean;interval?:number|((data:any)=>number);timeout?:number;staleTime?:number}={}){
 const resource=apiResource(path),snapshot=useSyncExternalStore(enabled?resource.subscribe:noSubscribe,resource.getSnapshot,serverSnapshot);
 const pollInterval=typeof interval==='function'?interval(snapshot.data):interval;
 useEffect(()=>{if(!enabled)return;let stopped=false,timer:ReturnType<typeof setTimeout>;let failures=0;
 const run=async(force=false)=>{clearTimeout(timer);if(stopped||document.hidden)return;await resource.refresh(force,timeout,staleTime);failures=resource.getSnapshot().error?failures+1:0;if(stopped||document.hidden)return;const base=pollInterval;if(base||failures)timer=setTimeout(()=>run(),Math.min(120000,(base||15000)*Math.pow(2,Math.min(3,failures))));};
 const visible=()=>{if(!document.hidden)void run(true);else clearTimeout(timer)};void run();document.addEventListener('visibilitychange',visible);return()=>{stopped=true;clearTimeout(timer);document.removeEventListener('visibilitychange',visible)};
 },[resource,enabled,pollInterval,timeout,staleTime]);
 return {...snapshot,refresh:()=>resource.refresh(true,timeout)};
}
if(typeof window!=='undefined'){
 const financial=()=>invalidateResources(['/api/portfolio','/api/discovery','/api/analysis']);
 window.addEventListener('arthapalana-trade-change',financial);window.addEventListener('arthapalana-report-change',financial);
 window.addEventListener('arthapalana-research-change',()=>invalidateResources(['/api/research/status']));
}
