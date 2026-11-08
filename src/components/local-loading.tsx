"use client";
import {useEffect,useState} from 'react';
import styles from './local-loading.module.css';

/** 只在真实等待超过 200ms 时显示，不占用全局等待层。 */
export function LocalLoading({active=true,label='正在读取…',iconOnly=false}:{active?:boolean;label?:string;iconOnly?:boolean}){
 const [visible,setVisible]=useState(false);
 useEffect(()=>{
  if(!active)return;
  const timer=setTimeout(()=>setVisible(true),200);
  return()=>{clearTimeout(timer);setVisible(false);};
 },[active]);
 return <span className={styles.status} data-local-loading data-visible={active&&visible||undefined} data-icon-only={iconOnly||undefined} aria-hidden={!active||!visible} role="status">
  <span className={styles.spinner} aria-hidden="true"/><span className={iconOnly?styles.accessible:undefined}>{label}</span>
 </span>;
}
export function ReadingPage({title,label}:{title:string;label:string}){return <main className="dashboard-page"><section className="account-reading-page"><h1>{title}</h1><LocalLoading label={label}/></section></main>;}
