"use client";
import {useEffect,useState} from 'react';
import type {AccountPreferences} from '@/features/auth/preferences';
import {loadPreferencesAction} from '@/app/dashboard/measurements/preferences-actions';
import {useBodyPreferences} from './preferences-control';
import {SkeletonBlock} from '@/components/skeleton-block';
export function BodySettings(){
 const [data,setData]=useState<AccountPreferences|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let live=true;void loadPreferencesAction().then(result=>{if(!live)return;if(result.ok)setData(result.data);else setError(result.error);}).catch(()=>{if(live)setError('暂时无法读取设置，请重试。');});return()=>{live=false;};},[attempt]);
 if(error)return <div role="alert">{error}<button onClick={()=>{setError('');setAttempt(n=>n+1);}}>重试</button></div>;
 return data?<Settings initial={data}/>:<div className="body-settings" aria-busy="true"><div>体重 <span>始终开启</span></div><div>体脂率 <SkeletonBlock width={44} height={26} radius={13}/></div><Unavailable/></div>;
}
function Unavailable(){return <>{[['骨骼肌量','kg'],['骨骼肌率','%']].map(([label,unit])=><div key={label}><span>{label}<small>{unit}</small></span><span>未开放</span></div>)}</>;}
function Settings({initial}:{initial:AccountPreferences}){
 const preference=useBodyPreferences(initial,false,false);
 return <div className="body-settings"><div>体重 <span>始终开启</span></div><label>体脂率<input type="checkbox" role="switch" aria-label="显示体脂率" checked={preference.showBodyFat} disabled={preference.busy} onChange={event=>void preference.change(event.target.checked)}/></label><Unavailable/>{preference.error&&<p role="status">{preference.error}</p>}</div>;
}
