// 原始上传文件保持不变；播放文件保留 60 帧，逐帧关键帧便于任意方向寻帧。
export const TURN_VIDEO_SRC = "/videos/golden-turn-1s.mp4?v=6";
export const VIDEO_FRAME_COUNT = 60;
export const VIDEO_FPS = 60;

// 视频有额外留白，按头顶、躯干和尾滴匹配原来的 1.png / 12.png。
export const VIDEO_TRANSFORM = {
  desktop: { scale: 1.328, x: "-1.58%", y: "0.29%" },
  mobile: { scale: 1.30144, x: "-1.5484%", y: "-3.6958%" },
};

export function videoFrameIndex(progress: number) {
  return Math.min(VIDEO_FRAME_COUNT - 1, Math.max(0, Math.floor(progress * VIDEO_FRAME_COUNT)));
}

// 寻帧尚未完成时只保留最新目标，不用每次 rAF 重启解码。
// 倒放复用同一素材；不会依赖浏览器通常不支持的负 playbackRate。
export function createVideoScrubber(video: HTMLVideoElement, draw: (index: number) => void) {
  let target = 0;
  let requested = 0;
  let displayed = -1;
  let disposed = false;

  function seek() {
    if (disposed || video.seeking || video.readyState < 2 || displayed === target) return;
    requested = target;
    const time = (requested + 0.05) / VIDEO_FPS;
    if (Math.abs(video.currentTime - time) < 0.0001) {
      displayed = requested;
      draw(displayed);
    } else {
      video.currentTime = time;
    }
  }

  function seeked() {
    if (disposed) return;
    displayed = requested;
    draw(displayed);
    seek();
  }

  video.addEventListener("seeked", seeked);
  return {
    render(progress: number) { target = videoFrameIndex(progress); seek(); },
    dispose() { disposed = true; video.removeEventListener("seeked", seeked); },
  };
}

// 黑底视频通过 GPU 转成透明画面，保留舞台原有的暖光和 petrol 背景。
// 暗部的 RGB 除以 Alpha 后再输出，避免去黑后光晕被重复乘 Alpha 而变暗。
function createTransparentRenderer(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false });
  if (!gl) throw new Error("视频透明画面初始化失败");
  const shaders: WebGLShader[] = [];
  const program = gl.createProgram()!;
  function shader(type: number, source: string) {
    const value = gl!.createShader(type)!;
    shaders.push(value);
    gl!.shaderSource(value, source);
    gl!.compileShader(value);
    if (!gl!.getShaderParameter(value, gl!.COMPILE_STATUS)) throw new Error("视频着色器初始化失败");
    gl!.attachShader(program, value);
  }
  shader(gl.VERTEX_SHADER, `
    attribute vec2 position;
    varying vec2 uv;
    void main() { uv = (position + 1.0) * 0.5; gl_Position = vec4(position, 0.0, 1.0); }
  `);
  shader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    uniform sampler2D frame;
    varying vec2 uv;
    void main() {
      vec3 rgb = texture2D(frame, uv).rgb;
      float alpha = min(1.0, max(rgb.r, max(rgb.g, rgb.b)) * 8.0);
      gl_FragColor = alpha > 0.0 ? vec4(rgb / alpha, alpha) : vec4(0.0);
    }
  `);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("视频合成初始化失败");
  gl.useProgram(program);
  const buffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.viewport(0, 0, canvas.width, canvas.height);
  return {
    draw() {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    dispose() {
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      shaders.forEach((value) => gl.deleteShader(value));
    },
  };
}

function waitForVideo(video: HTMLVideoElement, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const clean = () => {
      video.removeEventListener("canplaythrough", ready);
      video.removeEventListener("error", failed);
      signal.removeEventListener("abort", aborted);
    };
    const ready = () => { clean(); resolve(); };
    const failed = () => { clean(); reject(new Error("视频加载失败")); };
    const aborted = () => { clean(); reject(new DOMException("已取消", "AbortError")); };
    if (signal.aborted) return aborted();
    if (video.error) return failed();
    if (video.readyState >= 4) return ready();
    video.addEventListener("canplaythrough", ready);
    video.addEventListener("error", failed);
    signal.addEventListener("abort", aborted, { once: true });
  });
}

export function createTurnVideo(video: HTMLVideoElement, canvas: HTMLCanvasElement, layer: HTMLElement) {
  const controller = new AbortController();
  let renderer: ReturnType<typeof createTransparentRenderer> | undefined;
  let scrubber: ReturnType<typeof createVideoScrubber> | undefined;
  const ready = waitForVideo(video, controller.signal).then(() => {
    if (controller.signal.aborted) return;
    renderer = createTransparentRenderer(video, canvas);
    renderer.draw();
    layer.dataset.videoFrame = "0";
    scrubber = createVideoScrubber(video, (index) => {
      renderer?.draw();
      layer.dataset.videoFrame = String(index);
    });
  });

  return {
    ready,
    render(progress: number) {
      scrubber?.render(progress);
      // 校准随进度平滑变化；手机由同一桌面比例继承。
      const scale = 1.328 + (1.346 - 1.328) * progress;
      const x = -1.58 + (-1.6 + 1.58) * progress;
      const y = 0.29 + (0.96 - 0.29) * progress;
      layer.style.setProperty("--frame-scale-desktop", String(scale));
      layer.style.setProperty("--frame-x-desktop", `${x}%`);
      layer.style.setProperty("--frame-y-desktop", `${y}%`);
      layer.style.setProperty("--frame-scale-mobile", String(scale * 0.98));
      layer.style.setProperty("--frame-x-mobile", `${x * 0.98}%`);
      layer.style.setProperty("--frame-y-mobile", `${0.98 * (y - 1) - 3}%`);
    },
    dispose() { controller.abort(); scrubber?.dispose(); renderer?.dispose(); video.pause(); },
  };
}
