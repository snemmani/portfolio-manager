/** Unknown cost or valuation must remain unknown, including in sorted return columns. */
export function holdingReturnPct(h:{invested:number|null;unrealised:number|null}){
 return Number.isFinite(h.invested)&&h.invested!>0&&Number.isFinite(h.unrealised)?h.unrealised!/h.invested!*100:null;
}
