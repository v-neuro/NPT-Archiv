export function validPdfReady(event,frameWindow,pending){
  return Boolean(pending&&!pending.connected&&event.origin==='null'&&event.source===frameWindow&&event.data?.type==='npt-pdf-ready'&&event.data.token===pending.token&&event.ports?.length===1);
}
export function validPdfStatus(data){
  return data?.type==='status'&&typeof data.text==='string'&&data.text.length<=200&&Number.isInteger(data.width)&&data.width>=0&&data.width<=2000;
}
