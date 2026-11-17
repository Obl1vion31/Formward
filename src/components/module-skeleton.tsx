/** 未知数据的占位在首帧输出，CSS延迟200ms显示，不等待脚本接管。 */
export function ModuleSkeleton({shape="line",label="正在读取…"}:{shape?:"line"|"number"|"chart"|"records";label?:string}){
  return <span className="module-skeleton" data-shape={shape} data-ready="true" role="status" aria-label={label}><span className="sr-only">{label}</span></span>;
}
