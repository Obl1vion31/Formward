import assert from "node:assert/strict";
import test from "node:test";
import { getEventListeners } from "node:events";
import { waitForVideo, VIDEO_READY_TIMEOUT_MS } from "./turn-video.ts";

class Video extends EventTarget {
  readyState = 0;
  error = null;
  ownerDocument = new EventTarget();
  plays = 0;
  paused = true;
  setAttribute() {}
  play() { this.plays++; this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
}

test("手机视频有当前帧时无需等完整可播放，metadata 不算就绪", async () => {
  const video = new Video();
  const controller = new AbortController();
  let completed = false;
  const ready = waitForVideo(video, controller.signal).then(() => { completed = true; });
  video.readyState = 1;
  video.dispatchEvent(new Event("progress"));
  await Promise.resolve();
  assert.equal(completed, false);
  video.readyState = 2;
  video.dispatchEvent(new Event("loadeddata"));
  await ready;
  assert.equal(getEventListeners(video, "loadeddata").length, 0);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  assert.equal(video.paused, true);
  await waitForVideo(video, controller.signal);
});

test("预加载永不完成时限时失败，清理监听和定时器", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const video = new Video();
  const controller = new AbortController();
  const failed = assert.rejects(waitForVideo(video, controller.signal), /预加载超时/);
  t.mock.timers.tick(VIDEO_READY_TIMEOUT_MS);
  await failed;
  for (const event of ["loadeddata", "canplay", "canplaythrough", "progress", "playing", "timeupdate", "error"]) {
    assert.equal(getEventListeners(video, event).length, 0);
  }
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  assert.equal(getEventListeners(video.ownerDocument, "touchend").length, 0);
  assert.equal(video.paused, true);
});

test("视频错误与卸载取消立即结束等待，不留下加载监听", async () => {
  const video = new Video();
  const controller = new AbortController();
  const failed = assert.rejects(waitForVideo(video, controller.signal), /视频加载失败/);
  video.dispatchEvent(new Event("error"));
  await failed;
  const cancelled = assert.rejects(waitForVideo(video, controller.signal), { name: "AbortError" });
  controller.abort();
  await cancelled;
  await assert.rejects(waitForVideo(video, controller.signal), { name: "AbortError" });
  assert.equal(getEventListeners(video, "loadeddata").length, 0);
});

test("预加载受限时主动静音播放唤醒首帧，画面就绪后暂停", async () => {
  const video = new Video();
  video.play = () => {
    video.plays++;
    video.paused = false;
    queueMicrotask(() => {
      video.readyState = 2;
      video.dispatchEvent(new Event("loadeddata"));
    });
    return Promise.resolve();
  };
  await waitForVideo(video, new AbortController().signal);
  assert.equal(video.plays, 1);
  assert.equal(video.muted, true);
  assert.equal(video.defaultMuted, true);
  assert.equal(video.playsInline, true);
  assert.equal(video.paused, true);
});

test("自动播放拒绝后可由触摸恢复，超时后仍可重新初始化", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const video = new Video();
  video.play = () => {
    video.plays++;
    if (video.plays === 1) return Promise.reject(new DOMException("需要手势", "NotAllowedError"));
    video.readyState = 2;
    video.dispatchEvent(new Event("loadeddata"));
    return Promise.resolve();
  };
  const failed = assert.rejects(waitForVideo(video, new AbortController().signal), /预加载超时/);
  await Promise.resolve();
  t.mock.timers.tick(VIDEO_READY_TIMEOUT_MS);
  await failed;
  // 第一次超时不删除视频来源；后续手势可启动一个新的等待。
  await waitForVideo(video, new AbortController().signal);
  assert.equal(video.plays, 2);
  video.readyState = 1;
  video.play = () => Promise.reject(new DOMException("需要手势", "NotAllowedError"));
  const ready = waitForVideo(video, new AbortController().signal);
  video.play = () => {
    video.readyState = 2;
    video.dispatchEvent(new Event("playing"));
    return Promise.resolve();
  };
  video.ownerDocument.dispatchEvent(new Event("touchend"));
  await ready;
  assert.equal(getEventListeners(video.ownerDocument, "touchend").length, 0);
  assert.equal(video.paused, true);
});
