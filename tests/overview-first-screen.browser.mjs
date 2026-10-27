import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

// 使用真实应用和已有虚构记录。截图保持未滚动视口；安全区模拟只改变导航占用。
export async function checkOverviewFirstScreen({baseURL, page, artifacts = ".codex/overview-compact", engine = "chromium"}) {
  await mkdir(artifacts, {recursive:true});
  const errors = [], cases = [], onError = error => errors.push(error.message);
  page.on("pageerror", onError);
  await page.emulateMedia({reducedMotion:"no-preference"});
  const plot = page.getByRole("group", {name:"双层日期关联图", exact:true});
  const readout = page.getByLabel("日期对照", {exact:true});
  const ready = async mobile => {
    await plot.waitFor();
    await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
    if (mobile) await page.waitForFunction(() => document.querySelector('button[aria-pressed="true"]')?.textContent === "7D");
    await page.waitForFunction(() => document.querySelector('[aria-label="双层日期关联图"]')?.style.visibility !== "hidden");
    await page.waitForTimeout(500);
    await page.evaluate(() => scrollTo(0,0));
  };
  try {
    for (const [width,height] of [[320,560],[390,560],[390,640],[430,780],[844,390],[1100,900],[1440,900]]) {
      await page.setViewportSize({width,height});
      await page.goto(baseURL+"/dashboard");
      await page.mouse.move(0,0);
      const mobile = width <= 700;
      await ready(mobile);
      if (mobile) {await page.addStyleTag({content:".mobile-bottom-nav { padding-bottom:34px; }"});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.waitForTimeout(100);}
      const geometry = await plot.evaluate(svg => {
        const rect = node => { const b=node.getBoundingClientRect();return {top:b.top,bottom:b.bottom,left:b.left,right:b.right,height:b.height}; };
        return {scrollY,svg:rect(svg),nav:document.querySelector(".mobile-bottom-nav")?.getBoundingClientRect().top,
          panels:[...svg.querySelectorAll("[data-overview-panel]")].map(rect),
          dates:[...svg.querySelectorAll("[data-overview-date-label]")].map(rect),
          overflow:document.documentElement.scrollWidth>innerWidth,
          unmeasuredText:[...svg.querySelectorAll("text")].filter(node=>{const b=node.getBBox();return !b.width||!b.height;}).map(node=>node.textContent),
          tiny:[...svg.querySelectorAll("text")].filter(node => {
            const m=node.getScreenCTM();return m&&parseFloat(getComputedStyle(node).fontSize)*Math.hypot(m.a,m.b)<11.9;
          }).map(node=>node.textContent)};
      });
      assert.equal(geometry.scrollY,0); assert.equal(geometry.overflow,false);
      assert.deepEqual(geometry.tiny,[]);assert.deepEqual(geometry.unmeasuredText,[],"SVG文字必须有实际字形尺寸");
      assert.equal(await page.getByLabel("总览图表日期",{exact:true}).count(),0);
      assert.equal(await page.getByRole("button",{name:"解除固定",exact:true}).count(),0);
      if (mobile) {
        assert.ok(geometry.svg.bottom <= geometry.nav-1, JSON.stringify(geometry));
        assert.equal(geometry.panels.length,2);
        assert.ok(geometry.dates.length>=3);
        assert.ok(geometry.dates.every(rect=>rect.bottom<geometry.nav));
      }
      assert.equal(await plot.evaluate(svg => {
        const sets=[...svg.querySelectorAll("[data-overview-panel]")].map(panel=>[...panel.querySelectorAll("[data-axis-tick] text")]);
        sets.push([...svg.querySelectorAll("[data-overview-date-label]")]);
        sets.push([...svg.querySelectorAll("[data-axis-tick] text,[data-weight-readout],[data-overview-date-label]")]);
        return sets.every(nodes=>nodes.every((node,i)=>nodes.every((other,j)=> {
          if(i===j)return true;
          const a=node.getBoundingClientRect(),b=other.getBoundingClientRect();
          return a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom;
        })));
      }),true,"刻度标签不得碰撞");
      // 选择未知、缺测或其他日期时，布局和坐标范围保持。
      const initialTop=await plot.evaluate(node=>node.getBoundingClientRect().top+scrollY);
      const ticks=await plot.locator("[data-axis-tick]").evaluateAll(nodes=>nodes.map(node=>node.getAttribute("data-axis-tick")));
      const points=page.locator("[data-overview-date]");
      for(const point of [points.first(),points.nth(2),points.last()]) {
        await point.focus(); await page.keyboard.press("Enter");
        assert.equal(await plot.evaluate(node=>node.getBoundingClientRect().top+scrollY),initialTop);
        assert.deepEqual(await plot.locator("[data-axis-tick]").evaluateAll(nodes=>nodes.map(node=>node.getAttribute("data-axis-tick"))),ticks);
        await page.keyboard.press("Escape");
      }
      await page.goto(baseURL+"/dashboard"); await ready(mobile);
      if(mobile){await page.addStyleTag({content:".mobile-bottom-nav { padding-bottom:34px; }"});await page.waitForTimeout(100);}
      await page.screenshot({path:join(artifacts,engine+"-"+width+"x"+height+".png")});
      cases.push({width,height,safeArea:mobile?34:0,geometry,passed:true});
    }
    await page.setViewportSize({width:1440,height:900}); await page.goto(baseURL+"/dashboard");await ready(false);
    const dates=await page.locator("[data-overview-date]").evaluateAll(nodes=>nodes.map(node=>node.getAttribute("data-overview-date")));
    const a=dates.at(-4),b=dates.at(-2);
    const at=async (date,action="move")=>{
      const box=await page.locator('[data-overview-date="'+date+'"]>rect').boundingBox();
      await page.mouse[action](box.x+box.width/2,box.y+30);
    };
    const baseline=await readout.getAttribute("data-selected-date");
    await at(a);assert.equal(await readout.getAttribute("data-selected-date"),a);
    await page.mouse.move(0,0);assert.equal(await readout.getAttribute("data-selected-date"),baseline);
    await at(a,"click");await at(b);assert.equal(await readout.getAttribute("data-selected-date"),a);
    await page.getByRole("button",{name:"7D",exact:true}).click();
    assert.equal(await page.locator("[data-pinned-date]").getAttribute("data-pinned-date"),a);
    await at(b,"click");await page.mouse.click(2,2);assert.equal(await page.locator("[data-pinned-date]").count(),0);
    await at(a,"click");await page.getByRole("button",{name:"查看记录 →",exact:true}).click();
    await page.locator("dialog[open]").waitFor();assert.equal(await page.locator("[data-pinned-date]").count(),0);await page.keyboard.press("Escape");
    const before=await readout.getAttribute("data-selected-date");
    await page.getByRole("button",{name:"自定义",exact:true}).click();
    await page.getByLabel("总览开始日期",{exact:true}).fill(dates[0]); await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("form",{name:"自定义日期范围",exact:true}).count(),0);
    assert.equal(await readout.getAttribute("data-selected-date"),before);
    await page.getByRole("button",{name:"自定义",exact:true}).click();
    await page.getByLabel("总览开始日期",{exact:true}).fill(dates[0]);
    await page.getByLabel("总览结束日期",{exact:true}).fill(dates.at(-1));
    await page.getByRole("button",{name:"应用",exact:true}).click();
    assert.equal(await page.getByRole("form",{name:"自定义日期范围",exact:true}).count(),0);
    assert.equal(await page.getByRole("button",{name:"自定义",exact:true}).getAttribute("aria-pressed"),"true");
    await page.getByRole("button",{name:"30D",exact:true}).click();
    await at(dates[0],"click");await page.getByRole("button",{name:"7D",exact:true}).click();
    assert.equal(await page.locator("[data-pinned-date]").count(),0,"越出新区间解除固定");
    await page.getByRole("button",{name:"自定义",exact:true}).click();
    await page.getByLabel("总览开始日期",{exact:true}).fill(dates.at(-1));
    await page.getByLabel("总览结束日期",{exact:true}).fill(dates[0]);
    assert.equal(await page.getByRole("button",{name:"应用",exact:true}).isDisabled(),true);
    await page.getByRole("button",{name:"取消",exact:true}).click();
    assert.equal(await page.getByRole("button",{name:"7D",exact:true}).getAttribute("aria-pressed"),"true");
    await page.evaluate(()=>{document.body.style.zoom="1.5";});
    await page.waitForTimeout(200);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"放大后允许纵向滚动，不能横向溢出");
    await page.screenshot({path:join(artifacts,engine+"-zoom-150.png")});
    await page.evaluate(()=>{document.body.style.zoom="";});
    const touch=await page.context().browser().newContext({locale:"zh-CN",timezoneId:"Asia/Shanghai",viewport:{width:390,height:560},hasTouch:true,isMobile:true,storageState:await page.context().storageState()});
    try {
      const p=await touch.newPage();p.on("pageerror",onError);
      for(const [width,height] of [[390,560],[844,390]]) {
        await p.setViewportSize({width,height});await p.goto(baseURL+"/dashboard");
        const chart=p.getByRole("group",{name:"双层日期关联图",exact:true});
        await chart.waitFor();await p.waitForFunction(()=>document.querySelector('button[aria-pressed="true"]')?.textContent==="7D");
        await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(500);
        const hit=p.locator("[data-overview-date]>rect").nth(2),box=await hit.boundingBox();
        await p.touchscreen.tap(box.x+box.width/2,box.y+30);
        assert.equal(await p.getByLabel("日期对照",{exact:true}).getAttribute("data-selected-date"),await hit.locator("..").getAttribute("data-overview-date"));
        assert.equal(await p.locator("dialog[open]").count(),0);
        assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        if(width===390) {
          const bottom=await chart.evaluate(node=>node.getBoundingClientRect().bottom);
          const nav=await p.getByRole("navigation",{name:"主导航",exact:true}).evaluate(node=>node.getBoundingClientRect().top);
          assert.ok(bottom<nav);
        }
        await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:join(artifacts,engine+"-touch-"+width+"x"+height+".png")});
      }
    } finally {await touch.close();}
    await page.emulateMedia({reducedMotion:"reduce"});await page.getByRole("button",{name:"90D",exact:true}).click();await page.waitForTimeout(100);
    assert.equal(await plot.evaluate(node=>node.getAnimations({subtree:true}).filter(a=>a.playState==="running").length),0);
    assert.deepEqual(errors,[]);
    const result={passed:true,engine,designItems:["D1","D2","D3","D4","D5","D6"],cases,clientErrors:errors};
    await writeFile(join(artifacts,engine+"-report.json"),JSON.stringify(result,null,2));
    console.log(engine+" 总览首屏、双图、坐标、图外解除、自定义收起和键盘检查通过。");
    return result;
  } finally { page.off("pageerror",onError); }
}
