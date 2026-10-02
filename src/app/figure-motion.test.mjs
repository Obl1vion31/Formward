import assert from "node:assert/strict";
import test from "node:test";
import { createFigureMotion } from "./figure-motion.ts";

// 固定 performance.now 与 rAF，让跟随 / 归稳公式在明确的毫秒位置上接受检查。
// samples 收集控制器输出，pending 读取剩余 rAF，避免只检查“位置看起来接近零”。
function setup(t) {
  let now = 0;
  let nextId = 0;
  const frames = new Map();
  const samples = [];
  const restore = [];
  t.mock.method(performance, "now", () => now);
  for (const [key, value] of Object.entries({
    requestAnimationFrame(callback) { const id = ++nextId; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
  })) {
    const before = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true });
    restore.push(() => {
      if (before) Object.defineProperty(globalThis, key, before);
      else delete globalThis[key];
    });
  }
  const motion = createFigureMotion((pose, running) => samples.push({ ...pose, running }));
  // 必须先销毁控制器，再恢复 rAF，否则 dispose 无法取消假时钟中的待执行帧。
  t.after(() => { motion.dispose(); restore.forEach((reset) => reset()); });
  return {
    motion, samples,
    current: () => samples.at(-1),
    pending: () => frames.size,
    advance(time) {
      now = time;
      const callbacks = [...frames.values()]; frames.clear();
      callbacks.forEach((callback) => callback(time));
    },
  };
}

function centred(sample) {
  assert.deepEqual(sample, { x: 0, y: 0, rx: 0, ry: 0, running: false });
}

test("鼠标反向位移、朝鼠标倾转，远距离输入仍在幅度上限内", (t) => {
  const { motion, advance, current } = setup(t);
  motion.setGain(1);
  motion.move(999, -999);
  advance(90);
  const pose = current();
  assert.ok(pose.x < -3.7 && pose.x > -3.9);
  assert.ok(pose.y > 2.5 && pose.y < 2.6);
  assert.ok(pose.ry > 0 && pose.ry <= 0.6);
  assert.ok(pose.rx > 0 && pose.rx <= 0.3);
});

// 180ms 跟随截止 + 600ms 回稳 = 780ms；不同模拟刷新率应在同一时间到同一位置。
for (const hz of [60, 120]) {
  test(`模拟 ${hz}Hz：同一时间跟随幅度一致，180ms 后回稳，780ms 完全停帧`, (t) => {
    const { motion, advance, current, pending } = setup(t);
    motion.setGain(1);
    motion.move(1, 1);
    for (let time = 1000 / hz; time < 180; time += 1000 / hz) advance(time);
    advance(180);
    const peak = current();
    assert.ok(peak.x < -5.18 && peak.x > -5.20);
    assert.ok(peak.y < -3.45 && peak.y > -3.47);
    for (let time = 180 + 1000 / hz; time < 480; time += 1000 / hz) advance(time);
    advance(480);
    assert.ok(Math.abs(current().x - peak.x / 2) < 1e-10);
    advance(780);
    centred(current());
    assert.equal(pending(), 0);
  });
}

test("播放关闭联动后 100ms 回中，忽略新鼠标，恢复后仅响应新输入", (t) => {
  const { motion, advance, current, pending } = setup(t);
  motion.setGain(1); motion.move(1, -1); advance(90);
  motion.setGain(0);
  const x = current().x;
  motion.move(-1, 1); advance(140);
  assert.ok(Math.abs(current().x - x / 2) < 1e-10);
  advance(190); centred(current());
  motion.setGain(0.5); advance(300); centred(current());
  assert.equal(pending(), 0);
  motion.move(-1, 1); advance(390);
  assert.ok(current().x > 0 && current().x <= 3);
  assert.ok(current().y < 0 && current().y >= -2);
  assert.ok(current().ry < 0 && current().ry >= -0.3);
});

test("表单聚焦以 180ms 回中，关闭期间的鼠标不会打断", (t) => {
  const { motion, advance, current, pending } = setup(t);
  motion.setGain(0.5); motion.move(1, -1); advance(90);
  motion.setGain(0, 180);
  motion.move(-1, 1); advance(180);
  assert.ok(current().x < 0);
  advance(270); centred(current());
  motion.move(1, -1); advance(400); centred(current());
  assert.equal(pending(), 0);
});

test("回稳中再次移动保持当前位置，方向随后改变", (t) => {
  const { motion, advance, current } = setup(t);
  motion.setGain(1); motion.move(1, 0); advance(480);
  const x = current().x;
  motion.move(-1, 0);
  assert.equal(current().x, x);
  advance(570);
  assert.ok(current().x > 0);
});

test("提交、失焦或能力关闭可立即归零，并取消剩余回中帧", (t) => {
  const { motion, advance, current, pending } = setup(t);
  motion.setGain(1); motion.move(1, -1); advance(90);
  motion.setGain(0, 180); advance(120);
  motion.setGain(0, 0); centred(current());
  assert.equal(pending(), 0);
  motion.setGain(0.5); motion.move(1, 1); advance(200);
  motion.reset(); centred(current());
  assert.equal(pending(), 0);
});

test("销毁后没有残留 rAF，也不会接受后续调用", (t) => {
  const { motion, advance, samples, pending } = setup(t);
  motion.setGain(1); motion.move(1, 1); advance(90);
  motion.dispose();
  const count = samples.length;
  motion.setGain(1); motion.move(1, 1); motion.reset(100); advance(500);
  assert.equal(samples.length, count);
  assert.equal(pending(), 0);
});
