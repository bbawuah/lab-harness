/** Independent local evidence only. Never supplies missing model confirmation. */
export async function observeFixture(browser:(args:string[])=>Promise<any>,origin:string){
 const response=await browser(['--json','get','text','#result']);
 const data=response?.data,lifecycle=data?.lifecycle;
 if(response?.success!==true||response.error!==null||data?.origin!==origin||typeof data?.text!=='string'||Buffer.byteLength(data.text)>1000||data.text.includes('[truncated:')||lifecycle?.reused!==true||lifecycle?.relaunchedBrowser!==false)throw new Error('FIXTURE_OBSERVATION_UNAVAILABLE');
 return {kind:'independent-local-fixture-observation',origin,text:data.text,notModelConfirmation:true};
}
