/** 固定语义图例由加载态和真实页面共用，不依赖健康数据。 */
export function OverviewLegend({ compact = false }: { compact?: boolean }) {
  return <>
    <span><i style={{ background: 'var(--data-blue)' }} />摄入</span>
    <span><i style={{ background: 'var(--data-red)' }} />消耗</span>
    <span><i style={{ background: 'var(--data-surplus)' }} />盈余</span>
    <span><i style={{ background: 'var(--data-deficit)' }} />缺口</span>
    {!compact && <span><i style={{ background: 'transparent', border: '1px solid var(--data-blue)', borderRadius: '50%', width: 7, height: 7 }} />空心点：未记全／待确认</span>}
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
