import { randomBytes } from "node:crypto";
import type { Report } from "./model";

const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const n = (value: number | null, digits = 1) => value === null ? "未知" : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: digits }).format(value);
const noteFor = (day: Report["daily"][number]) => [day.hasData ? (day.today ? "今日累计，尚非全天最终值。" : "来源汇总，完整性尚未独立确认。") : "本日未返回汇总，未知不补零。", ...day.notes].join(" ");
const kindNames: Record<string, string> = { running: "跑步", cycling: "骑行", walking: "步行", strength_training: "力量训练", swimming: "游泳", treadmill_running: "跑步机", indoor_cycling: "室内骑行", trail_running: "越野跑" };

export function renderReport(report: Report): string {
  const nonce = randomBytes(18).toString("base64"), demo = report.mode === "demo", latest = report.daily.at(-1)!;
  const max = Math.max(1, ...report.daily.flatMap(d => [d.total ?? 0, d.resting !== null && d.active !== null ? d.resting + d.active : 0]));
  const bars = report.daily.map(d => {
    const stack = d.resting !== null && d.active !== null, height = stack ? (d.resting! + d.active!) / max * 100 : (d.total ?? 0) / max * 100;
    return `<button type="button" class="day${d.date === latest.date ? " selected" : ""}" data-date="${escape(d.date)}" aria-pressed="${d.date === latest.date}" aria-label="查看 ${escape(d.date)}，总消耗 ${n(d.total)}${d.total === null ? "" : " kcal"}"><span class="bar-space"><span class="bar${stack ? " stack" : ""}${d.total === 0 ? " zero" : ""}" style="--height:${height.toFixed(4)}%;--rest-share:${stack && d.resting! + d.active! > 0 ? d.resting! / (d.resting! + d.active!) * 100 : 0}%">${stack ? '<span class="rest"></span><span class="active"></span>' : ""}</span>${d.total === null ? '<span class="missing">未返回</span>' : ""}</span><span class="day-number">${escape(d.date.slice(5).replace("-", "/"))}</span><span class="day-value">${d.total === null ? "—" : n(d.total, 0)}</span></button>`;
  }).join("");
  const issues = report.issues.length ? `<aside class="issues" role="status"><strong>有 ${report.issues.length} 项需要核对</strong><ul>${report.issues.map(i => `<li>${escape(i)}</li>`).join("")}</ul></aside>` : "";
  const activities = report.activities.length ? report.activities.map(a => `<article class="activity"><div><h3>${escape(a.type ? kindNames[a.type] ?? a.type : "运动类型未知")}</h3><p>${escape(a.date ?? "日期未知")} ${escape(a.time ?? "")}<span class="alias">${escape(a.alias)}</span></p>${a.notes.length ? `<p class="note">${a.notes.map(escape).join("；")}</p>` : ""}</div><dl><div><dt>时长</dt><dd>${n(a.seconds === null ? null : a.seconds / 60)}${a.seconds === null ? "" : '<span> 分钟</span>'}</dd></div><div><dt>运动总消耗</dt><dd>${n(a.calories)}${a.calories === null ? "" : '<span> kcal</span>'}</dd></div><div><dt>期间 BMR</dt><dd>${n(a.bmr)}${a.bmr === null ? "" : '<span> kcal</span>'}</dd></div><div><dt>平均心率</dt><dd>${n(a.heartRate)}${a.heartRate === null ? "" : '<span> 次／分</span>'}</dd></div></dl></article>`).join("") : `<p class="empty">${report.activitiesComplete ? "这七天没有返回活动记录。" : "活动读取未完成，请查看上方原因后重试。"}</p>`;
  const fields = report.fields.map(f => `<tr data-field="${escape(f.path)}"><th scope="row"><strong>${escape(f.label)}</strong><code>${escape(f.group === "daily" ? "daily.data[]." : "activities[].")}${escape(f.path)}</code></th><td>${escape(f.unit)}<span class="muted">${escape(f.types.join(" / ") || "尚无样本")}</span></td><td>${f.present} 次返回 · ${f.missing} 次缺失<span class="muted">null ${f.nulls} · 明确零 ${f.zeros}</span></td><td>${escape(f.target)}<span class="muted">${escape(f.note)}</span></td></tr>`).join("");
  const unknown = report.unknownFields.length ? `<details><summary>其他已观察字段（${report.unknownFields.length} 项）</summary><p class="muted">只列路径与类型；姓名、活动自由名称、账号标识、位置、设备及其他未选字段的值不在此预览披露。</p><div class="unknown-list">${report.unknownFields.map(f => `<div><code>${escape(f.group)}.${escape(f.path)}</code><span>${escape(f.types.join(" / "))} · ${f.count} 次</span></div>`).join("")}</div></details>` : "";
  // 数据进入 script 前转义 <，包括 </script> 与 Unicode 分隔符。
  const payload = JSON.stringify({ daily: report.daily, sample: report.sample }).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; style-src-attr 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"><title>Formward · Garmin 只读预览${demo ? "（虚构演示）" : ""}</title><style nonce="${nonce}">
:root{color-scheme:light;--bg:#f3f0e9;--surface:#fffdf8;--ink:#24231f;--muted:#645f55;--line:#8e8578;--soft:#e9e4da;--red:#b64538;--rest:#91887a;--gold:#8a681b;--focus:#795900}
*{box-sizing:border-box}
html{scroll-behavior:smooth;scroll-padding-top:90px}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}
body.dark{color-scheme:dark;--bg:#10100f;--surface:#22221f;--ink:#f0e9dd;--muted:#bdb5a8;--line:#8c8375;--soft:#33332e;--red:#ee8b7d;--rest:#9d9280;--gold:#dcb76a;--focus:#f1ca80}
button,input{font:inherit;color:inherit}
button,summary{touch-action:manipulation}
button{cursor:pointer}
a{color:inherit;text-underline-offset:4px}
button:focus-visible,a:focus-visible,summary:focus-visible,input:focus-visible{outline:2px solid var(--focus);outline-offset:4px}
::selection{background:#cba55780;color:var(--ink)}
::-webkit-scrollbar{width:10px;height:10px}
::-webkit-scrollbar-thumb{background:var(--line);border:3px solid var(--surface);border-radius:9px}
header{max-width:1120px;margin:auto;padding:24px 32px 16px;display:flex;justify-content:space-between;align-items:center;gap:20px}
header strong{font-size:21px;letter-spacing:-.03em}
.brand-dot{color:var(--gold)}
.theme{border:1px solid var(--line);border-radius:12px;background:var(--surface);padding:8px 14px;min-height:44px}
main{max-width:1120px;margin:0 auto;padding:16px 32px 72px}
h1{font-size:clamp(26px,4vw,34px);line-height:1.25;margin:0 0 12px;letter-spacing:-.025em}
h2{font-size:21px;line-height:1.4;margin:0}
h3{font-size:17px;margin:0}
p{margin:8px 0}
.intro{display:flex;justify-content:space-between;gap:24px;align-items:flex-end;margin-bottom:24px}
.muted,.intro p,.note{color:var(--muted)}
.intro p{margin:4px 0}
.badge{font-size:14px;padding:6px 11px;background:var(--soft);border-radius:9px;display:inline-block}
.warning{color:var(--gold);font-weight:650}
.nav{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0 24px}
.nav a{min-height:44px;padding:10px 14px;border:1px solid var(--line);border-radius:11px;text-decoration:none}
.nav a:hover,.theme:hover{background:var(--soft)}
.nav a:active,.theme:active{filter:brightness(.93)}
.overview{background:var(--surface);border-radius:22px;padding:26px 28px;box-shadow:0 8px 28px #201c1510,0 2px 4px #201c1508;background-image:linear-gradient(135deg,#ffffff0a,transparent 60%)}
.readout-head{display:flex;justify-content:space-between;gap:16px;align-items:center}
.selected-date{font-variant-numeric:tabular-nums}
.total{margin:12px 0 14px;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;font-variant-numeric:tabular-nums}
.total strong{font-size:42px;letter-spacing:-.035em;line-height:1.3;overflow-wrap:anywhere}
.total span{font-size:16px;color:var(--muted)}
dl{margin:0}
.substats{display:flex;flex-wrap:wrap;gap:14px 38px;padding-bottom:12px}
.substats div{min-width:90px}
dt{font-size:14px;color:var(--muted)}
dd{margin:3px 0 0;font-size:20px;font-variant-numeric:tabular-nums}
dd span{font-size:13px;color:var(--muted)}
.substats dd>span:first-child{font-size:20px;color:var(--ink)}
.readout-notes{display:grid;color:var(--muted);font-size:14px}
.readout-notes>*{grid-area:1/1;margin:0;min-height:26px}
.reserve{visibility:hidden;pointer-events:none}
.legend small{font-size:12px}
.chart{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;margin:20px 0 6px}
.day{background:transparent;border:0;border-radius:10px;padding:5px 3px 8px;min-width:0;display:flex;flex-direction:column;align-items:center;position:relative}
.day:hover,.day.selected{background:var(--soft)}
.day.selected:after{content:"";height:3px;width:18px;border-radius:3px;background:var(--gold);position:absolute;bottom:1px}
.bar-space{height:130px;width:100%;display:flex;align-items:flex-end;justify-content:center;position:relative;border-bottom:1px solid var(--line)}
.bar{display:block;height:var(--height);min-height:0;width:min(34px,72%);background:var(--rest);border-radius:5px 5px 0 0;position:relative;overflow:hidden}
.bar.stack{display:flex;flex-direction:column-reverse;background:transparent}
.rest{height:var(--rest-share);background:var(--rest);flex-shrink:0}
.stack .rest{background:var(--rest)}
.active{flex:1;background:var(--red)}
.zero{height:2px;min-height:2px;background:var(--ink)}
.missing{position:absolute;bottom:8px;font-size:12px;color:var(--muted);white-space:nowrap}
.day-number{font-size:13px;margin-top:10px;white-space:nowrap}
.day-value{font-size:12px;color:var(--muted);margin-top:2px;white-space:nowrap}
.legend{display:flex;gap:18px;flex-wrap:wrap;font-size:13px;color:var(--muted);margin-top:12px}
.legend span:before{content:"";width:9px;height:9px;background:var(--red);display:inline-block;margin-right:6px;border-radius:2px}
.legend span:first-child:before{background:var(--rest)}
.section{margin-top:32px}
.section-head{display:flex;justify-content:space-between;gap:16px;align-items:baseline;margin-bottom:12px}
.section-head span{color:var(--muted);font-size:14px}
.activity{padding:20px 0;border-bottom:1px solid var(--line);display:grid;grid-template-columns:minmax(200px,1fr) minmax(400px,1.3fr);gap:24px}
.activity p{font-size:14px;color:var(--muted)}
.alias{margin-left:12px}
.activity dl{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.activity dd{font-size:18px;overflow-wrap:anywhere}
.empty{padding:20px 0;color:var(--muted)}
.issues{padding:16px 0;border-bottom:1px solid var(--line);margin-bottom:22px}
.issues ul{margin:8px 0;padding-left:22px}
.issues li{margin:6px 0}
details{margin-top:20px;padding:14px 0;border-top:1px solid var(--line)}
summary{cursor:pointer;min-height:44px;align-content:center;font-weight:650}
table{width:100%;border-collapse:collapse;text-align:left;font-size:14px}
th,td{padding:14px 12px 14px 0;border-bottom:1px solid var(--line);vertical-align:top}
thead th{color:var(--muted);font-weight:500}
tbody th{font-weight:400;min-width:200px;width:29%}
td:last-child{width:34%}
td .muted{display:block;margin-top:5px;font-size:13px}
code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;overflow-wrap:anywhere}
th code{display:block;font-weight:400;color:var(--muted);margin-top:4px}
.filter{border:1px solid var(--line);background:var(--surface);border-radius:10px;min-height:44px;padding:10px 12px;margin:8px 0 12px;width:min(100%,420px);font-size:16px}
.unknown-list{max-height:360px;overflow:auto;font-size:14px}
.unknown-list>div{display:flex;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px solid var(--line)}
.unknown-list span{color:var(--muted);white-space:nowrap}
pre{background:var(--surface);border-radius:14px;padding:18px;max-height:480px;overflow:auto;font-size:13px;line-height:1.6;tab-size:2}
.source{font-size:13px;color:var(--muted);margin-top:36px;max-width:75ch}
footer{margin-top:24px;font-size:13px;color:var(--muted)}
[hidden]{display:none!important}
@media(min-width:800px){.overview{display:grid;grid-template-columns:1fr 1.2fr;gap:0 40px}
.chart{grid-column:2;grid-row:1/6;margin:0;align-self:center}
.legend{grid-column:1/3}
.bar-space{height:170px}
.readout-head,.total,.substats,.readout-notes{grid-column:1}
}
@media(max-width:760px){header{padding:18px 20px 12px}
main{padding:16px 20px 48px}
.intro{display:block;margin-bottom:18px}
.badge{margin-top:12px}
.overview{padding:20px 18px;border-radius:20px}
.total strong{font-size:36px}
.chart{gap:3px}
.bar-space{height:124px}
.day-value{font-size:12px}
.activity{grid-template-columns:1fr;gap:8px}
.activity dl{grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 24px}
.section-head{align-items:flex-start}
thead{display:none}
table,tbody,tr,th,td{display:block;width:100%!important}
tbody th{min-width:0;border:0;padding-bottom:5px}
td{border:0;padding:5px 0}
tr{border-bottom:1px solid var(--line);padding:12px 0}
td:last-child{padding-bottom:10px}
.substats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.substats div{min-width:0}
.unknown-list>div{display:block}
.unknown-list span{display:block;margin-top:3px}
.readout-head{align-items:flex-start;flex-wrap:wrap;gap:4px 12px}
}
@media(max-width:360px){.substats{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}
}
@media print{body{background:white;color:black}
.theme,.nav,.filter{display:none}
details{display:block}
pre{max-height:none}
.overview{box-shadow:none;border:1px solid #aaa}
}

</style></head><body><header><strong>formward<span class="brand-dot">.</span></strong><button class="theme" type="button" id="theme" aria-label="切换深浅主题">深色</button></header><main><div class="intro"><div><h1>Garmin 只读预览</h1><p>${escape(report.window.from)} — ${escape(report.window.to)} · ${escape(report.window.timeZone)}</p><p>读取于 ${escape(new Intl.DateTimeFormat("zh-CN", { timeZone: report.window.timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(report.fetchedAt)))}</p></div><span class="badge${demo ? " warning" : ""}">${demo ? "虚构演示 · 不是你的数据" : "真实读取 · 仅保存在本机"}</span></div><p class="muted">只读核对 · 未写入 Formward 正式记录</p><nav class="nav" aria-label="预览内容"><a href="#daily">每日汇总</a><a href="#activities">活动记录</a><a href="#mapping">字段对应</a></nav>${issues}<section class="overview" id="daily" aria-label="七日每日汇总"><div class="readout-head"><h2>每日总消耗</h2><span class="selected-date" id="selected-date">${escape(latest.date)}</span></div><div class="total"><strong id="total">${n(latest.total, 0)}</strong><span id="total-unit">${latest.total === null ? "" : "kcal"}</span></div><dl class="substats"><div><dt>静息</dt><dd><span id="resting">${n(latest.resting, 0)}</span><span> kcal</span></dd></div><div><dt>活动</dt><dd><span id="active">${n(latest.active, 0)}</span><span> kcal</span></dd></div><div><dt>步数</dt><dd id="steps">${n(latest.steps, 0)}</dd></div></dl><div class="readout-notes">${report.daily.map(d => `<p class="reserve" aria-hidden="true">${escape(noteFor(d))}</p>`).join("")}<p id="readout-note">${escape(noteFor(latest))}</p></div><div class="chart" role="group" aria-label="点击日期查看读数">${bars}</div><div class="legend"><span>静息</span><span>活动</span><small>仅总数时使用中性色柱</small></div></section><section class="section" id="activities"><div class="section-head"><h2>七日活动记录</h2><span>${report.activities.length} 条 · ${report.activitiesComplete ? "分页读取结束" : "读取未完整"}</span></div><p class="muted">单次运动总消耗可能包含期间静息；下列来源数值仅作核对，不自动重新累计全天消耗。</p>${activities}</section><section class="section" id="mapping"><div class="section-head"><h2>字段对应关系</h2><span>按实际响应观察</span></div><label for="filter" class="muted">查找字段或用途</label><br><input class="filter" id="filter" type="search" placeholder="例如 burnedTotal、时长、心率" autocomplete="off"><table><thead><tr><th>原始字段</th><th>单位与类型</th><th>本次观察</th><th>拟用于 Formward</th></tr></thead><tbody id="fields">${fields}</tbody></table><p id="filter-empty" class="muted" hidden>没有匹配的字段。</p>${unknown}<details id="json"><summary>查看脱敏 JSON 样本</summary><p class="muted">保留选定字段的值、null 和缺失关系，记录标识使用本次别名。原始响应另存本机私有文件。</p><pre id="sample"></pre></details></section><p class="source">${escape(report.schemaVersion)}。字段依据：<a href="https://developer.garmin.com/gc-developer-program/personal/swagger-docs/" target="_blank" rel="noopener noreferrer">佳明官方 Personal API 文档</a>。数据来源 Garmin；本预览由 Formward 提供，不代表佳明认可。</p><footer>原始响应与报告均保存在本机私有目录，分享前请检查健康信息。刷新此页面只查看本次快照。</footer></main><script type="application/json" id="payload" nonce="${nonce}">${payload}</script><script nonce="${nonce}">
const payload=JSON.parse(document.getElementById('payload').textContent);const el=id=>document.getElementById(id);const format=v=>v===null?'未知':new Intl.NumberFormat('zh-CN',{maximumFractionDigits:0}).format(v);for(const button of document.querySelectorAll('.day'))button.addEventListener('click',()=>{const d=payload.daily.find(day=>day.date===button.dataset.date);if(!d)return;el('selected-date').textContent=d.date;el('total').textContent=format(d.total);el('total-unit').textContent=d.total===null?'':'kcal';el('resting').textContent=format(d.resting);el('active').textContent=format(d.active);el('steps').textContent=format(d.steps);el('readout-note').textContent=[d.hasData?(d.today?'今日累计，尚非全天最终值。':'来源汇总，完整性尚未独立确认。'):'本日未返回汇总，未知不补零。',...d.notes].join(' ');for(const other of document.querySelectorAll('.day')){other.classList.toggle('selected',other===button);other.setAttribute('aria-pressed',String(other===button));}});let dark=matchMedia('(prefers-color-scheme:dark)').matches;function theme(){document.body.classList.toggle('dark',dark);el('theme').textContent=dark?'浅色':'深色';}theme();el('theme').addEventListener('click',()=>{dark=!dark;theme();});el('sample').textContent=JSON.stringify(payload.sample,null,2);el('filter').addEventListener('input',event=>{const q=event.target.value.trim().toLowerCase();let visible=0;for(const row of document.querySelectorAll('#fields tr')){row.hidden=!row.textContent.toLowerCase().includes(q);if(!row.hidden)visible++;}el('filter-empty').hidden=visible!==0;});
</script></body></html>`;
}
