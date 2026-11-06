export type Appearance="system"|"light"|"dark";
export const appearanceBootstrap=`try{var a=localStorage.getItem("formward-theme");a=a==="light"||a==="system"?a:"dark";document.documentElement.dataset.appearance=a;document.documentElement.dataset.theme=a==="system"?(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):a}catch{document.documentElement.dataset.theme="dark"}`;
export const appearanceSnapshot=():Appearance=>{const value=document.documentElement.dataset.appearance;return value==="system"||value==="light"?value:"dark";};
export const appearanceServerSnapshot=():Appearance=>"dark";
function apply(value:Appearance){document.documentElement.dataset.appearance=value;document.documentElement.dataset.theme=value==="system"?(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):value;}
export function subscribeAppearance(notify:()=>void){
 const storage=(event:StorageEvent)=>{if(event.key!=="formward-theme")return;apply(event.newValue==="light"||event.newValue==="system"?event.newValue:"dark");notify();};
 const media=matchMedia("(prefers-color-scheme: light)"),system=()=>{if(appearanceSnapshot()==="system"){apply("system");notify();}};
 window.addEventListener("formward-theme-change",notify);window.addEventListener("storage",storage);media.addEventListener("change",system);
 return()=>{window.removeEventListener("formward-theme-change",notify);window.removeEventListener("storage",storage);media.removeEventListener("change",system);};
}
export function chooseAppearance(value:Appearance){apply(value);try{localStorage.setItem("formward-theme",value);}catch{}window.dispatchEvent(new Event("formward-theme-change"));}
