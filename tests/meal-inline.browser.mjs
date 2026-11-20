import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { decideMealOperation, readMealSnapshot, submitMealOperation } from "../src/features/meals/records.ts";

const profiles = [
  { width: 320, height: 560, theme: "light" },
  { width: 320, height: 667, theme: "light" }, { width: 320, height: 667, theme: "dark" },
  { width: 390, height: 844, theme: "light", full: true }, { width: 390, height: 667, theme: "dark" },
  { width: 430, height: 844, theme: "light" }, { width: 430, height: 844, theme: "dark" },
  { width: 1100, height: 900, theme: "light" }, { width: 1100, height: 900, theme: "dark" },
  { width: 1440, height: 1000, theme: "light", full: true }, { width: 1440, height: 1000, theme: "dark" },
];

async function checkPaneChange(page, destination, activate, reduced) {
  await page.evaluate(reduced => {
    const frames = [], effects = {};
    const meal = document.querySelector('[data-meal-pane="meal"]');
    const library = document.querySelector('[data-meal-pane="library"]');
    const stage = meal.parentElement;
    const pose = panel => {
      const style = getComputedStyle(panel);
      if (style.display === "none" || style.visibility !== "visible") return null;
      return style.transform === "none" ? 0 : new DOMMatrix(style.transform).m41;
    };
    // 观察 React 提交后真正挂到两个面板上的动画。机器负载可能使 rAF 越过整段合成动画。
    const recordEffects = () => {
      if (!stage.dataset.mealPaneTransition) return;
      for (const panel of [meal, library]) {
        const name = panel.dataset.mealPane;
        if (effects[name]) continue;
        for (const animation of panel.getAnimations()) {
          const keys = animation.effect.getKeyframes();
          if (keys.length < 2 || !keys.every(key => key.transform)) continue;
          const x = key => new DOMMatrix(key.transform).m41;
          effects[name] = { start: x(keys[0]), end: x(keys.at(-1)), duration: animation.effect.getTiming().duration };
          break;
        }
      }
    };
    const observer = new MutationObserver(recordEffects);
    observer.observe(stage, { attributes: true, attributeFilter: ["data-meal-pane-transition"] });
    let frame;
    function sample() {
      const direction = stage.dataset.mealPaneTransition;
      if (direction && (!effects.meal || !effects.library)) recordEffects();
      // 动效在合成层运行。采样仅读两块面板的变换，避免逐帧强制计算整份表单布局。
      if (direction || reduced) frames.push({ time: performance.now(), direction, meal: pose(meal), library: pose(library) });
      frame = requestAnimationFrame(sample);
    }
    sample();
    window.finishMealPaneRecording = () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      const settledPose = panel => panel.getBoundingClientRect().height > 0 ? pose(panel) : null;
      return { frames, effects, settled: { meal: settledPose(meal), library: settledPose(library) } };
    };
  }, reduced);
  await activate();
  await page.waitForFunction(destination => {
    const form = document.querySelector('[data-entry-form="meal"]');
    const pane = form?.querySelector('[data-meal-pane="' + destination + '"]');
    return form && form.hasAttribute("data-library-open") === (destination === "library") &&
      !form.querySelector("[data-meal-pane-transition]") && !!pane?.getClientRects().length;
  }, destination);
  const { frames, effects, settled } = await page.evaluate(() => window.finishMealPaneRecording());
  const origin = destination === "library" ? "meal" : "library";
  assert.equal(settled[destination], 0, destination + " 已在最终位置");
  assert.equal(settled[origin], null, origin + " 离场后隐藏");
  let intermediateFrames = 0;
  if (reduced) {
    assert.deepEqual(effects, {}, "减弱动态时未启动面板位移动画");
    assert.ok(frames.length && frames.every(({ meal, library }) => !meal && !library), "减弱动态时两侧内容直接交接");
  } else {
    const directionName = destination === "library" ? "forward" : "back";
    const moving = frames.filter(frame => frame.direction === directionName && frame.meal !== null && frame.library !== null);
    const direction = destination === "library" ? -1 : 1;
    for (const lane of ["library", "meal"]) {
      const effect = effects[lane];
      assert.ok(effect && effect.duration === 200 && (effect.end - effect.start) * direction > 1,
        destination + " 两栏的动画按前进或返回方向移动 " + JSON.stringify(effects));
      assert.equal(lane === destination ? effect.end : effect.start, 0, destination + " 进出面板在原位交接");
      for (let i = 1; i < moving.length; i++) {
        assert.ok((moving[i][lane] - moving[i - 1][lane]) * direction >= -.25,
          destination + " 可采到的画面位移方向一致 " + JSON.stringify(moving));
      }
    }
    intermediateFrames = moving.filter(({ meal, library }) => meal < -.25 && library > .25).length;
  }
  return { destination, reduced, effects, settled, intermediateFrames, frames };
}

async function checkMealColumns(form, mobile, profile) {
  const rows = await form.locator("[data-meal-row]").evaluateAll((rows, mobile) => {
    const box = node => {
      const { x, width, height } = node.getBoundingClientRect();
      return { x, width, height };
    };
    return rows.map(row => {
      const amount = row.querySelector('input[aria-label^="数量 "]');
      const unit = row.querySelector('[aria-label^="单位 "], span[title]');
      const remove = row.querySelector('button[aria-label^="移除 "]');
      const amountFace = getComputedStyle(amount.parentElement, "::before");
      const columns = {
        quantity: box(amount),
        quantityFace: { x: box(amount.parentElement).x + parseFloat(amountFace.left),
          width: parseFloat(amountFace.width), height: parseFloat(amountFace.height) },
        unit: box(unit.parentElement), remove: box(remove),
      };
      const controls = [...row.querySelectorAll("input,select")].filter(input => input.getBoundingClientRect().height).map(input => {
        const face = getComputedStyle(input.parentElement, "::before");
        return { label: input.getAttribute("aria-label"), target: box(input),
          faceHeight: parseFloat(face.height), outline: face.boxShadow };
      });
      if (mobile) {
        const toggle = row.querySelector('button[aria-label$="营养"]');
        const face = toggle.querySelector("span");
        columns.nutrition = box(toggle);
        columns.nutritionFace = { ...box(face), outline: getComputedStyle(face).boxShadow };
      } else {
        for (const nutrient of row.querySelectorAll("[data-meal-nutrient]")) {
          columns[nutrient.dataset.mealNutrient] = box(nutrient);
        }
      }
      return { basis: row.dataset.nutritionBasis, columns, controls };
    });
  }, mobile);
  assert.deepEqual(rows.map(row => row.basis), ["food_library", "food_library", "consumed_total"]);
  for (const { columns, controls } of rows) {
    for (const [label, column] of Object.entries(columns)) {
      assert.ok(column.width > 0 && column.height > 0, profile + " 可见列 " + label);
      for (const edge of ["x", "width"]) {
        const expected = rows[0].columns[label][edge];
        assert.ok(Math.abs(column[edge] - expected) <= 1,
          profile + " 库选与手填 " + label + "." + edge + " 实测 " + column[edge] + "，首行 " + expected);
      }
    }
    if (mobile) {
      assert.ok(Math.abs(columns.nutritionFace.height - 32) <= .5, profile + " 营养按钮的可见描边高32px");
      assert.ok(columns.nutritionFace.outline.includes("inset") && columns.nutritionFace.outline.includes("0px 0px 0px 1px"),
        profile + " 营养按钮采用1px内描边");
      assert.ok(columns.nutrition.height >= 43.9 && columns.nutrition.width >= 43.9, profile + " 营养按钮的点击区域至少44px");
    }
    for (const { label, faceHeight, target, outline } of controls) {
      assert.ok(Math.abs(faceHeight - 32) <= .5 && target.height >= 43.9,
        profile + " " + label + " 可见底框及输入区域高度 " + faceHeight + "/" + target.height);
      assert.ok(outline.includes("inset") && outline.includes("0px 0px 0px 1px"),
        profile + " " + label + " 未聚焦可见底框采用1px内描边");
    }
  }
  return rows;
}

async function checkMobileHeader(form, profile) {
  const pairs = await form.evaluate(form => {
    const date = form.querySelector("[data-date-field]");
    const mealType = form.querySelector('input[aria-label="餐次"]');
    const methods = form.querySelectorAll('[aria-label="记录方式"] button');
    const measure = (wrapper, target) => {
      const face = getComputedStyle(wrapper, "::before"), rect = target.getBoundingClientRect();
      const outerSize = (size, start, end) => parseFloat(face[size]) + (face.boxSizing === "border-box" ? 0
        : parseFloat(face["padding" + start]) + parseFloat(face["padding" + end])
          + parseFloat(face["border" + start + "Width"]) + parseFloat(face["border" + end + "Width"]));
      return { x: wrapper.getBoundingClientRect().x + parseFloat(face.left), width: outerSize("width", "Left", "Right"),
        height: outerSize("height", "Top", "Bottom"), targetHeight: rect.height };
    };
    return [[date, date.querySelector("input")], [mealType, mealType]].map(([field, target], index) => {
      const button = methods[index];
      const { x, width, height } = button.querySelector(":scope > span").getBoundingClientRect();
      return { field: measure(field.parentElement, target),
        method: { x, width, height, targetHeight: button.getBoundingClientRect().height } };
    });
  });
  for (const { field, method } of pairs) {
    assert.ok(Math.abs(field.x - method.x) <= 1 && Math.abs(field.width - method.width) <= 1,
      profile + " 日期/手填、餐次/拍照的可见框按同一列对齐 " + JSON.stringify({ field, method }));
    assert.ok(Math.abs(field.width - pairs[0].field.width) <= 1, profile + " 手机头部两列等宽");
    for (const item of [field, method]) {
      assert.ok(Math.abs(item.height - 40) <= .5 && item.targetHeight >= 43.9,
        profile + " 手机头部控件40px外观、44px点击范围 " + JSON.stringify(item));
    }
  }
  return pairs;
}

async function checkNumberAlignment(form, mobile, profile) {
  const aligned = await form.evaluate(async (form, mobile) => {
    const afterPaint = () => new Promise(resolve => requestAnimationFrame(resolve));
    const position = input => {
      const style = getComputedStyle(input);
      const inset = parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth);
      return { align: style.textAlign, direction: style.direction, inset,
        x: input.getBoundingClientRect().left + inset - input.scrollLeft };
    };
    const fields = [];
    for (const input of form.querySelectorAll('[data-meal-row] input[type="number"], [data-meal-row] input[aria-label^="单位 "]')) {
      if (!input.getClientRects().length) continue;
      const blurred = position(input);
      input.focus({ preventScroll: true });
      await afterPaint();
      const focusReached = document.activeElement === input;
      const focused = position(input);
      input.blur();
      await afterPaint();
      fields.push({ label: input.getAttribute("aria-label"), metric: input.closest("[data-meal-nutrient]")?.dataset.mealNutrient,
        focusReached, blurred, focused, after: position(input) });
    }
    const readings = [];
    if (!mobile) {
      for (const cell of form.querySelectorAll('[data-nutrition-basis="food_library"] [data-meal-nutrient]')) {
        const value = cell.querySelector(":scope > span:last-child");
        const range = document.createRange();
        range.setStart(value.firstChild, 0);
        range.setEnd(value.firstChild, 1);
        readings.push({ metric: cell.dataset.mealNutrient, x: range.getBoundingClientRect().left });
      }
    }
    return { fields, readings };
  }, mobile);
  const quantities = aligned.fields.filter(field => field.label.startsWith("数量 "));
  const nutrients = aligned.fields.filter(field => field.metric);
  assert.equal(quantities.length, 3, profile + " 三个数量输入参与核对");
  assert.equal(nutrients.length, 4, profile + " 四个手填营养参与核对");
  assert.equal(aligned.fields.filter(field => field.label.startsWith("单位 ")).length, 1, profile + " 手填单位参与核对");
  const inset = quantities[0].blurred.inset;
  assert.ok(Math.abs(inset - 6) <= .5, profile + " 数字从输入框左边界内6px起排");
  for (const field of aligned.fields) {
    assert.ok(field.focusReached, profile + " " + field.label + " 可聚焦");
    for (const point of [field.blurred, field.focused, field.after]) {
      assert.ok(point.align === "left" || (point.align === "start" && point.direction === "ltr"),
        profile + " " + field.label + " 聚焦前后均左对齐 " + JSON.stringify(point));
      assert.ok(Math.abs(point.inset - inset) <= .5 && Math.abs(point.x - field.blurred.x) <= 1,
        profile + " " + field.label + " 聚焦前后沿共同左内边距起排 " + JSON.stringify(field));
    }
  }
  if (!mobile) {
    assert.equal(aligned.readings.length, 8, profile + " 两个库选行的四项实际只读数字参与核对");
    for (const reading of aligned.readings) {
      const editable = nutrients.find(field => field.metric === reading.metric);
      assert.ok(Math.abs(reading.x - editable.blurred.x) <= 1, profile + " " + reading.metric
        + " 只读首个数字与手填值左起点 " + reading.x + "/" + editable.blurred.x);
    }
  }
  return aligned;
}

async function checkUnitDisplay(control, expected, profile) {
  const label = await control.getAttribute("aria-label");
  await control.evaluate(node => node.scrollIntoView({ block: "center", behavior: "instant" }));
  const hit = await control.evaluate(node => {
    const rect = node.getBoundingClientRect();
    const face = getComputedStyle(node.parentElement, "::before");
    const faceTop = node.parentElement.getBoundingClientRect().top + parseFloat(face.top) - rect.top;
    return { width: rect.width, height: rect.height, scrollTop: node.closest("dialog").scrollTop,
      faceTop, faceBottom: faceTop + parseFloat(face.height),
      bottomHit: document.elementFromPoint(rect.x + rect.width / 2, rect.bottom - 2) === node };
  });
  assert.ok(hit.height >= 43.9 && hit.bottomHit, profile + " " + label + " 底部可点 " + JSON.stringify(hit));
  if (profile.startsWith("320x")) assert.ok(hit.scrollTop > 0, profile + " 已滚动到窄屏单位输入");
  await control.click({ position: { x: hit.width / 2, y: hit.height - 2 } });
  assert.ok(await control.evaluate(node => document.activeElement === node), profile + " 单位框底部点击可聚焦");
  await control.blur();

  // 同一浏览器在足够宽的原生控件中实际画出的笔画作为参照。
  const sampleInk = async target => {
    const actual = await target.screenshot({ caret: "hide" });
    const blank = await target.screenshot({ caret: "hide", style: '[aria-label="' + label + '"], [data-unit-ink-reference] { -webkit-text-fill-color: transparent !important; }' });
    return target.evaluate(async (node, { actual, blank, expected }) => {
      const load = async base64 => {
        const image = new Image();
        image.src = "data:image/png;base64," + base64;
        await image.decode();
        return image;
      };
      const [original, masked] = await Promise.all([load(actual), load(blank)]);
      const canvas = document.createElement("canvas");
      canvas.width = original.width; canvas.height = original.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const pixels = source => {
        ctx.drawImage(source, 0, 0);
        return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      };
      const visible = pixels(original), empty = pixels(masked);
      const css = getComputedStyle(node);
      ctx.font = [css.fontWeight, css.fontSize, css.fontFamily].join(" ");
      const glyph = ctx.measureText(expected), start = parseFloat(css.paddingLeft);
      let left = canvas.width, right = -1, top = canvas.height, bottom = -1;
      for (let y = 0; y < canvas.height; y++) {
        for (let x = Math.max(0, Math.floor(start) - 2); x < Math.min(canvas.width, Math.ceil(start + glyph.width + 2)); x++) {
          const i = (y * canvas.width + x) * 4;
          if (Math.abs(visible[i] - empty[i]) + Math.abs(visible[i + 1] - empty[i + 1]) + Math.abs(visible[i + 2] - empty[i + 2]) < 45) continue;
          left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
      }
      return { width: Math.max(0, right - left + 1), height: Math.max(0, bottom - top + 1), top, bottom,
        value: node.selectedOptions ? node.selectedOptions[0]?.textContent : node.value };
    }, { actual: actual.toString("base64"), blank: blank.toString("base64"), expected });
  };
  const ink = await sampleInk(control);
  await control.evaluate(node => {
    const wide = node.cloneNode(true);
    wide.removeAttribute("id");
    wide.removeAttribute("aria-label");
    wide.dataset.unitInkReference = "";
    wide.setAttribute("aria-hidden", "true");
    wide.tabIndex = -1;
    wide.style.cssText = "position:fixed;top:32px;left:24px;width:136px!important;min-width:136px;max-width:none;z-index:9999;background-color:var(--surface)";
    wide.value = node.value;
    node.parentElement.appendChild(wide);
  });
  const reference = control.locator("..").locator("[data-unit-ink-reference]");
  let fullInk;
  try {
    fullInk = await sampleInk(reference);
  } finally {
    await reference.evaluate(node => node.remove());
    await control.evaluate((node, top) => { node.closest("dialog").scrollTop = top; }, hit.scrollTop);
  }
  assert.equal(ink.value, expected);
  assert.equal(fullInk.value, expected);
  assert.ok(ink.width >= fullInk.width - 2 && ink.height >= fullInk.height - 2 && fullInk.width > 3 && fullInk.height > 3,
    profile + " " + expected + " 实际字形与宽控件参照 " + JSON.stringify({ ink, fullInk }));
  assert.ok(ink.top >= hit.faceTop - 1 && ink.bottom <= hit.faceBottom + 1,
    profile + " " + expected + " 所有笔画均位于单位输入框的32px可见面内");
  return { value: expected, hit, ink, fullInk };
}

export async function runMealInline(db) {
  const config = JSON.parse(await readFile(process.env.FORMWARD_CHAT_BROWSER_CONFIG, "utf8"));
  const origin = new URL(config.baseURL);
  assert.equal(origin.hostname, "127.0.0.1");
  assert.ok(config.isolatedFixture && config.account.email.endsWith("@example.test"));
  const packagedName = "验收盒装饮品";
  const packageSetup = await submitMealOperation(db, { userId: config.userId, origin: "manual" }, {
    operationId: crypto.randomUUID(), actions: [{ kind: "save_food", name: packagedName, category: "ingredient",
      foodGroup: "other", unit: "ml", baseQuantity: "100", servingUnit: "盒", servingQuantity: "200",
      sourceKind: "reference", nutrition: { caloriesKcal: "50", proteinG: "2", carbsG: "6", fatG: "2" } }],
  });
  await decideMealOperation(db, config.userId, packageSetup.id, packageSetup.revision, "confirm");
  const engine = process.env.FORMWARD_UI_ENGINE ?? "chromium";
  const playwright = await import(process.env.PLAYWRIGHT_MODULE);
  const browser = await playwright[engine].launch({ headless: true });
  const folder = resolve(process.env.FORMWARD_MEAL_INLINE_ARTIFACTS ?? ".codex/meal-inline", engine);
  await mkdir(folder, { recursive: true });
  const results = [];
  const pageErrors = [];
  const version = await (await fetch(origin + "/api/app-version")).json();

  try {
    const auth = await browser.newContext();
    const login = await auth.request.post(origin + "/api/auth/sign-in/email", {
      headers: { Origin: config.baseURL }, data: config.account,
    });
    assert.equal(login.status(), 200);
    const storageState = await auth.storageState();
    await auth.close();

    const widths = process.env.FORMWARD_MEAL_INLINE_WIDTHS?.split(",").map(Number);
    for (const profile of profiles.filter(profile => !widths || widths.includes(profile.width))) {
      const { width, height, theme, full } = profile;
      const mobile = width < 701;
      const trackPanes = width === 390;
      const reduced = trackPanes && theme === "dark";
      const paneChanges = [];
      const name = width + "x" + height + "-" + theme;
      const context = await browser.newContext({
        storageState, viewport: { width, height }, locale: "zh-CN", isMobile: mobile, hasTouch: mobile,
        deviceScaleFactor: 1, reducedMotion: reduced ? "reduce" : "no-preference",
      });
      const page = await context.newPage();
      page.setDefaultTimeout(14000);
      page.on("pageerror", error => pageErrors.push({ name, message: error.message }));
      await page.addInitScript(({ userId, theme }) => {
        localStorage.setItem("formward-theme", theme);
      }, { theme });
      const form = page.locator('form[data-entry-form="meal"]');
      const shell = page.locator("dialog[data-inspector]:visible");
      const picker = form.getByRole("region", { name: "选择食材库" });
      const row = index => form.locator("[data-meal-row]").nth(index);
      const field = name => form.getByLabel(name, { exact: true });
      const save = () => form.getByRole("button", { name: /^保存餐次 · / });
      const detail = page.locator('[data-meal-details="attached"]:popover-open[data-positioned]');
      const menu = page.locator('[data-meal-details="menu"]:popover-open[data-positioned]');
      const removeFood = (index, name) => row(index).getByRole("button", { name: "移除 " + name, exact: true });
      const checkRowIcon = async (button, label) => {
        const target = await button.boundingBox();
        assert.ok(target && target.width >= 43.9 && target.height >= 43.9, label + " 有44px点击区域");
        assert.ok(await button.locator("svg").isVisible(), label + " 按钮显示图标");
      };
      const showLibrary = () => form.getByRole("button", { name: "从食材库添加", exact: true }).click();
      const manual = () => form.getByRole("button", { name: "手动填写", exact: true }).click();
      const settle = () => page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      const shot = async state => {
        await settle();
        await page.screenshot({ path: join(folder, name + "-" + state + ".png"), animations: "disabled" });
      };
      const checkFit = async () => {
        const widthOverflow = await form.evaluate(form => {
          const dialog = form.closest("dialog");
          return Math.max(form.scrollWidth - form.clientWidth, dialog.scrollWidth - dialog.clientWidth);
        });
        assert.ok(widthOverflow <= 1, name + " 水平溢出 " + widthOverflow);
        const bounds = await save().boundingBox();
        assert.ok(bounds && bounds.height >= 43.9 && bounds.y + bounds.height <= height + 1, name + " 保存按钮 " + JSON.stringify(bounds));
      };
      const action = (name, value) => picker.getByRole(name, { name: value, exact: true });
      const readouts = async root => root.locator("[data-meal-reading]").evaluateAll(metrics => metrics.map(metric => {
        const value = metric.querySelector("dd > span"), unit = value.querySelector("small");
        const number = document.createRange();
        number.selectNode(value.firstChild);
        const box = number.getBoundingClientRect();
        const unitBox = unit?.getBoundingClientRect();
        return { text: value.innerText, lines: number.getClientRects().length, top: box.top, bottom: box.bottom, unitBottom: unitBox?.bottom };
      }));

      try {
        await page.goto(origin + "/dashboard/meals?entry=1&date=" + config.today);
        await form.waitFor();
        await page.locator('dialog[data-inspector][data-surface-phase="open"]').waitFor();
        await page.locator(".local-preview-label").waitFor({ state: "attached" });
        assert.equal(await page.locator("html").getAttribute("data-theme"), theme);
        await checkFit();
        const headerColumns = mobile ? await checkMobileHeader(form, name) : null;
        if (full) await shot("empty");

        if (mobile) {
          assert.equal(await picker.isVisible(), false);
          if (trackPanes) paneChanges.push(await checkPaneChange(page, "library", showLibrary, reduced));
          else await showLibrary();
        }
        await picker.waitFor();
        await action("button", "整餐").click();
        assert.ok(await picker.getByText("鸡肉蔬菜便当", { exact: true }).isVisible());
        assert.equal(await picker.getByText("原味鸡胸肉", { exact: true }).count(), 0);
        await action("button", "肉类").click();
        await action("button", "原味鸡胸肉规格与营养").waitFor();
        assert.equal(await picker.getByText("清蒸西兰花", { exact: true }).count(), 0);
        if (mobile) {
          await action("checkbox", "选择 原味鸡胸肉").check();
          await action("button", "蔬菜").click();
          await action("checkbox", "选择 清蒸西兰花").check();
          await action("button", "全部").click();
          assert.equal(await action("checkbox", "选择 原味鸡胸肉").isChecked(), true);
          assert.equal(await action("checkbox", "选择 清蒸西兰花").isChecked(), true);
          await form.getByText("已选 2 项", { exact: true }).waitFor();
          if (full || width === 430 && theme === "dark") await shot("picker");
          const addSelected = () => form.getByRole("button", { name: "加入本餐", exact: true }).click();
          if (trackPanes) paneChanges.push(await checkPaneChange(page, "meal", addSelected, reduced));
          else await addSelected();
          await picker.waitFor({ state: "hidden" });
        } else {
          await action("button", "添加 原味鸡胸肉").click();
          await action("button", "蔬菜").click();
          await action("button", "添加 清蒸西兰花").click();
          await action("button", "全部").click();
        }
        assert.equal(await form.locator("[data-meal-row]").count(), 2);
        await checkRowIcon(removeFood(1, "清蒸西兰花"), "移除");
        await row(0).getByRole("button", { name: "原味鸡胸肉的更多操作", exact: true }).click();
        await menu.waitFor();
        assert.equal(await menu.getByRole("button", { name: /移除|删除/ }).count(), 0);
        const replace = menu.getByRole("button", { name: "更换食材", exact: true });
        const replaceBox = await replace.boundingBox();
        assert.ok(replaceBox && replaceBox.width < (await menu.boundingBox()).width * .8, name + " 更换食材使用紧凑按钮");
        await replace.click();
        await picker.getByRole("button", { name: "取消更换", exact: true }).click();
        await removeFood(1, "清蒸西兰花").click();
        assert.equal(await form.locator("[data-meal-row]").count(), 1, name + " 在行内移除库选食物后立即更新本餐");
        assert.ok(await removeFood(0, "原味鸡胸肉").isVisible(), name + " 保留另一项");
        if (mobile) {
          await showLibrary();
          await action("checkbox", "选择 清蒸西兰花").check();
          await form.getByRole("button", { name: "加入本餐", exact: true }).click();
        } else {
          await action("button", "添加 清蒸西兰花").click();
        }
        await form.locator("[data-meal-pane-transition]").waitFor({ state: "detached" });
        await field("数量 1").fill("150");
        await field("数量 2").fill("80");
        await field("数量 2").blur();
        await shell.evaluate(dialog => { dialog.scrollTop = 0; });
        await checkFit();
        const totals = await readouts(form.getByLabel("本餐合计", { exact: true }));
        assert.deepEqual(totals.map(metric => metric.text.replace(/\s+/g, " ").trim()), ["275 千卡", "48.7 g", "5.3 g", "5.7 g"]);
        assert.equal(await field("数量 1").inputValue(), "150");
        const amountGeometry = await field("数量 1").evaluate(input => {
          const style = getComputedStyle(input), box = input.getBoundingClientRect();
          const context = document.createElement("canvas").getContext("2d");
          context.font = style.font;
          const available = box.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
            - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth);
          const face = getComputedStyle(input.parentElement, "::before");
          return {
            available, text: context.measureText(input.value).width, border: style.borderLeftWidth, height: box.height,
            faceHeight: parseFloat(face.height), faceWidth: parseFloat(face.width), faceTop: parseFloat(face.top),
            background: style.backgroundColor, shadow: face.boxShadow,
          };
        });
        assert.ok(amountGeometry.available >= amountGeometry.text - .25, name + " 数量显示不全 " + JSON.stringify(amountGeometry));
        assert.ok(amountGeometry.height >= 43.9);
        assert.equal(amountGeometry.faceHeight, 32, name + " 可见底框的高度");
        assert.ok(amountGeometry.faceWidth <= 64, name + " 常用数量的可见宽度");
        assert.ok(amountGeometry.faceTop >= 6, name + " 上方仍有可点击留白");
        assert.equal(amountGeometry.background, "rgba(0, 0, 0, 0)");

        const quantityInput = field("数量 1");
        const baseQuantity = await quantityInput.boundingBox();
        await quantityInput.click({ position: { x: 12, y: 2 } });
        assert.equal(await quantityInput.evaluate(input => input === document.activeElement), true);
        const focusedFace = await quantityInput.evaluate(input => {
          const face = getComputedStyle(input.parentElement, "::before");
          return { shadow: face.boxShadow, outline: face.outlineStyle };
        });
        assert.notEqual(focusedFace.shadow, amountGeometry.shadow);
        assert.equal(focusedFace.outline, "none", name + " 焦点只强调小框边界");
        const focusedQuantity = await quantityInput.boundingBox();
        for (const edge of ["x", "y", "width", "height"]) {
          assert.ok(Math.abs(focusedQuantity[edge] - baseQuantity[edge]) <= 1, name + " 聚焦时保持字段位置 " + edge);
        }
        if (full) await shot("quantity-focused");
        await quantityInput.fill("150.25");
        await quantityInput.blur();
        assert.equal(await quantityInput.inputValue(), "150.25");
        await quantityInput.fill("150");
        await quantityInput.blur();
        if (mobile) {
          assert.equal(amountGeometry.border, "0px");
          const quantity = await field("数量 1").boundingBox();
          const unit = await row(0).getByText("克", { exact: true }).boundingBox();
          assert.ok(unit.x >= quantity.x + quantity.width, name + " 固定单位在用量框外");
          assert.ok(quantity.width <= 76, name + " 用量框宽度 " + quantity.width);
          assert.equal(await detail.count(), 0);
          const info = row(0).getByRole("button", { name: "原味鸡胸肉的本次营养" });
          await checkRowIcon(info, "库选本次营养");
          const control = await info.boundingBox();
          assert.ok(control.width >= 44 && control.height >= 44);
          const foodButton = row(0).getByRole("button", { name: "原味鸡胸肉的更多操作" });
          const foodName = foodButton.getByText("原味鸡胸肉", { exact: true });
          assert.ok(await foodName.isVisible());
          assert.equal(await foodName.evaluate(node => {
            const range = document.createRange();
            range.selectNodeContents(node);
            return range.getClientRects().length;
          }), 1, name + " 常见五字食材名完整同行");
          const food = await foodButton.boundingBox(), remove = await removeFood(0, "原味鸡胸肉").boundingBox();
          const centers = [food, quantity, unit, control, remove].map(box => box.y + box.height / 2);
          assert.ok(Math.max(...centers) - Math.min(...centers) <= 1 && remove.x >= control.x + control.width - 1,
            name + " 食物、数量、单位、营养和行尾移除同行");
          const before = await row(1).boundingBox();
          const scrollBefore = await shell.evaluate(dialog => dialog.scrollTop);
          await info.click();
          await detail.waitFor();
          await settle();
          const after = await row(1).boundingBox(), anchor = await row(0).boundingBox(), panel = await detail.boundingBox();
          const scrollAfter = await shell.evaluate(dialog => dialog.scrollTop);
          assert.ok(Math.abs(before.y + scrollBefore - after.y - scrollAfter) <= 1 && Math.abs(before.height - after.height) <= 1);
          if (width >= 390 && height >= 800) assert.ok(Math.abs(before.y - after.y) <= 1);
          assert.ok(panel.y >= anchor.y + anchor.height && panel.y - anchor.y - anchor.height <= 3);
          assert.ok(panel.x >= 0 && panel.x + panel.width <= width + 1);
          assert.equal(await detail.locator("input, select, textarea").count(), 0);
          assert.equal(await detail.locator(":scope > :not(dl)").count(), 0, "附层直接显示四项营养，不另加本次用量");
          const facts = await readouts(detail);
          assert.deepEqual(facts.map(metric => metric.text.replace(/\s+/g, " ").trim()), ["248 千卡", "46.5 g", "0 g", "5.4 g"]);
          assert.ok(facts.every(fact => fact.lines === 1 && Math.abs(fact.bottom - fact.unitBottom) < 6));
          if (width > 350) assert.ok(facts.every(fact => Math.abs(fact.top - facts[0].top) <= 1));
          if (full || width !== 390) await shot("read-only");
          await page.keyboard.press("Escape");
          await detail.waitFor({ state: "hidden" });
          assert.equal(await info.evaluate(node => node === document.activeElement), true);
        } else {
          assert.ok(await row(0).getByText("248", { exact: false }).isVisible());
          const amount = await field("数量 1").boundingBox();
          const calories = await row(0).locator('[data-meal-nutrient="caloriesKcal"]').boundingBox();
          const libraryWidth = (await picker.boundingBox()).width;
          const entryWidth = (await form.getByRole("region", { name: "本餐食物" }).boundingBox()).width;
          assert.ok(Math.abs(libraryWidth / (libraryWidth + entryWidth) - .34) <= .015, name + " 食材库占比");
          assert.ok(Math.abs(calories.y + calories.height / 2 - amount.y - amount.height / 2) <= 3, name + " 四项营养同行");
        }

        await manual();
        await field("自由填写食物名称").fill("手工凉拌豆腐");
        await field("数量 3").fill("1");
        const manualUnit = field("单位 3");
        await manualUnit.fill("毫升");
        const unitDisplay = [await checkUnitDisplay(manualUnit, "毫升", name)];
        await manualUnit.fill("份");

        for (const [label, value] of [["蛋白质", "11"], ["碳水", "5"], ["脂肪", "4"]]) {
          await field("本次" + label + " 3").fill(value);
        }
        await field("本次脂肪 3").blur();
        assert.equal(await field("本次热量 3").inputValue(), "100");
        const macroField = await field("本次蛋白质 3").evaluate(input => {
          const face = getComputedStyle(input.parentElement, "::before");
          return { height: parseFloat(face.height), width: parseFloat(face.width), target: input.clientHeight };
        });
        assert.equal(macroField.height, 32);
        assert.ok(macroField.width <= (mobile ? 112 : 64));
        assert.ok(macroField.target >= 44);
        const columns = await checkMealColumns(form, mobile, name);
        const numberAlignment = await checkNumberAlignment(form, mobile, name);
        const basisButton = row(2).getByRole("button", { name: "手工凉拌豆腐的营养依据", exact: true });
        const choices = page.locator('[data-meal-details="choices"]:popover-open[data-positioned]');
        const basisGroup = choices.getByRole("group", { name: "营养依据 3", exact: true });
        const reference = basisGroup.getByRole("button", { name: "标签／成分表", exact: true });
        const estimated = basisGroup.getByRole("button", { name: "直接预估", exact: true });
        await basisButton.click();
        await basisGroup.waitFor();
        assert.equal(await choices.locator("select").count(), 0, name + " 依据直接列出选项");
        assert.equal(await basisGroup.getByRole("button").count(), 2, name + " 新手填项只显示两种可选依据");
        assert.equal(await estimated.getAttribute("aria-pressed"), "true");
        assert.equal(await reference.getAttribute("aria-pressed"), "false");
        if (full || width === 320) await shot("source-choices");
        if (mobile) await reference.click();
        else {
          assert.ok(await estimated.evaluate(node => node === document.activeElement), name + " 打开时焦点位于当前依据");
          await page.keyboard.press("Shift+Tab");
          assert.ok(await reference.evaluate(node => node === document.activeElement), name + " 键盘可移动到另一依据");
          await page.keyboard.press("Enter");
        }
        await choices.waitFor({ state: "hidden" });
        assert.ok(await basisButton.evaluate(node => node === document.activeElement), name + " 选择依据后焦点返回按钮");
        await basisButton.click();
        await basisGroup.waitFor();
        assert.equal(await reference.getAttribute("aria-pressed"), "true");
        assert.equal(await estimated.getAttribute("aria-pressed"), "false");
        await page.keyboard.press("Escape");
        await choices.waitFor({ state: "hidden" });
        assert.equal(await field("本次热量 3").inputValue(), "100", name + " 切换依据后保留手填营养");
        let expandedNutrition = null;
        if (mobile) {
          const nutrientInputs = ["热量", "蛋白质", "碳水", "脂肪"].map(label => field("本次" + label + " 3"));
          const nutrientBoxes = await Promise.all(nutrientInputs.map(input => input.boundingBox()));
          assert.ok(nutrientBoxes.every(box => box && box.width > 0 && box.height >= 43.9));
          for (const [index, box] of nutrientBoxes.entries()) {
            assert.ok(Math.abs(box.y - nutrientBoxes[0].y) <= 1, name + " 热量、蛋白质、碳水、脂肪四个输入框同排");
            assert.ok(Math.abs(box.width - nutrientBoxes[0].width) <= 1, name + " 四项手填营养输入等宽");
            if (index) assert.ok(box.x >= nutrientBoxes[index - 1].x + nutrientBoxes[index - 1].width - 1,
              name + " 相邻营养输入框无重叠");
          }
          assert.ok(await basisButton.getByText("依据", { exact: true }).isVisible());
          const basisBox = await basisButton.boundingBox();
          const lastNutrient = nutrientBoxes.at(-1);
          const lastBottom = lastNutrient.y + lastNutrient.height;
          const basisCenter = basisBox.y + basisBox.height / 2;
          assert.ok(basisCenter > lastNutrient.y && basisCenter < lastBottom
            && basisBox.x >= lastNutrient.x + lastNutrient.width - 1,
          name + " 依据在四项营养的同一行右侧，与输入区域分开");
          assert.ok(basisBox.width >= 43.9 && basisBox.height >= 43.9, name + " 依据保留44px触控区");
          const panel = await nutrientInputs[3].evaluate(input => {
            const { y, height, bottom } = input.closest("[data-meal-nutrient]").parentElement.getBoundingClientRect();
            return { y, height, bottom };
          });
          assert.ok(panel.bottom - lastBottom <= 12 && panel.bottom >= lastBottom - 1,
            name + " 四项营养下方无额外依据空行 " + JSON.stringify({ panel, lastBottom }));
          expandedNutrition = { fields: nutrientBoxes, basis: basisBox, panel, spaceAfterInputs: panel.bottom - lastBottom };
          const manualFields = [field("食物名称 3"), field("数量 3"), field("单位 3"),
            row(2).getByRole("button", { name: /^收起.+营养$/ })];
          await checkRowIcon(manualFields[3], "手填展开的营养");
          const arrowTransform = button => button.locator("svg").evaluate(icon => getComputedStyle(icon).transform);
          const expandedArrow = await arrowTransform(manualFields[3]);
          const bounds = await Promise.all(manualFields.map(locator => locator.boundingBox()));
          const centers = bounds.map(box => box.y + box.height / 2);
          assert.ok(Math.max(...centers) - Math.min(...centers) <= 1, name + " 手填四项同一行");
          assert.equal(await manualFields[0].inputValue(), "手工凉拌豆腐");
          await manualFields[0].focus();
          await manualFields[0].press("End");
          assert.equal(await manualFields[0].evaluate(input => input.selectionEnd), "手工凉拌豆腐".length,
            name + " 手填名称可编辑到最后一个字");
          await row(2).getByRole("button", { name: /^收起.+营养$/ }).click();
          assert.equal(await field("本次热量 3").isVisible(), false);
          const collapsed = row(2).getByRole("button", { name: /^展开.+营养$/ });
          await checkRowIcon(collapsed, "手填收起的营养");
          assert.notEqual(await arrowTransform(collapsed), expandedArrow, name + " 展开和收起的营养箭头方向不同");
          if (height === 560) await collapsed.evaluate(button => {
            const dialog = button.closest("dialog"), footer = dialog.querySelector("[data-meal-footer]");
            dialog.scrollTop += button.getBoundingClientRect().bottom - footer.getBoundingClientRect().top + 5;
          });
          await collapsed.click();
          assert.equal(await field("本次热量 3").inputValue(), "100");
          if (height === 560) {
            await settle();
            const visible = await basisButton.evaluate(button => {
              const id = button.closest("[data-meal-row]").querySelector('button[aria-controls$="-nutrients"]').getAttribute("aria-controls");
              const panel = document.getElementById(id).getBoundingClientRect();
              const footer = button.closest("dialog").querySelector("[data-meal-footer]").getBoundingClientRect();
              return { panelBottom: panel.bottom, footerTop: footer.top, basisBottom: button.getBoundingClientRect().bottom };
            });
            assert.ok(Math.max(visible.panelBottom, visible.basisBottom) <= visible.footerTop + 1,
              name + " 矮屏展开后四格和依据完整位于本餐合计上方 " + JSON.stringify(visible));
            expandedNutrition.reopened = visible;
            await shot("expanded-short");
          }
        }
        if (full) {
          await manual();
          await field("自由填写食物名称").fill("待移除的手填项");
          await removeFood(3, "待移除的手填项").click();
          assert.equal(await form.locator("[data-meal-row]").count(), 3, name + " 在行内移除手填食物");
          assert.equal(await field("本次热量 3").inputValue(), "100", name + " 保留其他食物的营养输入");
        }
        await checkFit();
        if (full || !mobile || width === 320) {
          if (mobile) await field("本次脂肪 3").scrollIntoViewIfNeeded();
          await shot("mixed");
        }

        if (mobile) await showLibrary();
        await picker.getByRole("button", { name: "全部", exact: true }).click();
        await picker.getByLabel("搜索食材", { exact: true }).fill(packagedName);
        if (mobile) {
          await action("checkbox", "选择 " + packagedName).check();
          await form.getByRole("button", { name: "加入本餐", exact: true }).click();
        } else await action("button", "添加 " + packagedName).click();
        await form.locator("[data-meal-pane-transition]").waitFor({ state: "detached" });
        const packageUnit = field("单位 4");
        assert.equal(await packageUnit.inputValue(), "盒");
        unitDisplay.push(await checkUnitDisplay(packageUnit, "盒", name));
        await packageUnit.selectOption({ label: "毫升" });
        assert.equal(await field("数量 4").inputValue(), "200", name + " 一盒换算成200毫升");
        unitDisplay.push(await checkUnitDisplay(packageUnit, "毫升", name));
        if (full || width === 320) await shot("package-unit");
        await removeFood(3, packagedName).click();
        assert.equal(await form.locator("[data-meal-row]").count(), 3);
        assert.equal(await manualUnit.inputValue(), "份", name + " 切换包装单位保留手填单位");

        if (full) {
          const note = form.locator("summary").filter({ hasText: /^备注/ });
          assert.equal(await field("餐次备注").isVisible(), false);
          await note.click();
          await field("餐次备注").fill("本地验收，点击保存前核对。");
          await note.click();
          if (mobile) {
            await showLibrary();
            await picker.getByLabel("搜索食材", { exact: true }).fill("找不到的测试名称");
            await picker.getByText("没有匹配的食材", { exact: true }).waitFor();
            await page.keyboard.press("Escape");
            await picker.waitFor({ state: "hidden" });
            assert.equal(await field("食物名称 3").inputValue(), "手工凉拌豆腐");
          }
          const shellBeforePhoto = await shell.boundingBox();
          await form.getByRole("button", { name: "AI 拍照录入" }).click();
          const photo = page.locator("[data-meal-photo-entry]:visible");
          await photo.waitFor();
          await photo.getByRole("button", { name: mobile ? "拍照或选择照片" : "选择照片", exact: true }).waitFor();
          await settle();
          assert.ok(Math.abs((await shell.boundingBox()).y - shellBeforePhoto.y) <= 1);
          if (mobile) await shot("photo-entry");
          await photo.getByRole("button", { name: /返回填写/ }).click();
          await form.waitFor();
          assert.equal(await field("食物名称 3").inputValue(), "手工凉拌豆腐");
          assert.equal(await field("餐次备注").inputValue(), "本地验收，点击保存前核对。");

          const mealType = "手动验收 " + engine + " " + width;
          await field("餐次").fill(mealType);
          await save().click();
          await form.waitFor({ state: "hidden" });
          const saved = (await readMealSnapshot(db, config.userId, [config.today], { images: true })).meals
            .filter(meal => meal.mealType === mealType && !meal.deletedAt);
          assert.equal(saved.length, 1);
          assert.equal(saved[0].notes, "本地验收，点击保存前核对。");
          assert.deepEqual(saved[0].items.map(item => item.name), ["原味鸡胸肉", "清蒸西兰花", "手工凉拌豆腐"]);
          assert.deepEqual(saved[0].items.map(item => Number(item.quantity)), [150, 80, 1]);
          assert.equal(Number(saved[0].items[0].nutrition.carbsG), 0);
          assert.equal(Number(saved[0].items[2].nutrition.caloriesKcal), 100);
          assert.equal(saved[0].items[2].sourceKind, "reference", name + " 保存时写入手工选定的依据");
          if (mobile && config.samples?.length) {
            await page.goto(origin + "/dashboard/meals?entry=1&date=" + config.today);
            await form.waitFor();
            await field("餐次").fill("照片验收 " + engine);
            await form.getByRole("button", { name: "AI 拍照录入" }).click();
            await photo.waitFor();
            await photo.locator('input[type="file"]').setInputFiles(config.samples[0].file);
            await photo.getByAltText("待识别照片 1").waitFor();
            await photo.getByText("补充说明", { exact: false }).first().click();
            await photo.getByRole("textbox", { name: "补充说明" }).fill("我吃了1份");
            await photo.getByRole("textbox", { name: "补充说明" }).blur();
            const recognize = photo.getByRole("button", { name: "识别食物" });
            await page.waitForFunction(() => ![...document.querySelectorAll('[data-meal-photo-entry] button')]
              .find(node => node.textContent.trim() === "识别食物").disabled, null, { timeout: 25000 });
            await shot("photo-ready");
            await recognize.click();
            await form.waitFor({ timeout: 30000 });
            const untouched = (await readMealSnapshot(db, config.userId, [config.today])).meals
              .filter(meal => meal.items.some(item => item.name === "AI 识别食物"));
            assert.equal(untouched.length, 0);
            assert.ok(await form.locator('[data-meal-row] input[value="AI 识别食物"]').isVisible());
            await shot("photo-review");
            await save().click();
            await form.waitFor({ state: "hidden" });
            const recognized = (await readMealSnapshot(db, config.userId, [config.today], { images: true })).meals
              .filter(meal => !meal.deletedAt && meal.items.some(item => item.name === "AI 识别食物"));
            assert.equal(recognized.length, 1);
            assert.equal(recognized[0].imageIds.length, 1);
          }

        }
        results.push({ name, amountGeometry, headerColumns, columns, numberAlignment, expandedNutrition, unitDisplay, paneChanges, status: "passed", saved: !!full });
        console.log("PASS", engine, name);
      } catch (error) {
        await shot("failure").catch(() => {});
        throw error;
      } finally {
        await context.close();
      }
    }
    assert.deepEqual(pageErrors, []);
  } finally {
    await browser.close();
    await writeFile(join(folder, "manifest.json"), JSON.stringify({ version, engine, results, pageErrors }, null, 2));
  }
}
