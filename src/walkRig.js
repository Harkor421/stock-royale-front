// ============================================================================
// walkRig.js — the infantry walk cycle, run on the GPU.
//
// Two thousand soldiers can't each get their own matrix without the CPU
// becoming the bottleneck, so the legs and arms are swung inside the vertex
// shader instead: every vertex carries a `part` id (which limb it belongs to)
// and every instance carries a `aPhase` (where it is in its stride) plus an
// `aAnim` (marching, fighting, or dying). One instanced draw call, and the
// swarm actually walks.
//
// The same injection is applied to a custom depth material, or the shadows
// would keep casting the T-pose the real mesh no longer holds.
// ============================================================================

import * as THREE from 'three'
import { RIG } from './materials.js'

const DECL = /* glsl */ `
  attribute float part;
  attribute float aPhase;
  attribute float aAnim;

  // Swing a point around a horizontal hip/shoulder axis.
  vec3 swingLimb(vec3 v, float pivotY, float a) {
    float c = cos(a), s = sin(a);
    float y = v.y - pivotY;
    return vec3(v.x, pivotY + y * c - v.z * s, y * s + v.z * c);
  }

  // How far this vertex's limb swings, and around which pivot.
  void limbSwing(out float amount, out float pivotY) {
    float sgn = 0.0;
    pivotY = ${RIG.hipY.toFixed(4)};
    if (part > 0.5 && part < 1.5) sgn = 1.0;                     // left leg
    else if (part > 1.5 && part < 2.5) sgn = -1.0;               // right leg
    else if (part > 2.5 && part < 3.5) { sgn = -0.7; pivotY = ${RIG.shoulderY.toFixed(4)}; }
    else if (part > 3.5) { sgn = 0.7; pivotY = ${RIG.shoulderY.toFixed(4)}; }
    // marching = a full stride; fighting = a tight, fast brace; dying = limp
    float amp = aAnim < 0.5 ? 0.62 : (aAnim < 1.5 ? 0.17 : 0.05);
    amount = sin(aPhase) * amp * sgn;
  }
`

const APPLY_POS = /* glsl */ `
  {
    float a, pv;
    limbSwing(a, pv);
    if (abs(a) > 0.0001) transformed = swingLimb(transformed, pv, a);
  }
`

const APPLY_NORMAL = /* glsl */ `
  {
    float a, pv;
    limbSwing(a, pv);
    if (abs(a) > 0.0001) objectNormal = swingLimb(objectNormal, 0.0, a);
  }
`

/** Inject the rig into any material that goes through three's shader chunks. */
export function patchWalk(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = DECL + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace(
      '#include <beginnormal_vertex>',
      '#include <beginnormal_vertex>\n' + APPLY_NORMAL
    )
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n' + APPLY_POS
    )
  }
  // three keys its program cache on this; without it the patched and unpatched
  // variants of the same material class collide and one of them renders wrong.
  material.customProgramCacheKey = () => 'walkRig'
  return material
}

/** A walking-infantry material + the matching depth material for shadows. */
export function createWalkMaterials() {
  const material = patchWalk(
    new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, flatShading: true })
  )
  const depth = patchWalk(
    new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
  )
  return { material, depth }
}

/** Attach the per-instance stride attributes to an instanced geometry. */
export function addRigAttributes(geometry, count) {
  const phase = new THREE.InstancedBufferAttribute(new Float32Array(count), 1)
  const anim = new THREE.InstancedBufferAttribute(new Float32Array(count), 1)
  phase.setUsage(THREE.DynamicDrawUsage)
  anim.setUsage(THREE.DynamicDrawUsage)
  geometry.setAttribute('aPhase', phase)
  geometry.setAttribute('aAnim', anim)
  return { phase, anim }
}
