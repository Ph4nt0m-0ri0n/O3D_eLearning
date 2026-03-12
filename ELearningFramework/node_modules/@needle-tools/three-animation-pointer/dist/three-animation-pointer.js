import { SkinnedMesh as S, InterpolateDiscrete as M, InterpolateLinear as F, AnimationClip as W, PropertyBinding as C, QuaternionKeyframeTrack as w, ColorKeyframeTrack as B, VectorKeyframeTrack as D, BooleanKeyframeTrack as E, NumberKeyframeTrack as O } from "three";
const d = {
  node: "node",
  material: "material",
  camera: "camera",
  light: "light"
}, R = "KHR_animation_pointer", U = {
  // We use a custom interpolant (GLTFCubicSplineInterpolation) for CUBICSPLINE tracks. Each
  // keyframe track will be initialized with a default interpolation type, then modified.
  CUBICSPLINE: void 0,
  LINEAR: F,
  STEP: M
};
class G {
  /** @type {import("three/examples/jsm/loaders/GLTFLoader").GLTFParser} */
  constructor(a) {
    this.name = R, this.parser = a, this.animationPointerResolver = null;
  }
  /** 
   * @param {import("..").AnimationPointerResolver | null} animationPointerResolver
   */
  setAnimationPointerResolver(a) {
    return this.animationPointerResolver = a, this;
  }
  /* DUPLICATE of functionality in GLTFLoader */
  loadAnimationTargetFromChannel(a) {
    const t = a.target, r = t.node !== void 0 ? t.node : t.id;
    return this.parser.getDependency("node", r);
  }
  loadAnimationTargetFromChannelWithAnimationPointer(a) {
    var u;
    j();
    const t = a.target, r = t.extensions && t.extensions[R] && t.path && t.path === "pointer";
    if (!r) return null;
    let e, n = d.node, s;
    if (r) {
      const h = t.extensions[R];
      let o = h.pointer;
      if (!o) {
        console.warn("Invalid path", h, t);
        return;
      }
      if (o.startsWith("/materials/") ? n = d.material : o.startsWith("/extensions/KHR_lights_punctual/lights/") ? n = d.light : o.startsWith("/cameras/") && (n = d.camera), s = this._tryResolveTargetId(o, n), s === null || isNaN(s)) {
        console.warn("Failed resolving animation node id: " + s, o);
        return;
      }
      switch (n) {
        case d.material:
          const T = ("/materials/" + s.toString() + "/").length, f = o.substring(0, T);
          switch (e = o.substring(T), e) {
            case "pbrMetallicRoughness/baseColorFactor":
              e = "color";
              break;
            case "pbrMetallicRoughness/roughnessFactor":
              e = "roughness";
              break;
            case "pbrMetallicRoughness/metallicFactor":
              e = "metalness";
              break;
            case "emissiveFactor":
              e = "emissive";
              break;
            case "alphaCutoff":
              e = "alphaTest";
              break;
            case "occlusionTexture/strength":
              e = "aoMapIntensity";
              break;
            case "normalTexture/scale":
              e = "normalScale";
              break;
            case "pbrMetallicRoughness/baseColorTexture/extensions/KHR_texture_transform/scale":
              e = "map/repeat";
              break;
            case "pbrMetallicRoughness/baseColorTexture/extensions/KHR_texture_transform/offset":
              e = "map/offset";
              break;
            case "emissiveTexture/extensions/KHR_texture_transform/scale":
              e = "emissiveMap/repeat";
              break;
            case "emissiveTexture/extensions/KHR_texture_transform/offset":
              e = "emissiveMap/offset";
              break;
            case "extensions/KHR_materials_emissive_strength/emissiveStrength":
              e = "emissiveIntensity";
              break;
            case "extensions/KHR_materials_transmission/transmissionFactor":
              e = "transmission";
              break;
            case "extensions/KHR_materials_ior/ior":
              e = "ior";
              break;
            case "extensions/KHR_materials_volume/thicknessFactor":
              e = "thickness";
              break;
            case "extensions/KHR_materials_volume/attenuationColor":
              e = "attenuationColor";
              break;
            case "extensions/KHR_materials_volume/attenuationDistance":
              e = "attenuationDistance";
              break;
            case "extensions/KHR_materials_iridescence/iridescenceFactor":
              e = "iridescence";
              break;
            case "extensions/KHR_materials_iridescence/iridescenceIor":
              e = "iridescenceIOR";
              break;
            case "extensions/KHR_materials_iridescence/iridescenceThicknessMinimum":
              e = "iridescenceThicknessRange[0]";
              break;
            case "extensions/KHR_materials_iridescence/iridescenceThicknessMaximum":
              e = "iridescenceThicknessRange[1]";
              break;
            case "extensions/KHR_materials_clearcoat/clearcoatFactor":
              e = "clearcoat";
              break;
            case "extensions/KHR_materials_clearcoat/clearcoatRoughnessFactor":
              e = "clearcoatRoughness";
              break;
            case "extensions/KHR_materials_sheen/sheenColorFactor":
              e = "sheenColor";
              break;
            case "extensions/KHR_materials_sheen/sheenRoughnessFactor":
              e = "sheenRoughness";
              break;
            case "extensions/KHR_materials_specular/specularFactor":
              e = "specularIntensity";
              break;
            case "extensions/KHR_materials_specular/specularColorFactor":
              e = "specularColor";
              break;
          }
          o = f + e;
          break;
        case d.node:
          const k = ("/nodes/" + s.toString() + "/").length, l = o.substring(0, k);
          switch (e = o.substring(k), e) {
            case "translation":
              e = "position";
              break;
            case "rotation":
              e = "quaternion";
              break;
            case "scale":
              e = "scale";
              break;
            case "weights":
              e = "morphTargetInfluences";
              break;
            case "extensions/KHR_node_visibility/visible":
              e = "visible";
              break;
          }
          o = l + e;
          break;
        case d.light:
          const c = ("/extensions/KHR_lights_punctual/lights/" + s.toString() + "/").length;
          switch (e = o.substring(c), e) {
            case "color":
              break;
            case "intensity":
              break;
            case "spot/innerConeAngle":
              e = "penumbra";
              break;
            case "spot/outerConeAngle":
              e = "angle";
              break;
            case "range":
              e = "distance";
              break;
          }
          o = "/lights/" + s.toString() + "/" + e;
          break;
        case d.camera:
          const g = ("/cameras/" + s.toString() + "/").length, b = o.substring(0, g);
          switch (e = o.substring(g), e) {
            case "perspective/yfov":
              e = "fov";
              break;
            case "perspective/znear":
            case "orthographic/znear":
              e = "near";
              break;
            case "perspective/zfar":
            case "orthographic/zfar":
              e = "far";
              break;
            case "perspective/aspect":
              e = "aspect";
              break;
            case "orthographic/xmag":
              e = "zoom";
              break;
            case "orthographic/ymag":
              e = "zoom";
              break;
          }
          o = b + e;
          break;
      }
      (u = this.animationPointerResolver) != null && u.resolvePath && (o = this.animationPointerResolver.resolvePath(o)), t.extensions[R].pointer = o;
    }
    if (s == null || isNaN(s)) {
      console.warn("Failed resolving animation node id: " + s, t);
      return;
    }
    let i;
    return n === d.node ? i = this.parser.getDependency("node", s) : n === d.material ? i = this.parser.getDependency("material", s) : n === d.light ? i = this.parser.getDependency("light", s) : n === d.camera ? i = this.parser.getDependency("camera", s) : console.error("Unhandled type", n), i;
  }
  createAnimationTracksWithAnimationPointer(a, t, r, e, n) {
    if (!(n.extensions && n.extensions[R] && n.path && n.path === "pointer")) return null;
    let i = n.extensions[R].pointer;
    if (!i) return null;
    const u = [];
    i = i.replaceAll("/", ".");
    const h = i.split(".");
    var T = a.name !== void 0 && a.name !== null ? a.name : a.uuid;
    if (h[2] = T, h[3] === "morphTargetInfluences" && a.type === "Group") {
      for (const l of a.children)
        l instanceof S && l.morphTargetInfluences && (h[3] = l.name, h[4] = "morphTargetInfluences", k(this.parser));
      return u;
    }
    k(this.parser);
    function f(l, c) {
      try {
        const g = c.split(".").filter(Boolean), m = g[g.length - 1].replace(/\[.*\]$/, "");
        return m in l ? typeof l[m] == "boolean" : !1;
      } catch {
        return !1;
      }
    }
    function k(l) {
      i = h.join(".");
      let c, g = !1;
      switch (r.itemSize) {
        case 1:
          Object.prototype.toString.call(r.array) === "[object Uint8Array]" && // UNSIGNED_BYTE as a strong hint
          f(a, i) ? (c = E, g = !0) : c = O;
          break;
        case 2:
        case 3:
          c = D;
          break;
        case 4:
          i.endsWith(".quaternion") ? c = w : c = B;
          break;
      }
      if (!c) {
        console.warn("Unsupported output accessor format", r);
        return;
      }
      const b = e.interpolation !== void 0 ? U[e.interpolation] : F;
      let m = l._getArrayFromAccessor(r);
      i.endsWith(".fov") && (m = m.map((_) => _ / Math.PI * 180)), g && (m = m.map((_) => _ > 0));
      const p = new c(
        i,
        t.array,
        m,
        b
      );
      if (b === "CUBICSPLINE" && l._createCubicSplineTrackInterpolant(p), u.push(p), i && r.itemSize === 4 && i.startsWith(".materials.") && i.endsWith(".color")) {
        const _ = new Float32Array(m.length / 4);
        for (let y = 0, P = m.length / 4; y < P; y += 1)
          _[y] = m[y * 4 + 3];
        const x = new c(
          i.replace(".color", ".opacity"),
          t.array,
          _,
          b
        );
        b === "CUBICSPLINE" && l._createCubicSplineTrackInterpolant(p), u.push(x);
      }
    }
    return u;
  }
  _tryResolveTargetId(a, t) {
    let r = "";
    return t === "node" ? r = a.substring(7) : t === "material" ? r = a.substring(11) : t === "light" ? r = a.substring(39) : t === "camera" && (r = a.substring(9)), r = r.substring(0, r.indexOf("/")), Number.parseInt(r);
  }
  /* MOSTLY DUPLICATE of GLTFLoader.loadAnimation, but also tries to resolve KHR_animation_pointer. */
  /**
   * Specification: https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#animations
   * @param {number} animationIndex
   * @return {Promise<AnimationClip>}
   */
  loadAnimation(a) {
    const t = this, r = this.parser.json, e = this.parser, n = r.animations[a], s = n.name ? n.name : "animation_" + a, i = [], u = [], h = [], o = [], T = [];
    for (let f = 0, k = n.channels.length; f < k; f++) {
      const l = n.channels[f], c = n.samplers[l.sampler], g = l.target, b = n.parameters !== void 0 ? n.parameters[c.input] : c.input, m = n.parameters !== void 0 ? n.parameters[c.output] : c.output;
      let p = t.loadAnimationTargetFromChannelWithAnimationPointer(l);
      p || (p = t.loadAnimationTargetFromChannel(l)), i.push(p), u.push(e.getDependency("accessor", b)), h.push(e.getDependency("accessor", m)), o.push(c), T.push(g);
    }
    return Promise.all([
      Promise.all(i),
      Promise.all(u),
      Promise.all(h),
      Promise.all(o),
      Promise.all(T)
    ]).then(function(f) {
      const k = f[0], l = f[1], c = f[2], g = f[3], b = f[4], m = [];
      for (let p = 0, _ = k.length; p < _; p++) {
        const x = k[p], y = l[p], P = c[p], K = g[p], N = b[p];
        if (x === void 0) continue;
        x.updateMatrix && (x.updateMatrix(), x.matrixAutoUpdate = !0);
        let v = t.createAnimationTracksWithAnimationPointer(x, y, P, K, N);
        if (v || (v = e._createAnimationTracks(x, y, P, K, N)), v)
          for (let A = 0; A < v.length; A++)
            m.push(v[A]);
      }
      return new W(s, void 0, m);
    });
  }
}
let H = !1, L = null;
function j() {
  if (H) return;
  H = !0;
  const I = L || (L = C.findNode);
  C.findNode = function(a, t) {
    if (!t) return I(a, t);
    if (t.startsWith(".materials.")) {
      const r = t.substring(11).substring(t.indexOf(".")), e = r.indexOf("."), n = e < 0 ? r : r.substring(0, e);
      let s = null;
      return a.traverse((i) => {
        s !== null || i.type !== "Mesh" && i.type !== "SkinnedMesh" || i.material && (i.material.uuid === n || i.material.name === n) && (s = i.material, s !== null && (r.endsWith(".map") ? s = s.map : r.endsWith(".emissiveMap") && (s = s.emissiveMap)));
      }), s;
    } else if (t.startsWith(".nodes.") || t.startsWith(".lights.") || t.startsWith(".cameras.")) {
      const r = t.split(".");
      let e;
      for (let n = 1; n < r.length; n++) {
        const s = r[n];
        if (s.length == 36)
          e = a.getObjectByProperty("uuid", s);
        else if (e && e[s]) {
          const u = Number.parseInt(s);
          let h = s;
          u >= 0 && (h = u), e = e[h];
        } else {
          const u = a.getObjectByName(s);
          u && (e = u);
        }
      }
      if (!e) {
        const n = I(a, r[2]);
        return n || console.warn(R + ": Property binding not found", t, a, a.name, r), n;
      }
      return e;
    }
    return I(a, t);
  };
}
export {
  G as GLTFAnimationPointerExtension,
  G as default
};
