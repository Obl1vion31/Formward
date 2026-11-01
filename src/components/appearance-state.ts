export const appearanceBootstrap = `try{document.documentElement.setAttribute("data-theme",localStorage.getItem("formward-theme")==="light"?"light":"dark")}catch{document.documentElement.setAttribute("data-theme","dark")}`;
export const appearanceSnapshot=()=>document.documentElement.dataset.theme==="light"?"light":"dark";
export const appearanceServerSnapshot=()=>"dark";
export function subscribeAppearance(notify:()=>void){
 const storage=(event:StorageEvent)=>{if(event.key!=="formward-theme")return;document.documentElement.setAttribute("data-theme",event.newValue==="light"?"light":"dark");notify();};
 window.addEventListener("formward-theme-change",notify);window.addEventListener("storage",storage);
 return()=>{window.removeEventListener("formward-theme-change",notify);window.removeEventListener("storage",storage);};
}
export function chooseAppearance(value:"light"|"dark"){
 document.documentElement.setAttribute("data-theme",value);
 try{localStorage.setItem("formward-theme",value);}catch{}
 window.dispatchEvent(new Event("formward-theme-change"));
}
