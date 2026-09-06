// ============================================================================
// Main entry: scene init, terrain build, camera rig, sprite loading,
//   picking, turn manager, render loop.
//   M3 milestone: movement with BFS range + path execution + jump steps.
// ============================================================================
import { initScene, render, resizeRenderer, getScene, getCamera } from "./scene.js";
import { buildTerrain, isBgEnabled, setBgEnabled, rebuildTerrainForDock } from "./terrain.js";
import { buildProps, updateProps, getPropGroup } from "./props.js";
import { buildSchool, setSchoolTextured } from "./school.js";
import { initCameraRig, updateCameraRig, getPoseDock, getCurrentAzimuth, rotateCW, rotateCCW, setOnDocked, getCurrentDock } from "./cameraRig.js";
import { loadAllSprites, resolveFallbacks, buildUnitSprites, updateUnitSprites } from "./unitSprites.js";
import { setUnitAnim, updateAnimations } from "../shared/animation.js";
import { updateMove } from "../shared/movement.js";
import { UNITS } from "../shared/units.js";
import { grid, ROWS, COLS } from "./maps.js";
import { advanceTicks } from "../shared/trace.js";
import { initPicking, updateHover, invalidatePickCandidates } from "./picking.js";
import { initTurnManager } from "./turnManager.js";
import { updateProjectiles } from "./projectile.js";
import { updatePopups } from "./fx.js";
import { buildClouds, updateClouds } from "./clouds.js";
import { initPerfMonitor, updatePerfMonitor } from "./perfMonitor.js";

async function init() {
  const canvas = document.getElementById("board");
  initScene(canvas);
  const scene = getScene();
  const camera = getCamera();
  await buildSchool(scene);

  // Props first: terrain clamps the render-height of prop collision cells
  // (tree/fence/snowman p=1 tiles) using the loaded prop manifest.
  await buildProps(scene);
  buildTerrain(scene);
  buildClouds(scene);
  initCameraRig(camera);
  // When camera finishes rotating to a new dock, rebuild terrain with
  // that dock's BG texture + UV formula.
  setOnDocked(() => {
    rebuildTerrainForDock(getScene(), getCurrentDock());
    invalidatePickCandidates();
  });
  resizeRenderer();

  // Load sprites, then build unit meshes
  document.getElementById("info").textContent = "加载精灵中…";
  await loadAllSprites();
  resolveFallbacks();
  buildUnitSprites(scene);

  // Set all units to idle
  UNITS.forEach(u => setUnitAnim(u, "idle"));

  // Init interaction + turn manager
  initPicking();
  initTurnManager();
  initPerfMonitor();

  document.getElementById("info").textContent = "就绪 — Q/E 旋转视角，B 切换贴图/白模型";

  function toggleTextures() {
    setBgEnabled(!isBgEnabled());
    setSchoolTextured(isBgEnabled());
    getPropGroup().visible = isBgEnabled();
    buildTerrain(getScene());
    invalidatePickCandidates();
    document.getElementById("info").textContent = isBgEnabled()
      ? "立体学校：墙面、屋顶和烟囱的贴图随模型旋转。"
      : "学校白模型与地图地形（B 切回贴图）。";
  }

  window.addEventListener("keydown", (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    // Q/E: rotate camera (tweened 90° by cameraRig)
    if (e.key === "q" || e.key === "Q") {
      rotateCW();
    } else if (e.key === "e" || e.key === "E") {
      rotateCCW();
    }
    // B: compare the BG/billboard presentation with the ROM flat-color mesh.
    if (e.key === "b" || e.key === "B") {
      toggleTextures();
    }
  });
}

// --- Render loop ---
// Frame rate capped to 60fps to halve GPU load (MacBook thermal).
const FPS_CAP = 60;
const FRAME_MS = 1000 / FPS_CAP;
let lastRender = 0;

function loop(t) {
  requestAnimationFrame(loop);
  const elapsed = t - lastRender;
  if (elapsed < FRAME_MS) return;
  lastRender = t;
  const dt = Math.min(elapsed, 50);

  const frameStart = performance.now();
  updateCameraRig(dt);
  advanceTicks(dt);
  updateAnimations(dt, updateMove);
  updateProjectiles(dt);
  updatePopups(dt);
  updateClouds();
  updateUnitSprites(getPoseDock(), getCurrentAzimuth());
  updateProps(getCurrentAzimuth(), getPoseDock());
  updateHover();
  render();
  updatePerfMonitor(t, performance.now() - frameStart);
}

init().then(() => {
  requestAnimationFrame(loop);
}).catch(err => {
  console.error("Init failed:", err);
  document.getElementById("info").textContent = "初始化失败: " + err.message;
});
