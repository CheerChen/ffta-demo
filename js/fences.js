// Thin fence panels. The source art supplies the silhouette and baked shading,
// just as the school texture does; world-space thickness stays camera-independent.
import * as THREE from "three";
import { TILE, H_UNIT } from "./world.js";

const group = new THREE.Group();
group.name = "fences";
let plain = null;
let sourceTexture = null;

export async function buildFences(scene, entries) {
  clearFences();
  plain = new THREE.MeshLambertMaterial({ color: 0xe8e6de });
  // One source and one world-to-source projection for every panel, so all
  // fences share the same scale as the school texture at the same position.
  const texture = await loadFenceSource();
  for (const entry of entries) {
    const material = new THREE.MeshBasicMaterial({ map: texture, alphaTest: 0.5 });
    const length = entry.length * TILE;
    // Sprite tops sit at most 13.75 source px above the ground line; the lift
    // raises the whole sprite by liftPx, so the panel grows by the larger lift.
    const bottom = -0.08, top = (14 + Math.max(0, liftOf(entry, true), liftOf(entry, false))) * H_UNIT / 6;
    const geometry = new THREE.BoxGeometry(length, top - bottom, 0.10 * TILE);
    geometry.translate(0, (top + bottom) / 2, 0);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = entry.name;
    mesh.position.set(entry.col * TILE, entry.groundH * H_UNIT, entry.row * TILE);
    mesh.rotation.y = entry.axis === "row" ? Math.PI / 2 : 0;
    mesh.castShadow = true;
    mesh.customDepthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking, map: texture, alphaTest: 0.5,
    });
    // projectFenceTexture reads entry.liftPx from userData, so set it first.
    mesh.userData = { isProp: true, fencePanel: true, entry, texturedMaterial: material };
    geometry.attributes.uv.array.set(projectFenceTexture(mesh));
    group.add(mesh);
  }
  scene.add(group);
}

export function setFencesTextured(enabled) {
  for (const mesh of group.children) mesh.material = enabled ? mesh.userData.texturedMaterial : plain;
}

export function clearFences() {
  group.removeFromParent();
  for (const mesh of group.children) {
    mesh.geometry.dispose();
    mesh.customDepthMaterial.dispose();
    mesh.userData.texturedMaterial.dispose();
  }
  group.clear();
  plain?.dispose();
  plain = null;
  sourceTexture?.dispose();
  sourceTexture = null;
}

async function loadFenceSource() {
  if (!sourceTexture) {
    sourceTexture = await new THREE.TextureLoader().loadAsync(new URL('../data/map_000_bg_top.png', import.meta.url).href);
    sourceTexture.magFilter = sourceTexture.minFilter = THREE.NearestFilter;
    sourceTexture.colorSpace = THREE.SRGBColorSpace;
    sourceTexture.generateMipmaps = false;
  }
  return sourceTexture;
}

// Project the panel's world-space vertices onto the source map (same mapping
// as terrain.js uvOf), so the sprite stays glued to the spot the art draws it.
// liftPx.front / liftPx.back: source pixels sampled below the ground line for
// the face toward the dock-0 camera (+x+z, the source view) and the face away
// from it. The source draws snow and the near posts below the ground line,
// i.e. under the terrain in 3D. Seen from dock 0 the sprite must stay where
// the art puts it; seen from behind, lifting the sprite by its overhang puts
// its lowest pixel on the terrain surface instead of sinking the posts.
function liftOf(entry, front) {
  const lift = entry?.liftPx;
  if (typeof lift === 'number') return lift;
  return (front ? lift?.front : lift?.back) || 0;
}
const DOCK0_TOWARD_CAMERA = new THREE.Vector3(1, 0, 1);
function projectFenceTexture(mesh) {
  mesh.updateMatrixWorld(true);
  const entry = mesh.userData.entry;
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  const p = mesh.geometry.attributes.position, n = mesh.geometry.attributes.normal;
  const result = [], point = new THREE.Vector3(), normal = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    point.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
    normal.fromBufferAttribute(n, i).applyMatrix3(normalMatrix);
    // Top, bottom and end slivers (dot 0) follow the front face.
    const lift = liftOf(entry, normal.dot(DOCK0_TOWARD_CAMERA) >= 0);
    const col = point.x / TILE, row = point.z / TILE, height = point.y / H_UNIT;
    result.push((256 + (col - row) * 16) / 512, 1 - (256 + (col + row) * 8 - height * 6 + lift) / 512);
  }
  return result;
}
