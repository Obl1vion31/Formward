import type {CSSProperties} from 'react';
export function SkeletonBlock({width='100%',height=18,radius=9}:{width?:string|number;height?:CSSProperties['height'];radius?:number}){return <span className="skeleton-block" aria-hidden="true" style={{width,height,borderRadius:radius} as CSSProperties}><span data-skeleton-sheen/></span>;}
