import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {addCalendarDays} from "../src/features/measurements/calendar.ts";

const closeEnough = (a,b) => Math.abs(a-b) < .75;
const rangeButton = (page,name) => page.getByRole("button",{name,exact:true});
const stable = page => page.locator("[data-chart-range-layer]").waitFor({state:"detached"});

async function observeRange(page, keys) {
  await page.evaluate(keys => {
    cancelAnimationFrame(window.__rangeFrame);
    window.__rangeFrames = [];
    const attr = (el,key) => Number(el.getAttribute(key));
    function sample() {
      const layer = document.querySelector("[data-chart-range-layer]");
      if (layer) {
        const root = layer.parentElement;
        const marks = keys.map(key => {
          const copy = layer.querySelector('[data-range-copy="'+key+'"]');
          const mark = root.querySelector('[data-range-mark="'+key+'"]');
          if (!copy || !mark) return null;
          const origin = mark.closest("[data-chart-bar]")?.getAttribute("data-chart-zero");
          const matrix = mark.getScreenCTM();
          const zero = origin!=null&&matrix ? Number(origin)*matrix.d+matrix.f-root.getBoundingClientRect().top : null;
          return {
            opacity:Number(copy.style.opacity),
            x:attr(copy,"x"),y:attr(copy,"y"),height:attr(copy,"height"),zero,
            finalHeight:matrix ? attr(mark,"height")*matrix.d : 0,
            length:Math.hypot(attr(copy,"x2")-attr(copy,"x1"),attr(copy,"y2")-attr(copy,"y1")),
            finalLength:matrix ? Math.hypot((attr(mark,"x2")-attr(mark,"x1"))*matrix.a,
                                          (attr(mark,"y2")-attr(mark,"y1"))*matrix.d) : 0,
          };
        });
        window.__rangeFrames.push({phase:root.dataset.chartRangeMotion, time:performance.now(), marks});
      }
      window.__rangeFrame = requestAnimationFrame(sample);
    }
    sample();
  },keys);
}

async function samples(page) {
  await stable(page);
  return page.evaluate(() => {
    cancelAnimationFrame(window.__rangeFrame);
    return window.__rangeFrames;
  });
}

async function expand(page, range, keys) {
  await observeRange(page, keys);
  await rangeButton(page,range).click();
  assert.equal(await rangeButton(page,range).getAttribute("aria-pressed"),"true");
  return samples(page);
}

function assertBarGrowth(frames, phase) {
  const growing = frames.filter(({phase,marks})=>phase==="revealing" && marks.every(mark=>mark?.opacity>0)
    && marks[0].height>0 && marks[0].height<marks[0].finalHeight*.96);
  assert.ok(growing.length>=2,phase+" 柱子有可见的中间高度");
  assert.ok(frames.some(({phase,marks})=>phase==="moving"&&(!marks[0]||marks[0].height===0)),phase+" 共同日期先重排");
  for (const {marks} of growing) {
    const first=marks[0];
    assert.ok(closeEnough(first.y+first.height,first.zero),phase+" 柱底锚定零线");
    const progress=first.height/first.finalHeight;
    for (const mark of marks) assert.ok(closeEnough(mark.height,mark.finalHeight*progress),phase+" 堆叠层和未记全标记同速");
  }
  assert.ok(growing.at(-1).marks[0].height>growing[0].marks[0].height,phase+" 柱形从零线持续伸出");
}

function assertPointThenLine(frames, phase) {
  const reveal = frames.filter(row=>row.phase==="revealing");
  assert.ok(reveal.some(({marks:[point,line]})=>point?.opacity>0&&line?.opacity===0),phase+" 先看到点");
  const drawing = reveal.filter(({marks:[point,line]})=>point?.opacity>.98&&line?.opacity>0&&line.length>0&&line.length<line.finalLength*.98);
  assert.ok(drawing.length>=2,phase+" 点就绪后逐步描线");
  assert.ok(drawing.at(-1).marks[1].length>drawing[0].marks[1].length,phase+" 线向相邻点延长");
}

async function chartReady(page) {
  await page.waitForFunction(()=>[...document.querySelectorAll(
    "[data-route-content] [data-record-slot=plot] svg[role=group]")].some(svg=>
      !svg.closest("[data-forward-covered],[data-return-covered],[inert]")&&getComputedStyle(svg).visibility==="visible"));
  const guide = page.getByRole("button",{name:"跳过引导",exact:true});
  if(await guide.isVisible())await guide.click();
}

export async function checkChartRangeMotion({browser,base,today,art,context,checks,errors,account}) {
  const login = await context.storageState();
  const at = i => addCalendarDays(today,i);
  const bar = (date,metric) => "bar:"+date+":"+metric;
  const weight = (first,last) => ["point:morning:"+at(first),"line:morning:"+at(first)+":"+at(last)];
  const evidence = [];
  for (const viewport of [{width:390,height:780},{width:1440,height:900}]) {
    const phone = viewport.width<500;
    const device = phone?"phone":"desktop";
    const chartContext=await browser.newContext({viewport,hasTouch:phone,isMobile:phone,locale:"zh-CN",
      timezoneId:"Asia/Shanghai",storageState:login,recordVideo:{dir:art,size:viewport}});
    const page=await chartContext.newPage();
    page.on("pageerror",error=>errors.push(error.message));
    await page.addInitScript(account=>{
      localStorage.setItem("formward-theme","dark");
      for(const kind of ["meals","body","energy"])localStorage.setItem("formward:record-guide:v1:"+encodeURIComponent(account)+":"+kind,"seen");
      if(!/^\/dashboard\/(meals|measurements)$/.test(location.pathname))return;
      window.__initialChartFrames=[];
      const sample=()=>{
        const panel=document.querySelector("[data-record-slot=plot]");
        const point=panel?.querySelector("[data-chart-point]"),line=panel?.querySelector("[data-chart-line]"),bar=panel?.querySelector("[data-chart-bar]");
        if(bar?.getAnimations().length){
          const transform=getComputedStyle(bar).transform;
          window.__initialChartFrames.push({bar:transform==="none"?1:new DOMMatrix(transform).d});
        }
        if(line?.getAnimations().length&&point){
          const stroke=getComputedStyle(line);
          window.__initialChartFrames.push({point:Number(getComputedStyle(point).opacity),visible:stroke.visibility==="visible",offset:parseFloat(stroke.strokeDashoffset)});
        }
        if(window.__initialChartFrames.length<120)requestAnimationFrame(sample);
      };
      sample();
    },account);
    const coldFrames = async route=>{
      await page.goto(base+"/dashboard/"+route);
      await chartReady(page);
      await page.waitForFunction(()=>window.__initialChartFrames?.some(frame=>frame.bar>0&&frame.bar<1||frame.visible&&frame.offset>0));
      return page.evaluate(()=>window.__initialChartFrames);
    };
    try {
      const coldMeal=await coldFrames("meals");
      assert.ok(coldMeal.some(frame=>frame.bar>0&&frame.bar<1),device+" 摄入初次零线生长");
      const coldBody=await coldFrames("measurements");
      assert.ok(coldBody.some(frame=>frame.point>0&&!frame.visible),device+" 晨重初次先显示点");
      assert.ok(coldBody.some(frame=>frame.point>.98&&frame.visible&&frame.offset>0),device+" 晨重初次后描线");
      evidence.push({device,case:"first-entry",coldMeal,coldBody});
      for (const [kind,route] of [["intake","meals"],["morning-weight","measurements"],["energy","energy"]]) {
        await page.goto(base+"/dashboard");
        const card = page.locator('a[data-metric-card="'+kind+'"]');
        await (phone ? card.tap() : card.click());
        await page.waitForURL(url=>url.pathname==="/dashboard/"+route);
        await chartReady(page);
        await rangeButton(page,"7D").click();
        await page.waitForTimeout(650);
        const isBody = kind==="morning-weight";
        const metrics = kind==="intake"?["proteinG","carbsG"]:["resting","active"];
        const dateKeys = n=>metrics.map(metric=>bar(at(n),metric));
        const from7 = await expand(page,"30D",isBody?weight(-10,-9):dateKeys(-10));
        const parts = isBody?weight(-56,-55):dateKeys(-55);
        if(kind==="intake")parts.push((phone?"partial:":"partial-pattern:")+at(-55));
        const from30 = await expand(page,"90D",parts);
        evidence.push({device,kind,from7,from30});
        if(isBody) {
          assertPointThenLine(from7,device+" 晨重 7D→30D");
          assertPointThenLine(from30,device+" 晨重 30D→90D");
          assert.equal(await page.locator('[data-range-mark="line:morning:'+at(-54)+':'+at(-52)+'"]').count(),0);
        } else {
          assertBarGrowth(from7,device+" "+kind+" 7D→30D");
          assertBarGrowth(from30,device+" "+kind+" 30D→90D");
        }
        await page.screenshot({path:resolve(art,device+"-"+kind+"-90D.png")});

        await observeRange(page,parts);
        await rangeButton(page,"7D").click();
        const shrink=await samples(page);
        assert.ok(shrink.some(row=>row.phase==="fading")&&shrink.some(row=>row.phase==="moving"),device+" 回切先淡出再展开");
        await page.evaluate(async()=>{
          for(const name of ["30D","7D","90D","30D"]){
            [...document.querySelectorAll("[data-chart-controls] button")].find(button=>button.textContent===name&&button.getClientRects().length)?.click();
            await new Promise(resolve=>requestAnimationFrame(resolve));
          }
        });
        await stable(page);
        assert.equal(await rangeButton(page,"30D").getAttribute("aria-pressed"),"true");
        await rangeButton(page,"全部").click();
        assert.equal(await rangeButton(page,"全部").getAttribute("aria-pressed"),"true");
        await rangeButton(page,"自定义").click();
        const custom=page.getByRole("form",{name:"自定义日期范围"});
        await custom.getByLabel(/开始日期/).fill(at(-12));
        await custom.getByLabel(/结束日期/).fill(today);
        await custom.getByRole("button",{name:"应用",exact:true}).click();
        assert.equal(await rangeButton(page,"自定义").getAttribute("aria-pressed"),"true");
        await page.emulateMedia({reducedMotion:"reduce"});
        await rangeButton(page,"7D").click();
        await rangeButton(page,"30D").click();
        assert.equal(await page.locator("[data-chart-range-layer]").count(),0);
        assert.equal(await rangeButton(page,"30D").getAttribute("aria-pressed"),"true");
        await page.emulateMedia({reducedMotion:"no-preference"});
        checks.push(device+"-"+kind+"-range-motion");
      }
    } finally {
      const video=page.video();
      await chartContext.close();
      if(video) {
        await video.saveAs(resolve(art,device+"-range-motion.webm"));
        await video.delete();
      }
      await writeFile(resolve(art,"range-motion-frames.json"),JSON.stringify(evidence,null,2));
    }
  }
}

