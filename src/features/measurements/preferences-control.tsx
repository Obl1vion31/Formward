"use client";
import {useEffect,useRef,useState} from 'react';
import {loadPreferencesAction,savePreferencesAction} from '@/app/dashboard/measurements/preferences-actions';
import type {AccountPreferences} from '@/features/auth/preferences';
export function useBodyPreferences(initial:AccountPreferences,editing:boolean,readOnMount=true){
 const [saved,setSaved]=useState(initial),[optimistic,setOptimistic]=useState<boolean|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');const guard=useRef(false);
 useEffect(()=>{let cancelled=false;const refresh=async()=>{if(document.hidden||editing||guard.current)return;try{const result=await loadPreferencesAction();if(!cancelled&&result.ok)setSaved(result.data);}catch{/* 最近确认值保持；下次进入或恢复前台重试。 */}};window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);if(readOnMount)void refresh();window.addEventListener('formward-body-preferences',refresh);return()=>{cancelled=true;window.removeEventListener('formward-body-preferences',refresh);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};},[editing,readOnMount]);
 async function change(value:boolean){if(guard.current||editing)return;guard.current=true;setBusy(true);setError('');setOptimistic(value);try{const result=await savePreferencesAction({showBodyFat:value,expectedVersion:saved.version});if(result.ok){setSaved(result.data);window.dispatchEvent(new Event("formward-body-preferences"));}else{setError(result.error);if(result.code==='version_conflict'){const latest=await loadPreferencesAction();if(latest.ok){setSaved(latest.data);window.dispatchEvent(new Event("formward-body-preferences"));}}}}catch{setError('偏好未保存，已恢复原设置。请重试。');}finally{setOptimistic(null);setBusy(false);guard.current=false;}}
 return {showBodyFat:optimistic??saved.showBodyFat,busy,error,change};
}
