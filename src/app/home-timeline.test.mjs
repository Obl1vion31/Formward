import assert from "node:assert/strict";
import test from "node:test";
import { createProgressTimeline, turnFrameWeights, PRE_LOGIN_DURATION_MS, ENDPOINT_BLEND_MS, REDUCED_DURATION_MS, loginReveal } from "./home-timeline.ts";
import { videoFrameIndex, createVideoScrubber } from "./turn-video.ts";
import { listenForDirectionIntent } from "./use-direction-trigger.ts";

// 在 Node 中模拟浏览器事件与 rAF，不需要真实等待 500ms。
// advance(time) 执行一次待处理帧，elapse(time) 只走时间，便于测试两帧之间的输入。
function browserClock(t) {
  const target = Object.assign(new EventTarget(), { innerHeight: 900 });
  const frames = new Map();
  let now = 0;
  let nextId = 0;
  t.mock.method(performance, "now", () => now);
  const globals = {
    window: target,
    Element: class Element {},
    requestAnimationFrame: (callback) => {
      const id = ++nextId;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
  };
  // 每个用例结束后恢复全局对象，避免一个测试的假浏览器污染下一个测试。
  for (const [name, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, name, original);
      else delete globalThis[name];
    });
  }
  function event(type, data = {}, time = now) {
    const event = new Event(type);
    Object.defineProperty(event, "timeStamp", { value: time });
    Object.assign(event, data);
    target.dispatchEvent(event);
  }
  return {
    event,
    wheel(deltaY, time = now, data = {}) { event("wheel", { deltaY, deltaX: 0, deltaMode: 0, ...data }, time); },
    elapse(time) { now = time; },
    advance(time) {
      now = time;
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback(now));
    },
  };
}

// 把真实的方向识别器接到真实的时间线，只替换环境与时钟，不复制被测规则。
function setupTimeline(t) {
  const browser = browserClock(t);
  const progress = [];
  const completed = [];
  const timeline = createProgressTimeline((value) => progress.push(value), (target) => completed.push(target));
  t.after(listenForDirectionIntent((target) => timeline.playTo(target)));
  return { browser, timeline, progress, completed };
}

test("一次下滚后无后续输入，500ms 内按 2 倍速经过视频的 60 帧", (t) => {
  const { browser, timeline, completed } = setupTimeline(t);
  browser.wheel(60);
  const seen = new Set([0]);
  for (let step = 1; step <= 100; step += 1) {
    browser.advance(PRE_LOGIN_DURATION_MS * step / 100);
    seen.add(videoFrameIndex(timeline.getProgress()));
  }
  assert.deepEqual([...seen], Array.from({ length: 60 }, (_, index) => index));
  assert.equal(timeline.getProgress(), 1);
  assert.equal(loginReveal(timeline.getProgress()), 1);
  assert.deepEqual(completed, [1]);
});

test("一次上滚后完整自动倒放，回到 Frame 1 并隐藏 Login", (t) => {
  const { browser, timeline, completed } = setupTimeline(t);
  browser.wheel(60);
  browser.advance(PRE_LOGIN_DURATION_MS);
  browser.wheel(-60);
  const seen = new Set([59]);
  for (let step = 1; step <= 100; step += 1) {
    browser.advance(PRE_LOGIN_DURATION_MS * (1 + step / 100));
    seen.add(videoFrameIndex(timeline.getProgress()));
  }
  assert.deepEqual([...seen], Array.from({ length: 60 }, (_, index) => 59 - index));
  assert.equal(timeline.getProgress(), 0);
  assert.equal(loginReveal(timeline.getProgress()), 0);
  assert.deepEqual(completed, [1, 0]);
});

test("正放中途反向保持当前进度，之后只下降，不先到 12", (t) => {
  const { browser, timeline, completed } = setupTimeline(t);
  browser.wheel(60);
  browser.advance(PRE_LOGIN_DURATION_MS * 0.75);
  const before = timeline.getProgress();
  assert.ok(before > 0.7 && before < 0.85);
  const reveal = loginReveal(before);
  browser.wheel(-60);
  assert.equal(timeline.getProgress(), before);
  browser.advance(PRE_LOGIN_DURATION_MS * 0.85);
  assert.ok(timeline.getProgress() < before);
  assert.ok(loginReveal(timeline.getProgress()) < reveal);
  browser.advance(PRE_LOGIN_DURATION_MS * 1.625);
  assert.equal(timeline.getProgress(), 0);
  assert.deepEqual(completed, [0]);
});

test("倒放中途再次正放从当前位置继续，不重置到 Frame 1", (t) => {
  const { browser, timeline, completed } = setupTimeline(t);
  browser.wheel(60);
  browser.advance(PRE_LOGIN_DURATION_MS);
  browser.wheel(-60);
  browser.advance(PRE_LOGIN_DURATION_MS * 1.375);
  const before = timeline.getProgress();
  browser.wheel(60);
  assert.equal(timeline.getProgress(), before);
  browser.advance(PRE_LOGIN_DURATION_MS * 1.5);
  assert.ok(timeline.getProgress() > before);
  browser.advance(PRE_LOGIN_DURATION_MS * 1.875);
  assert.equal(timeline.getProgress(), 1);
  assert.deepEqual(completed, [1, 1]);
});

test("同方向惯性和独立重复输入均不重启时间线", (t) => {
  const { browser, timeline, completed } = setupTimeline(t);
  browser.wheel(60);
  for (const fraction of [0.0625, 0.125, 0.1875, 0.75, 0.8125]) {
    const time = PRE_LOGIN_DURATION_MS * fraction;
    browser.advance(time);
    browser.wheel(60);
  }
  browser.advance(PRE_LOGIN_DURATION_MS);
  assert.equal(timeline.getProgress(), 1);
  assert.deepEqual(completed, [1]);
});

test("小幅反方向事件必须累计到阈值，噪声不会反向", (t) => {
  const browser = browserClock(t);
  const targets = [];
  t.after(listenForDirectionIntent((target) => targets.push(target)));
  browser.wheel(20, 0);
  browser.wheel(20, 400);
  assert.deepEqual(targets, []);
  browser.wheel(25, 420);
  browser.wheel(200, 440);
  browser.wheel(-10, 450);
  assert.deepEqual(targets, [1]);
  browser.wheel(-20, 470);
  browser.wheel(-15, 490);
  browser.wheel(-300, 510);
  assert.deepEqual(targets, [1, 0]);
});

test("行和页模式双向工作，横向手势和触控板缩放不触发", (t) => {
  const browser = browserClock(t);
  const targets = [];
  t.after(listenForDirectionIntent((target) => targets.push(target)));
  browser.wheel(60, 0, { ctrlKey: true });
  browser.wheel(60, 0, { deltaX: 100 });
  assert.deepEqual(targets, []);
  browser.wheel(3, 50, { deltaMode: 1 });
  browser.wheel(-1, 100, { deltaMode: 2 });
  assert.deepEqual(targets, [1, 0]);
});

test("移动端一次上滑自动正放、一次下滑自动倒放", (t) => {
  const { browser, timeline } = setupTimeline(t);
  const point = (y, x = 100) => ({ identifier: 1, clientX: x, clientY: y });
  browser.event("touchstart", { touches: [point(300)] });
  browser.event("touchmove", { touches: [point(240)] });
  browser.event("touchend", { changedTouches: [point(240)] });
  browser.advance(PRE_LOGIN_DURATION_MS);
  assert.equal(timeline.getProgress(), 1);
  browser.event("touchstart", { touches: [point(240)] });
  browser.event("touchend", { changedTouches: [point(310)] });
  browser.advance(PRE_LOGIN_DURATION_MS * 2);
  assert.equal(timeline.getProgress(), 0);
});

test("同一次触控手势也能中途反向，无需先松手", (t) => {
  const { browser, timeline, completed } = setupTimeline(t);
  const point = (y) => ({ identifier: 1, clientX: 100, clientY: y });
  browser.event("touchstart", { touches: [point(300)] });
  browser.event("touchmove", { touches: [point(240)] });
  browser.advance(PRE_LOGIN_DURATION_MS * 0.4375);
  const before = timeline.getProgress();
  browser.event("touchmove", { touches: [point(290)] });
  assert.equal(timeline.getProgress(), before);
  browser.advance(PRE_LOGIN_DURATION_MS * 0.5625);
  assert.ok(timeline.getProgress() < before);
  browser.advance(PRE_LOGIN_DURATION_MS);
  assert.deepEqual(completed, [0]);
});

test("横向触控、多指和取消手势不触发", (t) => {
  const browser = browserClock(t);
  const targets = [];
  t.after(listenForDirectionIntent((target) => targets.push(target)));
  const point = (x, y, identifier = 1) => ({ identifier, clientX: x, clientY: y });
  browser.event("touchstart", { touches: [point(100, 300)] });
  browser.event("touchend", { changedTouches: [point(200, 240)] });
  browser.event("touchstart", { touches: [point(100, 300), point(200, 300, 2)] });
  browser.event("touchmove", { touches: [point(100, 100)] });
  browser.event("touchstart", { touches: [point(100, 300)] });
  browser.event("touchcancel");
  browser.event("touchend", { changedTouches: [point(100, 100)] });
  assert.deepEqual(targets, []);
});

test("视频与静态端点互补，只有两端 40ms 混合，背景不会重复叠加", () => {
  assert.equal(PRE_LOGIN_DURATION_MS, 500);
  assert.equal(ENDPOINT_BLEND_MS, 40);
  assert.deepEqual(turnFrameWeights(0), [1, 0, 0]);
  assert.deepEqual(turnFrameWeights(1), [0, 0, 1]);
  assert.deepEqual(turnFrameWeights(0.5), [0, 1, 0]);
  const edge = ENDPOINT_BLEND_MS / PRE_LOGIN_DURATION_MS;
  for (let step = 0; step <= 1000; step++) {
    const progress = step / 1000;
    const [first, video, last] = turnFrameWeights(progress);
    assert.ok(Math.abs(first + video + last - 1) < 1e-12);
    assert.ok(first >= 0 && video >= 0 && last >= 0);
    if (progress >= edge && progress <= 1 - edge) assert.equal(video, 1);
    assert.equal(first > 0 && last > 0, false);
  }
});

test("视频帧索引限制在 0–59，结尾不寻到不可显示的 1 秒边界", () => {
  assert.equal(videoFrameIndex(-1), 0);
  assert.equal(videoFrameIndex(0), 0);
  assert.equal(videoFrameIndex(0.5), 30);
  assert.equal(videoFrameIndex(1), 59);
  assert.equal(videoFrameIndex(2), 59);
});

// 同样的实现按两种模拟刷新间隔采样；不是在实机 120Hz 显示器上执行。
for (const hz of [60, 120]) {
  for (const duration of [475, 500, 525]) {
    test(`${duration}ms / 模拟 ${hz}Hz：顺序完整、线性游标、反向复用时间轴`, (t) => {
      const browser = browserClock(t);
      const timeline = createProgressTimeline(() => {}, () => {}, duration);
      timeline.playTo(1);
      const seen = [0];
      for (let time = 1000 / hz; time < duration; time += 1000 / hz) {
        browser.advance(time);
        assert.ok(Math.abs(timeline.getProgress() - time / duration) < 1e-12);
        const dominant = videoFrameIndex(timeline.getProgress());
        if (seen.at(-1) !== dominant) seen.push(dominant);
      }
      browser.advance(duration);
      if (seen.at(-1) !== 59) seen.push(59);
      assert.equal(seen[0], 0);
      assert.equal(seen.at(-1), 59);
      assert.ok(seen.every((value, index) => index === 0 || value > seen[index - 1]));
      timeline.playTo(0);
      const reverseSeen = [59];
      for (let elapsed = 1000 / hz; elapsed < duration; elapsed += 1000 / hz) {
        browser.advance(duration + elapsed);
        assert.ok(Math.abs(timeline.getProgress() - (1 - elapsed / duration)) < 1e-12);
        const dominant = videoFrameIndex(timeline.getProgress());
        if (reverseSeen.at(-1) !== dominant) reverseSeen.push(dominant);
      }
      browser.advance(2 * duration);
      if (reverseSeen.at(-1) !== 0) reverseSeen.push(0);
      assert.equal(reverseSeen.at(-1), 0);
      assert.ok(reverseSeen.every((value, index) => index === 0 || value < reverseSeen[index - 1]));
      assert.equal(timeline.getProgress(), 0);
    });
  }
}

test("反向时补采输入时刻，按剩余时间行进，权重连续且没有二次缓动", (t) => {
  const browser = browserClock(t);
  const timeline = createProgressTimeline(() => {}, () => {});
  timeline.playTo(1);
  browser.advance(158);
  browser.elapse(162); // 两次 rAF 之间输入，反向应补采真实输入时刻。
  const before = turnFrameWeights(162 / PRE_LOGIN_DURATION_MS);
  timeline.playTo(0);
  assert.equal(timeline.getProgress(), 162 / PRE_LOGIN_DURATION_MS);
  assert.deepEqual(turnFrameWeights(timeline.getProgress()), before);
  browser.advance(243);
  assert.equal(timeline.getProgress(), 81 / PRE_LOGIN_DURATION_MS);
  timeline.playTo(1);
  browser.advance(328);
  assert.ok(Math.abs(timeline.getProgress() - 166 / PRE_LOGIN_DURATION_MS) < 1e-12);
  browser.advance(243 + PRE_LOGIN_DURATION_MS - 81);
  assert.equal(timeline.getProgress(), 1);
});

test("Login 在转身前段隐藏、接近背面时显现、终点完整进入", () => {
  assert.equal(loginReveal(0), 0);
  assert.equal(loginReveal(0.6), 0);
  assert.ok(loginReveal(8 / 11) > 0 && loginReveal(8 / 11) < 0.5);
  assert.ok(loginReveal(10 / 11) > 0.5 && loginReveal(10 / 11) < 1);
  assert.equal(loginReveal(1), 1);
});

test("reduced motion 保留双向交互，仅对首尾图片作快速 crossfade", (t) => {
  const browser = browserClock(t);
  const completed = [];
  const timeline = createProgressTimeline(() => {}, (target) => completed.push(target));
  timeline.playTo(1, true);
  browser.advance(REDUCED_DURATION_MS / 2);
  const weights = turnFrameWeights(timeline.getProgress(), true);
  assert.ok(weights[0] > 0 && weights[2] > 0);
  assert.equal(weights[1], 0);
  browser.advance(REDUCED_DURATION_MS);
  timeline.playTo(0, true);
  browser.advance(2 * REDUCED_DURATION_MS);
  assert.equal(timeline.getProgress(), 0);
  assert.deepEqual(completed, [1, 0]);
});

test("键盘方向独立于页面是否仍可滚动", (t) => {
  const browser = browserClock(t);
  const targets = [];
  t.after(listenForDirectionIntent((target) => targets.push(target)));
  browser.event("keydown", { key: "ArrowDown" });
  browser.event("keydown", { key: "PageUp" });
  assert.deepEqual(targets, [1, 0]);
});

test("取消时间线及手势监听后，不再更新或接收输入", (t) => {
  const browser = browserClock(t);
  let updates = 0;
  let completions = 0;
  const timeline = createProgressTimeline(() => { updates += 1; }, () => { completions += 1; });
  const cleanup = listenForDirectionIntent((target) => timeline.playTo(target));
  browser.wheel(60);
  timeline.cancel();
  cleanup();
  browser.wheel(-60);
  browser.advance(PRE_LOGIN_DURATION_MS);
  assert.equal(updates, 0);
  assert.equal(completions, 0);
});

// 使用异步 seek 的媒体替身，验证中途反向不会重启未完成的解码。
test("视频寻帧合并最新目标，倒放、重复输入和清理不产生多余解码", () => {
  const video = Object.assign(new EventTarget(), { readyState: 4, seeking: false });
  let currentTime = 0;
  const seeks = [];
  Object.defineProperty(video, "currentTime", {
    get: () => currentTime,
    set: (value) => { currentTime = value; video.seeking = true; seeks.push(value); },
  });
  const frames = [];
  const scrubber = createVideoScrubber(video, (index) => frames.push(index));
  scrubber.render(0.5);
  scrubber.render(0.6);
  scrubber.render(0.2);
  assert.equal(seeks.length, 1);
  video.seeking = false;
  video.dispatchEvent(new Event("seeked"));
  assert.equal(seeks.length, 2);
  assert.ok(seeks[1] < seeks[0]);
  video.seeking = false;
  video.dispatchEvent(new Event("seeked"));
  assert.deepEqual(frames, [30, 12]);
  scrubber.render(0.2);
  assert.equal(seeks.length, 2);
  scrubber.render(1);
  assert.ok(seeks.at(-1) < 1);
  scrubber.dispose();
  video.seeking = false;
  video.dispatchEvent(new Event("seeked"));
  scrubber.render(0);
  assert.equal(seeks.length, 3);
  assert.deepEqual(frames, [30, 12]);
});
