/** Translate known legacy wording without changing recommendations or their numbers. */
export function cardText(input:string){
 return String(input)
 .replace(/(?:the )?dashboard calculates? (?:the )?(?:share )?quantit(?:y|ies)[^.!?]*(?:[.!?]|$)/gi,'')
 .replace(/(?:share )?quantities are calculated by the dashboard[.!]?/gi,'')
 .replace(/Partial[- ]trim review proposal within 2 weeks toward the supplied 15% cap: current weight is ([\d.]+)%\.?/gi,'Consider reducing this holding from $1% toward the 15% portfolio limit over the next two weeks.')
 .replace(/Is this too early\?\s*Partial trim only\s*[—–-]\s*concentration is verified, while recent lots are flagged\.?/gi,'Some shares were bought recently. Sell only the portion above the portfolio limit and keep the rest.')
 .replace(/Is this too early\?\s*Yes\s*[—–-]\s*/gi,'')
 .replace(/Is this too early\?\s*No\s*[—–-]\s*/gi,'')
 .replace(/Is this too early\?\s*/gi,'')
 .replace(/Non-discretionary ESPP holding: no trade proposed\.?/gi,'Keep this employer share-plan holding. It is excluded from rebalancing.')
 .replace(/HOLD \(non-discretionary\)\.?\s*/gi,'')
 .replace(/The ([A-Za-z]+ \d{1,2}(?:,? \d{4})?) oldest date and recent flag require lot-date reconciliation; no full exit or accounting allegation is supported\.?/gi,'Check the purchase dates before selling: the oldest purchase is dated $1, and some shares are marked as recently bought. The available information does not justify selling the entire holding or concluding that the accounts are misleading.')
 .replace(/cash conversion(?: ratio)?\s+(?:of |is |at )?(-?\d+(?:\.\d+)?)/gi,'operating cash flow of $1 times reported profit')
 .replace(/debt\/equity\s+(?:of |is |at )?(\d+(?:\.\d+)?)/gi,(_,v)=>`debt equal to ${Number((Number(v)*100).toFixed(2))}% of shareholder equity`)
 .replace(/P\/E (\d+(?:\.\d+)?) does not independently establish upside/gi,'a price-to-earnings ratio of $1 alone does not show that the stock is undervalued')
 .replace(/support retaining exposure/gi,'support keeping the remaining shares')
 .replace(/recent lots/gi,'recently purchased shares')
 .replace(/lot-date reconciliation/gi,'a check of the purchase dates')
 .replace(/cash-flow reconciliation/gi,'the difference between cash flow and reported profit')
 .replace(/supplied (?:data|evidence|snapshot)/gi,'available information')
 .replace(/declarative purchase gates/gi,'requirements for buying')
 .replace(/retain the deterministic signal and review the evidence/gi,'check the holding details before making a decision')
 .replace(/\s+/g,' ').trim().replace(/^([a-z])/,c=>c.toUpperCase()).replace(/([.!?]\s+)([a-z])/g,(_,space,c)=>space+c.toUpperCase());
}
export function cardLines(lines:string[]=[]){return [...new Set(lines.map(cardText).filter(Boolean))];}
export function supportLabel(confidence:string){return ({low:'Needs more checking',medium:'Some checks incomplete',high:'Stronger research support',Limited:'Limited information','Rule-based':'Portfolio limit exceeded',Screened:'Financial evidence available'} as Record<string,string>)[confidence]||confidence;}

export function signalAction(action:string){return ({Buy:'Consider buying more within the portfolio limits once the technical plan is ready.','Profit review':'Review a partial profit-taking sale. A gain alone is not a reason to sell.',Trim:'Consider selling the portion above the 15% portfolio limit.','Trim review':'Check the financial concerns before deciding whether to reduce this holding.','Exit review':'Check the financial concerns before deciding whether to sell this holding.','Add candidate':'Check whether buying more fits your portfolio and the company’s outlook.',Hold:'Keep your current holding.',Watch:'Wait for more information before changing this holding.',Review:'Check the missing or conflicting information before trading.',Locked:'Keep this employer share-plan holding. It is excluded from rebalancing.'} as Record<string,string>)[action]||'Review this holding before making a change.';}
