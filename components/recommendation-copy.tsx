import {cardLines,signalAction} from '../lib/card-copy';
export default function RecommendationCopy({reasons,risks,action}:{reasons:string[];risks:string[];action?:string}){
 const lines=cardLines(reasons),checks=cardLines(risks),headline=action?signalAction(action):lines[0],why=action?lines:lines.slice(1);
 return <div className="card-copy">{headline&&<div><h3>Suggested action</h3><p>{headline}</p></div>}{why.length>0&&<div><h3>Why</h3>{why.map((line,i)=><p key={i}>{line}</p>)}</div>}{checks.length>0&&<details className="research-risks"><summary>Before you act</summary>{checks.map((line,i)=><p key={i}>{line}</p>)}</details>}</div>;
}
