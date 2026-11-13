/** One price rule for the research gate, planning and presentation. A code estimate
 * alone is never a verified entry ceiling; the researched maximum must be usable. */
export function buyCeiling(researchedEntry:unknown,intrinsic:any,returnCeiling?:number|null){
 const positive=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>0;
 const maxEntry=positive(researchedEntry)?researchedEntry:null;
 const codeValue=positive(intrinsic?.value)?intrinsic.value as number:null;
 const codeBinding=codeValue!==null&&intrinsic?.binding!==false;
 const validReturn=positive(returnCeiling)?returnCeiling:null;
 return {maxEntry,codeValue,codeBinding,returnCeiling:validReturn,ceiling:maxEntry===null||returnCeiling!==undefined&&validReturn===null?null:Math.min(maxEntry,...(codeBinding?[codeValue!]:[]),...(returnCeiling===undefined?[]:[validReturn!]))};
}
/** An incomplete/rejected research estimate is never an approved ceiling for display. */
export function hasUsableBuyCeiling(check:any){
 return ['supported','valuation','return'].includes(check?.status)&&Number.isFinite(check?.valuation?.ceiling)&&check.valuation.ceiling>0;
}
