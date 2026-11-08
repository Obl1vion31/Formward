"use client";
import {useEffect,useState} from 'react';
import {ProfileForm} from '@/features/onboarding/profile-form';
import {AccountPanel} from '@/features/auth/account-panel';
import {loadProfileAction} from '@/app/onboarding/actions';
import {loadPersonalAccountAction} from '@/app/dashboard/account/actions';
import type {PersonalProfile} from '@/features/onboarding/model';
import type {PersonalAccountData} from '@/features/auth/account-management';
import {LocalLoading} from '@/components/local-loading';
import recordUI from '@/components/record-ui.module.css';
export function AccountSurface({kind}:{kind:'profile'|'account'}){
 const [today]=useState(()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10));
 const [profile,setProfile]=useState<PersonalProfile|null>(null),[account,setAccount]=useState<PersonalAccountData|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let live=true;async function load(){setError('');try{if(kind==='profile'){const r=await loadProfileAction();if(live){if(r.ok)setProfile(r.data);else setError(r.error);}}else{const r=await loadPersonalAccountAction();if(live){if(r.ok)setAccount(r.data);else setError(r.error);}}}catch{if(live)setError('暂时无法读取，请重试。');}}void load();return()=>{live=false;};},[kind,attempt]);
 if(error)return <div className="account-read-error"><p role="alert">{error}</p><button className={recordUI.secondary} onClick={()=>setAttempt(v=>v+1)}>重试</button></div>;
 return <div className="account-sheet-content">{kind==='profile'&&profile?<ProfileForm embedded initial={profile} today={today}/>:kind==='account'&&account?<AccountPanel embedded initial={account}/>:<div className="account-reading" aria-busy="true"><LocalLoading label={kind==='profile'?'正在读取个人资料…':'正在读取账号信息…'}/></div>}</div>;
}
