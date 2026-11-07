import {SkeletonBlock} from "@/components/skeleton-block";
import styles from "@/features/training/training.module.css";
export default function TrainingLoading(){return <section className={styles.workspace} aria-busy="true" aria-label="训练数据加载中"><div className={styles.today}><div><SkeletonBlock width={120} height={14}/><SkeletonBlock width={220} height={32}/></div><SkeletonBlock width={170} height={46}/></div><SkeletonBlock width={140} height={20}/><div className={styles.calendar}>{Array.from({length:35},(_,i)=><SkeletonBlock key={i} height={48}/>)}</div></section>;}
