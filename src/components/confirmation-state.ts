export type ConfirmationOptions={title:string;message:string;confirmLabel?:string;danger?:boolean};
export type ConfirmationRequest=ConfirmationOptions&{resolve:(value:boolean)=>void};
let receive:((request:ConfirmationRequest)=>void)|null=null;
let open=false;
const pending=new Map<string,Promise<boolean>>();
export const confirmationIsOpen=()=>open;
export function registerConfirmation(handler:((request:ConfirmationRequest)=>void)|null){receive=handler;}
export function setConfirmationOpen(value:boolean){open=value;if(typeof window!=="undefined")window.dispatchEvent(new Event("formward-confirmation-change"));}
/** 应用操作统一异步确认；浏览器离开保护仍由 beforeunload 提供。 */
export function confirmAction(options:ConfirmationOptions):Promise<boolean>{
 if(!receive)return Promise.resolve(false);
 const key=JSON.stringify(options),existing=pending.get(key);if(existing)return existing;
 const result=new Promise<boolean>(resolve=>receive?.({...options,resolve}));pending.set(key,result);void result.finally(()=>pending.delete(key));return result;
}
