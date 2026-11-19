/** 固定语义图例由加载态和真实页面共用，不依赖健康数据。 */
export function OverviewLegend() {
  return <>
    <span><i aria-hidden="true" style={{ background: 'var(--data-deficit)', width: 5, height: 9, borderRadius: 1 }} />缺口</span>
    <span><i aria-hidden="true" style={{ background: 'var(--data-surplus)', width: 5, height: 9, borderRadius: 1 }} />盈余</span>
    <span><i aria-hidden="true" style={{ background: 'var(--muted)', width: 8, height: 2, borderRadius: 1 }} />有记录，未计收支</span>
  </>;
}

export function NutritionLegend() {
  return <>{[['protein', '蛋白质'], ['carbs', '碳水'], ['fat', '脂肪']].map(([name, label]) => <span key={name}><i style={{ background: `var(--data-${name})` }} />{label}</span>)}</>;
}

export function EnergyLegend() {
  return <>
    <span><i style={{ background: 'var(--data-protein)' }} />静息</span>
    <span><i style={{ background: 'var(--data-red)' }} />活动</span>
    <span><i style={{ background: 'var(--data-neutral)' }} />仅有总数</span>
  </>;
}
