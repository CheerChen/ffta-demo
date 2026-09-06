// Face-authored school. Geometry and UVs stay fixed when the camera rotates.
import * as THREE from "three";
import { currentMapId } from "./maps.js";
import { H_UNIT } from "./world.js";
import { buildFences, clearFences, setFencesTextured } from "./fences.js";

let mesh = null, textured = null, plain = null, model = null, outline = null;
const clamp = new Map();
const replacedProps = new Set();
// triangle index -> [r,c] for faces that stand in for a tile (mounds), or "prop"
// for sprite quads (trees, fences) that clicks pass through; null = wall.
let triCells = [];
const assetRoot = new URL("../data/school/", import.meta.url);

export function hasSchool() { return currentMapId === 0 && mesh !== null; }
export function getSchoolMeshes() { return hasSchool() ? [mesh] : []; }
export function schoolGroundPath() { return hasSchool() ? new URL("ground.png", assetRoot).href : null; }
export function schoolGroundHeight(r,c) { return hasSchool() ? clamp.get(`${r},${c}`) : undefined; }
export function schoolReplacesProp(file) { return hasSchool() && replacedProps.has(file); }
// Tiled patches baked into ground.png for faces the source never shows.
export function schoolPatches() { return hasSchool() ? model.patches : null; }
export function schoolPatchStepPx() { return model?.patchStepPx ?? 12; }
export function schoolBaseH() { return model ? model.base / H_UNIT : 0; }
// Authored faces that represent a walkable tile (mound domes) pick as that tile.
export function schoolTileFromHit(hit) {
  const info = hit?.faceIndex != null ? triCells[hit.faceIndex] : null;
  return Array.isArray(info) ? info : null;
}
// Sprite quads (trees, fences, weathervane) never block a click.
export function schoolHitIsProp(hit) {
  return hit?.faceIndex != null && triCells[hit.faceIndex] === "prop";
}

export async function buildSchool(scene) {
  clearSchool(scene);
  if (currentMapId !== 0) return;
  const response = await fetch(new URL("model.json", assetRoot));
  if (!response.ok) throw new Error(`学校模型加载失败 (${response.status})`);
  model = await response.json();
  if (model.hUnit !== H_UNIT) throw new Error("学校模型与地图高度比例不同，请重新运行 tools/build_school.py");
  const texture = await new THREE.TextureLoader().loadAsync(new URL("school_atlas.png", assetRoot).href);
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  const positions=[],uv=[],indices=[];
  let offset=0;
  triCells=[];
  for (const face of model.faces) {
    positions.push(...face.vertices.flat()); uv.push(...face.uv.flat());
    const info = face.cell ?? (face.kind === "prop" ? "prop" : null);
    for (let i=1;i<face.vertices.length-1;i++) { indices.push(offset,offset+i,offset+i+1); triCells.push(info); }
    offset+=face.vertices.length;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  // alphaTest: prop quads (trees, fences) carry sprite alpha in the atlas;
  // everything else in the atlas is opaque, so walls are unaffected.
  textured = new THREE.MeshBasicMaterial({ map:texture, alphaTest:0.5 });
  plain = new THREE.MeshLambertMaterial({ color:0xe8e6de });
  mesh = new THREE.Mesh(geometry,textured);
  mesh.name = "school";
  mesh.castShadow = true;
  // Shadow silhouettes follow the sprite alpha too, as props.js does.
  mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking:THREE.RGBADepthPacking, map:texture, alphaTest:0.5 });
  mesh.userData = { isSchool:true, faces:model.faces.length };
  for (const [r,c] of model.terrainCells) clamp.set(`${r},${c}`,model.base/H_UNIT);
  for (const file of model.replacedProps) replacedProps.add(file);
  scene.add(mesh);
  buildMoundOutline(scene);
  await buildFences(scene, model.fences || []);
}

// Snow mounds are repainted, not baked, so the art's dark silhouette line is
// drawn here as an inverted hull: each dome's faces scaled up a little about
// the cell's ground centre and rendered back-face only. It follows the true
// silhouette from every dock instead of a dock-0 outline stuck to the dome.
function buildMoundOutline(scene) {
  const positions=[], indices=[];
  let offset=0;
  const k = 1.08, cy = model.base - 0.05;
  for (const face of model.faces) {
    if (!face.cell) continue;
    const [r,c] = face.cell;
    for (const [x,y,z] of face.vertices) positions.push(c+(x-c)*k, cy+(y-cy)*k, r+(z-r)*k);
    for (let i=1;i<face.vertices.length-1;i++) indices.push(offset,offset+i,offset+i+1);
    offset+=face.vertices.length;
  }
  // The hull's lower part sits under the terrain, so the foot of a mound has
  // no line, as in the art: the outline only rims the upper silhouette.
  if (!positions.length) return;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
  geometry.setIndex(indices);
  outline = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: model.moundOutline ?? "#485888", side: THREE.BackSide }));
  outline.name = "mound-outline";
  scene.add(outline);
}

export function setSchoolTextured(enabled) {
  setFencesTextured(enabled);
  if (mesh) mesh.material = enabled ? textured : plain;
}

export function clearSchool(scene) {
  clearFences();
  if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); mesh.customDepthMaterial?.dispose(); }
  if (outline) { scene.remove(outline); outline.geometry.dispose(); outline.material.dispose(); }
  if (textured) { textured.map.dispose(); textured.dispose(); }
  plain?.dispose();
  mesh=textured=plain=model=outline=null; clamp.clear(); replacedProps.clear(); triCells=[];
}
