'use client';
import {useEffect} from 'react';
import {repeatedRecordTask,type RecordTask} from './record-intent';

const taskEvent='formward-open-record-task';

export function reopenCurrentRecordTask(href:string){
  const task=repeatedRecordTask(href,window.location.href);
  if(!task)return false;
  const event=new CustomEvent<RecordTask>(taskEvent,{detail:task,cancelable:true});
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

/** 仅传递当前地址的打开意图，不保存健康数据，也不执行写入。 */
export function useRepeatedRecordTask(path:string,open:(task:RecordTask)=>void|boolean){
  useEffect(()=>{
    const receive=(event:Event)=>{
      const task=(event as CustomEvent<RecordTask>).detail;
      if(task?.path!==path)return;
      if(open(task)!==false)event.preventDefault();
    };
    window.addEventListener(taskEvent,receive);
    return()=>window.removeEventListener(taskEvent,receive);
  },[path,open]);
}
