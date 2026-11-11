import {cardLines,signalAction} from '../lib/card-copy';
const H="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground";
export default function RecommendationCopy({reasons,risks,action}:{reasons:string[];risks:string[];action?:string}){
 const lines=cardLines(reasons),checks=cardLines(risks),headline=action?signalAction(action):lines[0],why=action?lines:lines.slice(1);
 return <div className="grid gap-3 text-[13px] leading-relaxed">
  {headline&&<div><h3 className={H}>Suggested action</h3><p className="font-medium">{headline}</p></div>}
  {why.length>0&&<div><h3 className={H}>Why</h3><div className="grid gap-1">{why.map((line,i)=><p key={i}>{line}</p>)}</div></div>}
  {checks.length>0&&<details className="text-xs text-muted-foreground"><summary className="cursor-pointer font-medium">Before you act</summary><div className="mt-1 grid gap-1">{checks.map((line,i)=><p key={i}>{line}</p>)}</div></details>}
 </div>;
}
