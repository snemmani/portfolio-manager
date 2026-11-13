/** Stable identity of the model actually supplied to the researcher. Quotes are excluded.
 * @param {any} model */
export function codeModelKey(model){
 if(!model)return null;
 // A converted value moves with every FX tick; the statement-currency value identifies the model.
 return JSON.stringify({value:model.statementValue??model.value??null,...(model.statementCurrency?{statementCurrency:model.statementCurrency}:{}),currency:model.currency??null,binding:model.binding!==false,inputs:Object.fromEntries(Object.entries(model.inputs||{}).sort(([a],[b])=>a.localeCompare(b)))});
}
