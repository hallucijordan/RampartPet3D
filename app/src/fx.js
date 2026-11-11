// Particle effects: welding sparks (additive glow), landing dust puff (soft smoke)
// Both drawn into the character's HDR target, through the same tone mapping, consistent with the character lighting
import * as THREE from 'three'

function softDot(size = 64) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grd.addColorStop(0, 'rgba(255,255,255,1)')
  grd.addColorStop(0.25, 'rgba(255,255,255,0.8)')
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, size, size)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.NoColorSpace
  return t
}

const SPARK_VERT = /* glsl */`
attribute float life;
attribute float seed;
uniform float pxScale;
varying float vLife;
varying float vSeed;
void main() {
  vLife = life; vSeed = seed;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = pxScale * (0.6 + 1.4 * life) / -mv.z;
}
`
const SPARK_FRAG = /* glsl */`
uniform sampler2D map;
varying float vLife;
varying float vSeed;
void main() {
  if (vLife <= 0.0) discard;
  float a = texture2D(map, gl_PointCoord).r * vLife;
  // white hot -> orange -> dark red
  vec3 hot = mix(vec3(1.0, 0.35, 0.08), vec3(1.0, 0.85, 0.55), smoothstep(0.35, 0.9, vLife));
  vec3 c = hot * (3.0 + 5.0 * vLife);
  gl_FragColor = vec4(c * a, a * 0.9);
}
`

export class FX {
  constructor(scene, stage) {
    this.stage = stage
    this.N = 400
    const g = new THREE.BufferGeometry()
    this.pos = new Float32Array(this.N * 3)
    this.vel = new Float32Array(this.N * 3)
    this.life = new Float32Array(this.N)
    this.decay = new Float32Array(this.N)
    this.seed = new Float32Array(this.N).map(() => Math.random())
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('life', new THREE.BufferAttribute(this.life, 1).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('seed', new THREE.BufferAttribute(this.seed, 1))
    this.sparkMat = new THREE.ShaderMaterial({
      vertexShader: SPARK_VERT, fragmentShader: SPARK_FRAG,
      uniforms: { map: { value: softDot() }, pxScale: { value: 40 } },
      transparent: true, depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    })
    this.points = new THREE.Points(g, this.sparkMat)
    this.points.frustumCulled = false
    this.points.renderOrder = 10
    scene.add(this.points)
    this.cursor = 0

    // dust puff: a few big smoke blobs
    this.dust = []
    this.dustTex = softDot(64)
    this.dustGroup = new THREE.Group()
    scene.add(this.dustGroup)
  }

  // sparks: a burst from origin around dir
  sparks(origin, dir, n = 14, speed = 1.6) {
    for (let k = 0; k < n; k++) {
      const i = this.cursor = (this.cursor + 1) % this.N
      this.pos[i * 3] = origin.x; this.pos[i * 3 + 1] = origin.y; this.pos[i * 3 + 2] = origin.z
      const s = speed * (0.35 + Math.random())
      const rx = (Math.random() - 0.5) * 1.6, ry = Math.random() * 0.9, rz = (Math.random() - 0.5) * 1.6
      this.vel[i * 3] = (dir.x + rx) * s
      this.vel[i * 3 + 1] = (dir.y + ry) * s
      this.vel[i * 3 + 2] = (dir.z + rz) * s
      this.life[i] = 1
      this.decay[i] = 1.3 + Math.random() * 2.2
    }
  }

  // bubble pop: pink debris (reuses the dust sprite, color changed to bubble gum pink)
  pop(origin, n = 12) {
    for (let k = 0; k < n; k++) {
      const m = new THREE.SpriteMaterial({ map: this.dustTex, color: 0xff8fc0, transparent: true, depthWrite: false, opacity: 0 })
      const s = new THREE.Sprite(m)
      s.position.copy(origin)
      s.scale.setScalar(0.03)
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5).normalize()
      s.userData = { v: dir.multiplyScalar(0.8 + Math.random() * 0.8), age: 0, life: 0.45 + Math.random() * 0.3, pop: true }
      this.dustGroup.add(s)
      this.dust.push(s)
    }
  }

  puff(origin, n = 7, spread = 0.35) {
    for (let k = 0; k < n; k++) {
      const m = new THREE.SpriteMaterial({
        map: this.dustTex, color: 0xb9ad9c, transparent: true, depthWrite: false, opacity: 0,
      })
      const s = new THREE.Sprite(m)
      const ang = (k / n) * Math.PI * 2 + Math.random() * 0.5
      s.position.set(origin.x + Math.cos(ang) * 0.08, origin.y + 0.05, origin.z + Math.sin(ang) * 0.08)
      s.scale.setScalar(0.15)
      s.userData = {
        v: new THREE.Vector3(Math.cos(ang) * spread * (0.6 + Math.random() * 0.8), 0.08 + Math.random() * 0.15, Math.sin(ang) * spread * 0.5),
        age: 0, life: 0.7 + Math.random() * 0.5,
      }
      this.dustGroup.add(s)
      this.dust.push(s)
    }
  }

  update(dt) {
    const G = -4.5
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) continue
      this.vel[i * 3 + 1] += G * dt
      this.pos[i * 3] += this.vel[i * 3] * dt
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt
      // bounce on landing
      if (this.pos[i * 3 + 1] < 0) { this.pos[i * 3 + 1] = 0; this.vel[i * 3 + 1] *= -0.35; this.vel[i * 3] *= 0.6; this.vel[i * 3 + 2] *= 0.6 }
      this.life[i] = Math.max(0, this.life[i] - this.decay[i] * dt)
    }
    const g = this.points.geometry
    g.attributes.position.needsUpdate = true
    g.attributes.life.needsUpdate = true
    this.sparkMat.uniforms.pxScale.value = 34 * this.stage.ss * this.stage.dpr * (this.stage.camera.position.length() / 10)

    for (let k = this.dust.length - 1; k >= 0; k--) {
      const s = this.dust[k], u = s.userData
      u.age += dt
      const t = u.age / u.life
      if (t >= 1) { this.dustGroup.remove(s); s.material.dispose(); this.dust.splice(k, 1); continue }
      s.position.addScaledVector(u.v, dt)
      if (u.pop) {
        u.v.y -= 3 * dt
        s.scale.setScalar(0.03 + t * 0.02)
        s.material.opacity = (1 - t) * 0.95
        continue
      }
      u.v.multiplyScalar(Math.pow(0.1, dt))
      s.scale.setScalar(0.15 + t * 0.35)
      s.material.opacity = Math.sin(Math.PI * Math.min(1, t * 1.4)) * 0.45
    }
  }
}
