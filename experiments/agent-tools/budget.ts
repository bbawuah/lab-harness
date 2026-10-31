/** Admission units are serialized UTF-8 bytes + margin, NOT exact model tokens. */
export class Budget {
  requests=0; admissionUnits=0; inputTokens=0; outputTokens=0; usageReports=0;
  admit(payload: Record<string,unknown>) {
    const bounded={...payload,max_tokens:400};
    delete (bounded as Record<string,unknown>).max_completion_tokens;
    const units=Buffer.byteLength(JSON.stringify(bounded))+512;
    if(this.requests>=10 || this.admissionUnits+units>20000 || this.inputTokens>=20000 || this.outputTokens>=4000) throw new Error('BUDGET_REFUSED');
    this.requests++; this.admissionUnits+=units;
    return bounded;
  }
  observe(usage: {input?:number;output?:number;cacheRead?:number;cacheWrite?:number}) {
    const values=[usage.input,usage.output,usage.cacheRead??0,usage.cacheWrite??0];
    if(values.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0)||values.reduce((sum,v)=>sum+(v??0),0)===0||((usage.input??0)+(usage.cacheRead??0)+(usage.cacheWrite??0))===0) throw new Error('USAGE_UNAVAILABLE');
    this.inputTokens+=usage.input!+(usage.cacheRead??0)+(usage.cacheWrite??0);this.outputTokens+=usage.output!;this.usageReports++;
    if(this.inputTokens>20000 || this.outputTokens>4000) throw new Error('OBSERVED_TOKEN_BUDGET_EXCEEDED');
  }
}
