// 参考舞台为 1440×900。两个空间轴形成倾斜椭圆，透视投影让节点走出远近层次。
// 所有位置只由人物进度决定；这里不创建第二条动画时间线。
const START_ANGLES = [210, 330, 450];
export const ORBIT_TURN_DEGREES = 150;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(value: number) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function project(angle: number) {
  const radians = angle * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const depth = 160 * cosine - 240 * sine;
  const perspective = 2400 / (2400 - depth);
  return {
    x: (792 + (288 * cosine + 316.8 * sine) * perspective) / 1440,
    y: (450 + (-135 * cosine + 252 * sine) * perspective) / 900,
    depth,
  };
}

export function orbitPose(index: number, animationProgress: number) {
  const progress = clamp01(animationProgress);
  const angle = START_ANGLES[index] + ORBIT_TURN_DEGREES * progress;
  const point = project(angle);
  const near = clamp01((point.depth + 320) / 640);
  const emphasis = smoothstep(progress);
  return {
    ...point,
    angle,
    scale: 0.95 + 0.1 * near,
    titleOpacity: (1 - 0.22 * emphasis) * (0.9 + 0.1 * near),
    detailOpacity: (1 - 0.12 * emphasis) * (0.96 + 0.04 * near),
    trackOpacity: 1 - 0.25 * emphasis,
  };
}

// 椭圆只绘制连接三个节点的 240° 弧段；远处更淡，人物始终位于轨道图层上方。
function orbitPaths(progress: number, width: number, height: number) {
  const paths = { front: "", back: "" };
  const start = START_ANGLES[0] + ORBIT_TURN_DEGREES * clamp01(progress);
  for (let step = 0; step < 60; step++) {
    const from = project(start + step * 4);
    const to = project(start + (step + 1) * 4);
    const side = from.depth + to.depth >= 0 ? "front" : "back";
    paths[side] += `M${from.x * width} ${from.y * height}L${to.x * width} ${to.y * height}`;
  }
  return paths;
}

export function createOrbitRenderer(root: HTMLDivElement) {
  const scenes = Array.from(root.querySelectorAll<HTMLDivElement>("[data-orbit-scene]")).map((scene) => ({
    scene,
    svg: scene.querySelector<SVGSVGElement>("svg")!,
    front: scene.querySelector<SVGPathElement>(".home-orbit-front")!,
    back: scene.querySelector<SVGPathElement>(".home-orbit-back")!,
    labels: Array.from(scene.querySelectorAll<HTMLParagraphElement>(".home-principle")),
    nodes: Array.from(scene.querySelectorAll<HTMLSpanElement>(".home-orbit-node")),
    leaders: Array.from(scene.querySelectorAll<SVGPathElement>(".home-orbit-leader")),
    sizes: [] as { width: number; titleHeight: number }[],
  }));
  let width = 0;
  let height = 0;
  let formWidth = 0;
  let progress = 0;
  let reduced = false;
  let disposed = false;

  function drawScene(group: typeof scenes[number], value: number) {
    const paths = orbitPaths(value, width, height);
    group.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    group.front.setAttribute("d", paths.front);
    group.back.setAttribute("d", paths.back);
    group.scene.style.setProperty("--orbit-track-opacity", String(orbitPose(0, value).trackOpacity));
    group.labels.forEach((label, index) => {
      const pose = orbitPose(index, value);
      const nodeX = pose.x * width;
      const nodeY = pose.y * height;
      const size = group.sizes[index];
      // 文字朝向读者；穿过中轴时连续改变引线方向，不翻面、不突然换边。
      const leftSide = smoothstep((0.61 - pose.x) / 0.12);
      const scaledWidth = size.width * pose.scale;
      const margin = Math.max(20, width * 0.035);
      let labelX = Math.min(width - margin - scaledWidth,
        Math.max(margin, nodeX + 36 - (scaledWidth + 72) * leftSide));
      // 横屏中表单占舞台更宽的比例；最后 200ms 平滑让出表单及 24px 间距。
      const safeX = index === 2
        ? Math.min(labelX, width / 2 - formWidth / 2 - 24 - scaledWidth)
        : Math.max(labelX, width / 2 + formWidth / 2 + 24);
      labelX += (safeX - labelX) * smoothstep((value - 0.6) / 0.4);
      labelX = Math.min(width - margin - scaledWidth, Math.max(margin, labelX));
      const labelY = nodeY - size.titleHeight * pose.scale / 2;
      label.style.setProperty("--label-x", `${labelX}px`);
      label.style.setProperty("--label-y", `${labelY}px`);
      label.style.setProperty("--label-scale", String(pose.scale));
      label.style.setProperty("--title-opacity", String(pose.titleOpacity));
      label.style.setProperty("--detail-opacity", String(pose.detailOpacity));
      const node = group.nodes[index];
      node.style.left = `${pose.x * 100}%`;
      node.style.top = `${pose.y * 100}%`;
      const leaderX = leftSide > 0.5 ? labelX + scaledWidth + 12 : labelX - 12;
      group.leaders[index].setAttribute("d", `M${leaderX} ${nodeY}H${nodeX}`);
    });
  }

  function render(animationProgress: number, reducedMotion = false) {
    progress = clamp01(animationProgress);
    reduced = reducedMotion;
    if (!width || !height || disposed) return;
    root.dataset.orbitProgress = String(progress);
    root.dataset.orbitAngle = String(ORBIT_TURN_DEGREES * progress);
    root.style.setProperty("--orbit-start-opacity", String(reduced ? 1 - progress : 1));
    root.style.setProperty("--orbit-end-opacity", String(reduced ? progress : 0));
    root.style.setProperty("--orbit-start-visibility", reduced && progress === 1 ? "hidden" : "visible");
    root.style.setProperty("--orbit-end-visibility", reduced && progress > 0 ? "visible" : "hidden");
    // 手机位置由 CSS 底部网格决定，只复用明暗变化；不出现两套重叠文字。
    root.style.setProperty("--mobile-title-opacity", String(1 - 0.22 * smoothstep(progress)));
    root.style.setProperty("--mobile-detail-opacity", String(1 - 0.12 * smoothstep(progress)));
    drawScene(scenes[0], reduced ? 0 : progress);
  }

  function measure() {
    if (disposed) return;
    width = root.clientWidth;
    height = root.clientHeight;
    formWidth = root.parentElement?.querySelector<HTMLElement>(".login-overlay")?.offsetWidth ?? 340;
    for (const group of scenes) {
      group.sizes = group.labels.map((label) => ({
        width: label.offsetWidth,
        titleHeight: label.querySelector<HTMLElement>(".home-principle-title")!.offsetHeight,
      }));
    }
    drawScene(scenes[1], 1);
    render(progress, reduced);
  }

  const observer = new ResizeObserver(measure);
  observer.observe(root);
  measure();
  // 本地微标签字体就绪后再测量；无逐帧 layout 读取，卸载后不再写 DOM。
  void document.fonts.ready.then(measure);
  return { render, dispose() { disposed = true; observer.disconnect(); } };
}
