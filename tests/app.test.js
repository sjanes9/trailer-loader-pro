"use strict";
/**
 * Zero-framework test runner. Only dependency is jsdom.
 *   node tests/app.test.js
 *
 * Every test here exists because a real defect was found in the v1 build or
 * because the check is cheap insurance against that class of defect returning.
 */
const vm = require("vm");
const { JSDOM } = require("jsdom");
const { readHtml, extractInlineScript, extractCdnSources, extractElementIds } = require("./extract");

let passed = 0, failed = 0;
const failures = [];

function test(name, fn) {
  try { fn(); passed++; console.log("  ok   " + name); }
  catch (e) { failed++; failures.push(name + "\n       " + e.message); console.log("  FAIL " + name + "\n       " + e.message); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }
function eq(a, b, msg) { if (a !== b) throw new Error((msg || "values differ") + ": expected " + JSON.stringify(b) + ", got " + JSON.stringify(a)); }

/* --------------------------- three.js test double --------------------------- */

const THREE_STUB = `
(function(){
  function V3(x,y,z){ this.x=x||0; this.y=y||0; this.z=z||0; }
  V3.prototype.set=function(x,y,z){ this.x=x; this.y=y; this.z=z; return this; };
  V3.prototype.copy=function(v){ this.x=v.x; this.y=v.y; this.z=v.z; return this; };
  function Obj3D(){ this.position=new V3(); this.rotation=new V3(); this.visible=true; this.userData={}; }
  Obj3D.prototype.add=function(){}; Obj3D.prototype.remove=function(){};

  function geom(p){ var g={ parameters:p, dispose:function(){ g.disposed=true; } }; return g; }

  var THREE = {
    DoubleSide: 2,
    Scene: function(){ var o=new Obj3D(); o.children=[]; o.add=function(m){ o.children.push(m); }; o.remove=function(m){ var i=o.children.indexOf(m); if(i>=0) o.children.splice(i,1); }; return o; },
    Color: function(c){ this.value=c; },
    PerspectiveCamera: function(){ var o=new Obj3D(); o.aspect=1; o.updateProjectionMatrix=function(){}; o.getWorldDirection=function(){ return new V3(0,0,1); }; return o; },
    WebGLRenderer: function(){
      var canvas = document.createElement("canvas");
      canvas.width = 800; canvas.height = 600;
      canvas.toDataURL = function(){ return "data:image/png;base64,AAAA"; };
      canvas.getBoundingClientRect = function(){ return { left:0, top:0, width:800, height:600 }; };
      return { domElement: canvas, setSize:function(w,h){ canvas.width=w; canvas.height=h; }, setPixelRatio:function(){}, render:function(){} };
    },
    OrbitControls: function(){ this.enabled=true; this.enableDamping=false; this.target=new V3(); this.update=function(){}; },
    DragControls: function(objects){ this.enabled=true; this.objects=objects; this._l={}; this.dispose=function(){ this.disposed=true; };
      this.addEventListener=function(t,f){ (this._l[t]=this._l[t]||[]).push(f); };
      this.fire=function(t,e){ (this._l[t]||[]).forEach(function(f){ f(e); }); }; },
    Raycaster: function(){ this.setFromCamera=function(){}; this.intersectObjects=function(){ return THREE.__hits||[]; }; },
    Vector2: function(){ this.x=0; this.y=0; },
    Vector3: V3,
    AmbientLight: function(){ return new Obj3D(); },
    DirectionalLight: function(){ return new Obj3D(); },
    PlaneGeometry: function(w,h){ return geom({width:w,height:h}); },
    BoxGeometry: function(w,h,d){ return geom({width:w,height:h,depth:d}); },
    EdgesGeometry: function(){ return geom({}); },
    LineBasicMaterial: function(o){ return { opts:o, dispose:function(){} }; },
    MeshPhongMaterial: function(o){ o=o||{}; return { map:o.map||null, opts:o, dispose:function(){} }; },
    CanvasTexture: function(){ return { dispose:function(){} }; },
    LineSegments: function(g,m){ var o=new Obj3D(); o.geometry=g; o.material=m; return o; },
    Mesh: function(g,m){ var o=new Obj3D(); o.geometry=g; o.material=m; return o; }
  };
  window.THREE = THREE;
  window.jspdf = { jsPDF: function(){ throw new Error("PDF export not exercised headlessly"); } };
  window.requestAnimationFrame = function(){ return 0; };
  var origGetContext = window.HTMLCanvasElement.prototype.getContext;
  window.HTMLCanvasElement.prototype.getContext = function(){
    return { fillStyle:"", strokeStyle:"", lineWidth:0, font:"", textAlign:"",
             fillRect:function(){}, strokeRect:function(){}, fillText:function(){}, drawImage:function(){} };
  };
  void origGetContext;
})();
`;

function boot() {
  const html = readHtml();
  const stripped = html.replace(/<script[^>]*\bsrc="[^"]*"[^>]*><\/script>/gi, "");
  const withStub = stripped.replace(/<script>/i, "<script>" + THREE_STUB);
  const dom = new JSDOM(withStub, { runScripts: "dangerously", pretendToBeVisual: false });
  const win = dom.window;
  Object.defineProperty(win.HTMLElement.prototype, "clientWidth", { get: () => 800, configurable: true });
  Object.defineProperty(win.HTMLElement.prototype, "clientHeight", { get: () => 600, configurable: true });
  win.confirm = () => true;
  win.document.dispatchEvent(new win.Event("DOMContentLoaded"));
  win.dispatchEvent(new win.Event("load"));
  return win;
}

/* ------------------------------ static checks ------------------------------ */

console.log("\nStatic checks");

const html = readHtml();
const js = extractInlineScript(html);

test("inline script parses under node (syntax check)", () => {
  new vm.Script(js, { filename: "index.inline.js" });
});

test("no inline event-handler attributes remain in markup", () => {
  const m = html.match(/\son(click|change|load|input|submit)="/gi);
  assert(!m, "found inline handler attributes: " + (m || []).join(", ") +
    " (v1 shipped onclick=\"rotatePallet()\" with no such function defined)");
});

test("every element id referenced by $() exists in the markup", () => {
  const ids = extractElementIds(html);
  const referenced = new Set();
  const re = /\$\(\s*"([^"]+)"\s*\)/g;
  let m;
  while ((m = re.exec(js)) !== null) referenced.add(m[1]);
  assert(referenced.size > 20, "expected many $() references, found " + referenced.size);
  const missing = [...referenced].filter(id => !ids.has(id));
  assert(missing.length === 0, "referenced but not present in DOM: " + missing.join(", "));
});

test("every handler assigned in wireUI resolves to a defined function", () => {
  const declared = new Set();
  let m;
  const fnRe = /function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  while ((m = fnRe.exec(js)) !== null) declared.add(m[1]);
  const assignRe = /\$\("([^"]+)"\)\.on\w+\s*=\s*([A-Za-z_$][\w$]*)\s*;/g;
  const targets = [];
  while ((m = assignRe.exec(js)) !== null) targets.push(m[2]);
  assert(targets.length > 5, "expected handler assignments, found " + targets.length);
  const undef = targets.filter(t => !declared.has(t));
  assert(undef.length === 0, "handlers assigned but never defined: " + undef.join(", "));
});

test("third-party scripts are version-pinned", () => {
  const srcs = extractCdnSources(html);
  assert(srcs.length >= 4, "expected at least 4 CDN scripts, found " + srcs.length);
  const unpinned = srcs.filter(s => !/@\d+\.\d+\.\d+\//.test(s) && !/\/\d+\.\d+\.\d+\//.test(s));
  assert(unpinned.length === 0, "unpinned dependency: " + unpinned.join(", "));
});

test("document declares charset, viewport and lang", () => {
  assert(/<html lang="/i.test(html), "missing lang on <html>");
  assert(/<meta charset=/i.test(html), "missing charset");
  assert(/name="viewport"/i.test(html), "missing viewport");
});

/* ------------------------------ runtime checks ------------------------------ */

console.log("\nRuntime checks (jsdom)");

test("app boots and creates one trailer", () => {
  const win = boot();
  assert(win.state, "global state missing");
  eq(win.state.trailers.length, 1, "trailer count");
  eq(win.document.getElementById("trailerSelect").options.length, 1, "select options");
  assert(win.document.getElementById("bootError").style.display !== "block", "boot error shown unexpectedly");
  assert(/^v\d+\.\d+\.\d+$/.test(win.document.getElementById("verLabel").textContent), "version label not stamped");
});

test("box truck presets are grouped, and selecting one fills dims and payload cap", () => {
  const win = boot();
  const d = win.document;
  const sel = d.getElementById("trailerPreset");

  const optgroups = Array.from(sel.querySelectorAll("optgroup")).map((g) => g.label);
  assert(optgroups.includes("U-Haul box trucks"), "U-Haul options grouped under their own optgroup");
  assert(optgroups.includes("Penske box trucks"), "Penske options grouped under their own optgroup");

  sel.value = "uhaul26";
  win.onPresetChange();
  eq(Number(d.getElementById("tL").value), win.round2(314 / 12), "U-Haul 26 ft length applied (in feet)");
  eq(Number(d.getElementById("tW").value), win.round2(98 / 12), "U-Haul 26 ft width applied");
  eq(Number(d.getElementById("tMaxWeight").value), 12859, "U-Haul 26 ft published max load applied as payload cap");

  sel.value = "penske12";
  win.onPresetChange();
  eq(Number(d.getElementById("tL").value), win.round2(144 / 12), "Penske 12 ft length applied");
  eq(Number(d.getElementById("tMaxWeight").value), 3100, "Penske 12 ft published max load applied as payload cap");

  // Existing non-truck presets never carried a maxWeight and must stay that way.
  d.getElementById("tMaxWeight").value = "45000";
  sel.value = "van53";
  win.onPresetChange();
  eq(d.getElementById("tMaxWeight").value, "45000", "dry van preset leaves the payload cap untouched, same as before");
});

test("adding a pallet updates the 3D scene, manifest and totals", () => {
  const win = boot();
  win.document.getElementById("label").value = "P-1";
  win.document.getElementById("Weight").value = "1200";
  win.document.getElementById("Value").value = "3400";
  win.addPalletFromForm();
  eq(win.state.trailers[0].pallets.length, 1, "pallet count");
  eq(win.document.querySelectorAll(".manifest-item").length, 1, "manifest rows");
  assert(/1,200 lb/.test(win.document.getElementById("totalWeightDisplay").textContent), "weight total");
  assert(/\$3,400/.test(win.document.getElementById("totalValueDisplay").textContent), "value total");
});

test("label auto-increments after add", () => {
  const win = boot();
  win.document.getElementById("label").value = "P-1";
  win.addPalletFromForm();
  eq(win.document.getElementById("label").value, "P-2", "next label");
});

test("rotate swaps length and width and rebuilds geometry", () => {
  const win = boot();
  win.document.getElementById("L").value = "48";
  win.document.getElementById("W").value = "40";
  win.addPalletFromForm();
  const p = win.state.trailers[0].pallets[0];
  win.rotatePallet();
  eq(p.userData.l, 40, "length after rotate");
  eq(p.userData.w, 48, "width after rotate");
  eq(p.geometry.parameters.width, 40, "geometry rebuilt");
});

test("delete mode disables dragging and a raycast hit removes the pallet", () => {
  const win = boot();
  win.addPalletFromForm();
  const p = win.state.trailers[0].pallets[0];
  win.toggleDelete();
  eq(win.state.deleteMode, true, "delete mode flag");
  eq(win.dragControls.enabled, false, "drag disabled in delete mode");
  win.THREE.__hits = [{ object: p }];
  win.onCanvasPointerDown({ clientX: 10, clientY: 10 });
  win.THREE.__hits = [];
  eq(win.state.trailers[0].pallets.length, 0, "pallet removed");
});

test("pallets are clamped inside the trailer envelope", () => {
  const win = boot();
  win.addPalletFromForm();
  const p = win.state.trailers[0].pallets[0];
  const t = win.state.trailers[0];
  p.position.set(99999, 99999, -99999);
  win.clampToTrailer(p);
  assert(p.position.x <= t.dims.l, "x beyond length");
  assert(p.position.y <= t.dims.h, "y beyond height");
  assert(p.position.z >= 0, "z beyond left wall");
  eq(p.userData.pos.x, p.position.x, "userData position not synced");
});

test("oblong items (very different length vs width) clamp, rotate, and report correctly", () => {
  const win = boot();
  const d = win.document;
  d.getElementById("label").value = "BOARD-1";
  d.getElementById("L").value = "96";
  d.getElementById("W").value = "12";
  d.getElementById("H").value = "8";
  win.addPalletFromForm();
  const p = win.state.trailers[0].pallets[0];
  const t = win.state.trailers[0];

  eq(p.geometry.parameters.width, 96, "long dimension kept as entered");
  eq(p.geometry.parameters.depth, 12, "narrow dimension kept as entered");

  p.position.set(-500, p.position.y, p.position.z);
  win.clampToTrailer(p);
  eq(p.position.x - p.geometry.parameters.width / 2, 0, "long board's front face clamps flush to the nose, not past it");

  p.position.set(99999, p.position.y, p.position.z);
  win.clampToTrailer(p);
  eq(p.position.x + p.geometry.parameters.width / 2, t.dims.l, "long board's rear face clamps flush to the tail, not past it");

  win.rotatePallet();
  eq(p.userData.l, 12, "rotate swaps length to the narrow value");
  eq(p.userData.w, 96, "rotate swaps width to the long value");
  eq(p.geometry.parameters.width, 12, "geometry rebuilt to match after rotate");
});

test("a tapered item (different width at each end) uses the wider end for its hitbox and floor math", () => {
  const win = boot();
  const d = win.document;
  d.getElementById("label").value = "FENDER-1";
  d.getElementById("L").value = "40";
  d.getElementById("W").value = "40";
  d.getElementById("W2").value = "30";
  win.addPalletFromForm();

  const p = win.state.trailers[0].pallets[0];
  eq(p.userData.w, 40, "near-end width stored as entered");
  eq(p.userData.w2, 30, "far-end width stored as entered");
  eq(p.geometry.parameters.depth, 40, "3D hitbox sized to the wider end, not the narrower one");

  const tot = win.trailerTotals(win.state.trailers[0]);
  const expectedArea = 40 * ((40 + 30) / 2);
  eq(tot.floorPct, (expectedArea / (win.state.trailers[0].dims.l * win.state.trailers[0].dims.w)) * 100,
    "floor-use % uses the true average width (trapezoid area), not the wider or narrower end alone");

  assert(d.getElementById("manifestList").textContent.includes("40 x 40-30 x"), "manifest shows both widths");
});

test("leaving the tapered-width field blank keeps a plain uniform box (no behavior change)", () => {
  const win = boot();
  const d = win.document;
  d.getElementById("W").value = "40";
  d.getElementById("W2").value = "";
  win.addPalletFromForm();
  const p = win.state.trailers[0].pallets[0];
  eq(p.userData.w2, 40, "w2 defaults to w when left blank");
  eq(win.isTapered(p.userData), false, "not considered tapered");
  eq(p.geometry.parameters.depth, 40, "hitbox unaffected");
});

test("tapering can apply to length and height too, each independently, matching the primary L/W/H layout", () => {
  const win = boot();
  const d = win.document;
  d.getElementById("L").value = "60";
  d.getElementById("L2").value = "50";
  d.getElementById("W").value = "40";
  d.getElementById("H").value = "48";
  d.getElementById("H2").value = "36";
  win.addPalletFromForm();

  const p = win.state.trailers[0].pallets[0];
  eq(p.userData.l2, 50, "length taper stored");
  eq(p.userData.w2, 40, "width not tapered, defaults to w");
  eq(p.userData.h2, 36, "height taper stored");
  eq(p.geometry.parameters.width, 60, "hitbox length uses the larger end");
  eq(p.geometry.parameters.height, 48, "hitbox height uses the larger end");
  eq(win.dimsText(p.userData), "60-50 x 40 x 48-36 in", "manifest text shows both sizes per tapered axis only");

  win.selectPallet(p);
  win.rotatePallet();
  eq(p.userData.l, 40, "rotate swaps length to the old width");
  eq(p.userData.w, 60, "rotate swaps width to the old length");
  eq(p.userData.l2, 40, "the taper pairing (l2/w2) swaps along with l/w");
  eq(p.userData.w2, 50, "the taper pairing (l2/w2) swaps along with l/w");
});

/* The headless THREE stub's BoxGeometry has no vertex data, so give it the
   8 corners (+/-0.5) that the real BoxGeometry(1,1,1) exposes. */
function withVertexBoxGeometry(win, fn) {
  const realBox = win.THREE.BoxGeometry;
  win.THREE.BoxGeometry = function (w, h, dd) {
    const v = [];
    for (const sx of [-0.5, 0.5]) for (const sy of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) v.push([sx, sy, sz]);
    const position = {
      count: v.length, needsUpdate: false,
      getX: (i) => v[i][0], getY: (i) => v[i][1], getZ: (i) => v[i][2],
      setXYZ: (i, x, y, z) => { v[i] = [x, y, z]; },
    };
    return { parameters: { width: w, height: h, depth: dd }, attributes: { position },
             computeVertexNormals() {}, dispose() {}, _v: v };
  };
  try { return fn(); } finally { win.THREE.BoxGeometry = realBox; }
}

test("a tapered item's visible shape really narrows: width shrinks from the nose end to the tail end", () => {
  const win = boot();
  const d = win.normalizePallet({ l: 60, w: 40, h: 48, w2: 10 });
  const g = withVertexBoxGeometry(win, () => win.buildTaperedGeometry(d));
  const nose = g._v.filter((p) => p[0] < 0), tail = g._v.filter((p) => p[0] > 0);
  assert(nose.every((p) => Math.abs(Math.abs(p[2]) - 20) < 1e-9), "nose-end corners sit at +/-20 (40 wide)");
  assert(tail.every((p) => Math.abs(Math.abs(p[2]) - 5) < 1e-9), "tail-end corners sit at +/-5 (10 wide)");
  assert(g._v.every((p) => Math.abs(p[0]) <= 30 + 1e-9), "length never exceeds the hitbox half-length");
});

test("height taper keeps the bottom flat while the top slopes; the shape stays inside its hitbox", () => {
  const win = boot();
  const d = win.normalizePallet({ l: 60, w: 40, h: 48, h2: 12 });
  const g = withVertexBoxGeometry(win, () => win.buildTaperedGeometry(d));
  assert(g._v.every((p) => p[1] >= -24 - 1e-9 && p[1] <= 24 + 1e-9), "all corners inside the 48-high hitbox");
  eq(g._v.filter((p) => Math.abs(p[1] + 24) < 1e-9).length, 4, "the four bottom corners all sit on the floor plane");
  const topNose = g._v.filter((p) => p[0] < 0 && Math.abs(p[1] + 24) > 1e-9).map((p) => p[1]);
  const topTail = g._v.filter((p) => p[0] > 0 && Math.abs(p[1] + 24) > 1e-9).map((p) => p[1]);
  eq(topNose.length + topTail.length, 4, "the four top corners are the rest");
  assert(topNose.every((y) => Math.abs(y - 24) < 1e-9), "nose end is the full 48 high");
  assert(topTail.every((y) => Math.abs(y - (-24 + 12)) < 1e-9), "tail end is only 12 high");
});

test("a tapered item swaps to the tapered visual, and going back to uniform restores the plain box", () => {
  const win = boot();
  const d = win.document;
  d.getElementById("W").value = "40";
  d.getElementById("W2").value = "10";
  withVertexBoxGeometry(win, () => win.addPalletFromForm());
  const p = win.state.trailers[0].pallets[0];
  eq(p.userData._taperActive, true, "tapered visual is active");
  assert(p.material.opts.opacity < 0.1, "plain box is hidden so only the tapered shape shows");
  eq(p.geometry.parameters.depth, 40, "hitbox still sized to the larger end for clamp/collision");

  win.selectPallet(p);
  d.getElementById("W2").value = "";
  withVertexBoxGeometry(win, () => win.updatePallet());
  eq(!!p.userData._taperActive, false, "taper visual removed");
  assert(p.material.opts.opacity === undefined, "normal opaque labeled material restored");
});

test("a shelf can start at the back (rear doors) of the trailer instead of the nose", () => {
  const win = boot();
  const d = win.document;
  const t = win.state.trailers[0];

  d.getElementById("shelfEnd").value = "rear";
  win.addShelvesFromForm();
  const rear = t.fixtures[0];
  eq(rear.pos.x, t.dims.l - rear.l / 2, "rear shelf sits flush against the back wall");

  d.getElementById("shelfEnd").value = "nose";
  win.addShelvesFromForm();
  eq(t.fixtures[1].pos.x, t.fixtures[1].l / 2, "nose shelf still sits flush against the front wall");

  d.getElementById("shelfEnd").value = "rear";
  win.onShelfEndChange();
  eq(Number(d.getElementById("shelfPosX").value), win.round2(t.dims.l - 36 / 2), "choosing Back prefills the position field");
});

test("changing trailer dimensions (entered in feet) rebuilds the frame and re-clamps cargo", () => {
  const win = boot();
  win.addPalletFromForm();
  const p = win.state.trailers[0].pallets[0];
  p.position.set(600, 24, 50);
  const d = win.document;
  // Trailer L/W/H fields are in feet; applyTrailerSettings converts to inches.
  d.getElementById("tL").value = "20";
  d.getElementById("tW").value = "8";
  d.getElementById("tH").value = "8";
  win.applyTrailerSettings();
  eq(win.state.trailers[0].dims.l, 240, "dims applied (converted from feet to inches)");
  eq(win.state.trailers[0].frame.position.x, 120, "frame not rebuilt and recentered on the new length");
  eq(win.state.trailers[0].floor.geometry.parameters.width, 240, "floor plane not rebuilt");
  assert(p.position.x <= 240, "cargo not re-clamped after shrink");
});

test("BOL header round-trips through the modal instead of being wiped", () => {
  const win = boot();
  win.document.getElementById("bolRef").value = "BOL-4471";
  win.document.getElementById("bolCarrier").value = "Acme Freight";
  win.saveBOL();
  eq(win.state.shipment.ref, "BOL-4471", "ref stored");
  win.document.getElementById("bolRef").value = "";
  win.openBOL();
  eq(win.document.getElementById("bolRef").value, "BOL-4471", "form not repopulated on reopen");
});

test("manifest renders notes as text, not markup", () => {
  const win = boot();
  win.document.getElementById("Notes").value = '<img src=x onerror="window.__xss=1">';
  win.addPalletFromForm();
  const item = win.document.querySelector(".manifest-item .note");
  eq(win.document.querySelectorAll(".manifest-item img").length, 0, "note injected an element");
  assert(item.textContent.indexOf("<img") === 0, "note text not preserved");
  assert(!win.__xss, "script executed from note field");
});

test("save/load round trip preserves trailers, pallets and shipment data", () => {
  const win = boot();
  win.document.getElementById("label").value = "SKID-9";
  win.document.getElementById("Weight").value = "2750";
  win.addPalletFromForm();
  win.state.shipment = { ref: "BOL-1", carrier: "Acme" };
  const snap = JSON.parse(JSON.stringify(win.serialize()));

  eq(snap.format, "trailer-loader-pro", "format tag");
  eq(snap.trailers[0].pallets[0].label, "SKID-9", "pallet label serialized");
  eq(snap.trailers[0].pallets[0].weight, 2750, "weight serialized as a number");

  const migrated = win.migrate(snap);
  assert(migrated === snap, "current-format file should pass through migrate unchanged");
});

test("selecting a cargo item without a photo hides the photo preview", () => {
  const win = boot();
  win.addPalletFromForm();
  const p = win.state.trailers[0].pallets[0];
  win.selectPallet(p);
  eq(win.document.getElementById("photoPreviewWrap").style.display, "none", "no photo, no preview shown");
});

test("selecting a cargo item with a photo shows it, and removing it clears it on update", () => {
  const win = boot();
  win.addPalletFromForm();
  const p = win.state.trailers[0].pallets[0];
  p.userData.img = "data:image/png;base64,AAAA";
  win.selectPallet(p);
  eq(win.document.getElementById("photoPreviewWrap").style.display, "block", "existing photo shown in preview");
  eq(win.document.getElementById("photoPreview").src, p.userData.img, "preview src matches the stored photo");

  win.clearPhotoSelection();
  eq(win.document.getElementById("photoPreviewWrap").style.display, "none", "preview hidden immediately after Remove photo");

  win.updatePallet();
  eq(p.userData.img, "", "photo cleared from the cargo item on update, with no new file chosen");
});

test("pickedPhotoFile() prefers a chosen library file over a captured one", () => {
  const win = boot();
  const file = new win.File(["x"], "lib.png", { type: "image/png" });
  Object.defineProperty(win.document.getElementById("palletImg"), "files", { value: [file], configurable: true });
  eq(win.pickedPhotoFile().name, "lib.png", "returns the file present on #palletImg");
});

test("Box type shows a part-count field and reports quantity in the manifest", () => {
  const win = boot();
  const d = win.document;
  d.getElementById("itemType").value = "box";
  win.onItemTypeChange();
  eq(d.getElementById("partCount").style.display, "", "part count field shown for Box");
  eq(d.getElementById("customType").style.display, "none", "custom type field stays hidden for Box");

  d.getElementById("partCount").value = "24";
  win.addPalletFromForm();
  const p = win.state.trailers[0].pallets[0];
  eq(p.userData.itemType, "box", "item type stored as box");
  eq(p.userData.partCount, 24, "part count stored");
  assert(/Box \(qty 24\)/.test(d.getElementById("manifestList").textContent), "manifest shows box qty");
});

test("Custom type shows a free-text field and uses it as the manifest label", () => {
  const win = boot();
  const d = win.document;
  d.getElementById("itemType").value = "custom";
  win.onItemTypeChange();
  eq(d.getElementById("customType").style.display, "", "custom type field shown for Custom");
  eq(d.getElementById("partCount").style.display, "none", "part count field stays hidden for Custom");

  d.getElementById("customType").value = "Drum";
  win.addPalletFromForm();
  const p = win.state.trailers[0].pallets[0];
  eq(p.userData.itemType, "custom", "item type stored as custom");
  eq(p.userData.customType, "Drum", "custom type name stored");
  eq(win.itemTypeLabel(p.userData), "Drum", "itemTypeLabel uses the custom name");
  assert(d.getElementById("manifestList").textContent.includes("Drum"), "manifest shows the custom type name");
});

test("Individual Piece is a plain type with no extra fields", () => {
  const win = boot();
  const d = win.document;
  d.getElementById("itemType").value = "piece";
  win.onItemTypeChange();
  eq(d.getElementById("partCount").style.display, "none", "part count hidden for Individual Piece");
  eq(d.getElementById("customType").style.display, "none", "custom type hidden for Individual Piece");
  win.addPalletFromForm();
  eq(win.state.trailers[0].pallets[0].userData.itemType, "piece", "item type stored as piece");
});

test("v1 layout files migrate instead of failing to open", () => {
  const win = boot();
  const legacy = { s: { ref: "OLD-1" }, t: [{ d: { l: 636, w: 102, h: 110 }, p: [{ label: "A", l: 48, w: 40, h: 48, weight: "900", value: "100", pos: { x: 30, y: 24, z: 20 } }] }] };
  const out = win.migrate(legacy);
  assert(out, "legacy file rejected");
  eq(out.format, "trailer-loader-pro", "format tag added");
  eq(out.trailers.length, 1, "trailer migrated");
  eq(out.shipment.ref, "OLD-1", "shipment migrated");
  assert(win.migrate({ nonsense: true }) === null, "garbage file should return null");
});

test("normalizePallet coerces bad input instead of producing NaN geometry", () => {
  const win = boot();
  const d = win.normalizePallet({ label: "X", weight: "1500", value: "", l: "48", w: null, h: undefined });
  eq(d.weight, 1500, "weight coerced to number");
  eq(d.value, 0, "empty value defaulted");
  eq(d.l, 48, "string length coerced");
  assert(isFinite(d.w) && isFinite(d.h), "missing dims produced non-finite values");
  assert(isFinite(d.pos.x) && isFinite(d.pos.y) && isFinite(d.pos.z), "missing pos produced non-finite values");
  assert(/^#[0-9a-f]{6}$/i.test(d.color), "color not assigned");
});

test("image format is derived from the data URL", () => {
  const win = boot();
  eq(win.imageFormat("data:image/png;base64,AA"), "PNG", "png");
  eq(win.imageFormat("data:image/jpeg;base64,AA"), "JPEG", "jpeg");
  eq(win.imageFormat(""), "PNG", "fallback");
});

test("center of gravity is weight-weighted and reported", () => {
  const win = boot();
  const t = win.state.trailers[0];
  win.addPallet({ label: "A", l: 48, w: 40, h: 48, weight: 1000, value: 0, pos: { x: 100, y: 24, z: 51 } });
  win.addPallet({ label: "B", l: 48, w: 40, h: 48, weight: 3000, value: 0, pos: { x: 300, y: 24, z: 51 } });
  const tot = win.trailerTotals(t);
  eq(tot.count, 2, "piece count");
  eq(Math.round(tot.cgX), 250, "weighted CG should sit toward the heavier pallet");
  assert(/CG from nose/.test(win.document.getElementById("statCgLong").textContent), "CG stat not rendered");
});

test("3D model loading degrades gracefully when GLTFLoader isn't available (offline/blocked CDN)", () => {
  const win = boot();
  const d = win.document;
  eq(win.gltfLoader, undefined, "no real GLTFLoader in this headless env, same as a blocked CDN in production");

  d.getElementById("label").value = "PART-1";
  win.addPalletFromForm();
  const p = win.state.trailers[0].pallets[0];
  eq(p.userData.model, "", "no model attached without a chosen file");
  assert(p.material && p.material.opts, "item keeps its normal labeled-box material, not a broken/invisible one");

  // Simulate a save file that already recorded a model (e.g. made on a machine
  // where GLTFLoader loaded): normalizePallet must still produce a valid item.
  const restored = win.normalizePallet({ label: "PART-2", model: "data:model/gltf-binary;base64,AAAA" });
  eq(restored.model, "data:model/gltf-binary;base64,AAAA", "model data preserved through normalization");
  const mesh = win.makePalletMesh(restored);
  assert(mesh.geometry, "mesh still gets a normal box hitbox even though gltfLoader is unavailable");
});

test("dataUrlToArrayBuffer round-trips known base64 content", () => {
  const win = boot();
  const buf = win.dataUrlToArrayBuffer("data:application/octet-stream;base64,aGVsbG8=");
  const bytes = new Uint8Array(buf);
  const text = String.fromCharCode.apply(null, bytes);
  eq(text, "hello", "decoded bytes match the original base64 payload");
});

test("save/load round trip preserves an attached model reference", () => {
  const win = boot();
  const d = win.document;
  d.getElementById("label").value = "PART-3";
  win.addPalletFromForm();
  win.state.trailers[0].pallets[0].userData.model = "data:model/gltf-binary;base64,AAAA";

  const snap = JSON.parse(JSON.stringify(win.serialize()));
  eq(snap.trailers[0].pallets[0].model, "data:model/gltf-binary;base64,AAAA", "model field serialized");
});

test("removing a trailer disposes its cargo and keeps at least one trailer", () => {
  const win = boot();
  win.addNewTrailer();
  eq(win.state.trailers.length, 2, "second trailer added");
  win.removeTrailer();
  eq(win.state.trailers.length, 1, "trailer removed");
  win.removeTrailer();
  eq(win.state.trailers.length, 1, "last trailer must not be removable");
});

test("adding a shelving unit creates one fixture with numbered levels, excluded from cargo totals", () => {
  const win = boot();
  const d = win.document;
  d.getElementById("shelfCount").value = "3";
  win.addShelvesFromForm();
  const t = win.state.trailers[0];
  eq(t.fixtures.length, 1, "one shelving unit created, not one per level");
  eq(t.fixtures[0].levels.join(","), "1,2,3", "unit has 3 numbered levels, auto-incrementing from Start #");

  win.addPalletFromForm();
  const tot = win.trailerTotals(t);
  eq(tot.count, 1, "the shelving unit is not counted as a cargo piece");
  eq(tot.weight, win.document.getElementById("Weight").value * 1, "the shelving unit does not contribute weight");
});

test("levels within one unit stack top to bottom, each independently assignable", () => {
  const win = boot();
  const d = win.document;
  d.getElementById("shelfCount").value = "3";
  win.addShelvesFromForm();
  const shelf = win.state.trailers[0].fixtures[0];

  d.getElementById("L").value = "10";
  d.getElementById("W").value = "10";
  d.getElementById("H").value = "10";
  d.getElementById("cargoShelfId").value = "1";
  win.addPalletFromForm();
  d.getElementById("cargoShelfId").value = "3";
  win.addPalletFromForm();

  const [bottomItem, topItem] = win.state.trailers[0].pallets;
  eq(bottomItem.userData.shelfId, "1", "first item assigned to level 1");
  eq(topItem.userData.shelfId, "3", "second item assigned to level 3");
  eq(bottomItem.position.x, shelf.pos.x, "x lines up with the unit");
  eq(bottomItem.position.z, shelf.pos.z, "z lines up with the unit");
  assert(topItem.position.y > bottomItem.position.y, "level 3 sits higher than level 1 within the same unit");
});

test("dragging a shelving unit brings its assigned cargo along", () => {
  const win = boot();
  const d = win.document;
  win.addShelvesFromForm();
  const shelf = win.state.trailers[0].fixtures[0];
  const originalShelfX = shelf.pos.x;

  d.getElementById("L").value = "10";
  d.getElementById("W").value = "10";
  d.getElementById("H").value = "10";
  d.getElementById("cargoShelfId").value = shelf.levels[0];
  win.addPalletFromForm();
  const p = win.state.trailers[0].pallets[0];
  const originalCargoX = p.position.x;
  eq(originalCargoX, originalShelfX, "cargo starts lined up with the unit");

  shelf.hitbox.position.x += 100;
  win.fixtureDragControls.fire("dragend", { object: shelf.hitbox });

  eq(shelf.pos.x, originalShelfX + 100, "moving the unit updates its recorded position");
  eq(p.position.x, shelf.pos.x, "assigned cargo re-snaps to the unit's new position");
  assert(p.position.x !== originalCargoX, "cargo actually moved, not left behind");
});

test("clicking/dragging a shelving unit selects it and loads its size/position into the form", () => {
  const win = boot();
  const d = win.document;
  win.addShelvesFromForm();
  eq(d.getElementById("btnUpdateShelf").style.display, "none", "update button hidden with nothing selected");

  const shelf = win.state.trailers[0].fixtures[0];
  win.selectFixture(shelf);
  eq(win.state.selectedFixture, shelf, "fixture recorded as selected");
  eq(d.getElementById("btnUpdateShelf").style.display, "", "update button shown once selected");
  eq(d.getElementById("shelfL").value, String(shelf.l), "form loaded with the unit's length");
  eq(d.getElementById("shelfStart").disabled, true, "Start #/Levels are display-only while editing a unit");

  win.deselectFixture();
  eq(win.state.selectedFixture, null, "selection cleared");
  eq(d.getElementById("btnUpdateShelf").style.display, "none", "update button hidden again");
  eq(d.getElementById("shelfStart").disabled, false, "Start #/Levels editable again");
});

test("Update Shelf resizes and repositions an existing unit, and its assigned cargo follows", () => {
  const win = boot();
  const d = win.document;
  win.addShelvesFromForm();
  const shelf = win.state.trailers[0].fixtures[0];

  d.getElementById("L").value = "10";
  d.getElementById("W").value = "10";
  d.getElementById("H").value = "10";
  d.getElementById("cargoShelfId").value = shelf.levels[0];
  win.addPalletFromForm();
  const p = win.state.trailers[0].pallets[0];

  win.selectFixture(shelf);
  d.getElementById("shelfL").value = "60";
  d.getElementById("shelfW").value = "24";
  d.getElementById("shelfH").value = "80";
  d.getElementById("shelfPosX").value = "300";
  d.getElementById("shelfPosZ").value = "40";
  win.updateSelectedShelf();

  const updated = win.state.trailers[0].fixtures[0];
  eq(updated.l, 60, "length updated");
  eq(updated.w, 24, "width updated");
  eq(updated.totalH, 80, "height updated");
  eq(updated.pos.x, 300, "repositioned along the trailer length");
  eq(updated.pos.z, 40, "repositioned across the trailer width");
  eq(p.position.x, updated.pos.x, "assigned cargo follows the resized/repositioned unit");
  eq(win.state.selectedFixture, updated, "unit stays selected after updating");
});

test("removing a shelving unit clears the assignment on cargo that referenced it", () => {
  const win = boot();
  const d = win.document;
  win.addShelvesFromForm();
  d.getElementById("cargoShelfId").value = "1";
  win.addPalletFromForm();

  win.removeFixture(0);

  eq(win.state.trailers[0].fixtures.length, 0, "fixture removed");
  eq(win.state.trailers[0].pallets[0].userData.shelfId, "", "orphaned shelf reference cleared");
});

test("pallet and tote cargo get decorative child meshes; itemType no longer includes shelf", () => {
  const win = boot();
  win.addPalletFromForm();
  const pallet = win.state.trailers[0].pallets[0];
  eq(pallet.userData.itemType, "pallet", "defaults to pallet type");

  const normalized = win.normalizePallet({ itemType: "shelf" });
  eq(normalized.itemType, "pallet", "legacy 'shelf' item type falls back to pallet, since shelves are fixtures now");
});

test("both side panels collapse and can be reopened", () => {
  const win = boot();
  const d = win.document;
  const sidebar = d.getElementById("sidebar");
  const manifest = d.getElementById("manifestSide");

  eq(sidebar.classList.contains("collapsed"), false, "sidebar should start visible");
  win.toggleSidebar();
  eq(sidebar.classList.contains("collapsed"), true, "sidebar did not collapse");
  win.toggleSidebar();
  eq(sidebar.classList.contains("collapsed"), false, "sidebar did not reopen");

  win.toggleManifest();
  eq(manifest.classList.contains("collapsed"), true, "manifest did not collapse");
  win.toggleManifest();
  eq(manifest.classList.contains("collapsed"), false, "manifest did not reopen");

  eq(win.setPanel("sidebar", true), true, "explicit collapse");
  eq(win.setPanel("sidebar", true), true, "explicit collapse should be idempotent");
  eq(win.setPanel("sidebar", false), false, "explicit expand");
});

test("panel handles live outside the panels they control", () => {
  const win = boot();
  const d = win.document;
  // v1 put the manifest handle inside the manifest, which set overflow:hidden
  // when collapsed and clipped the only way to reopen it.
  ["sidebarToggle", "manifestToggle"].forEach((id) => {
    const btn = d.getElementById(id);
    assert(btn, id + " missing");
    assert(!d.getElementById("sidebar").contains(btn), id + " nested inside the sidebar");
    assert(!d.getElementById("manifestSide").contains(btn), id + " nested inside the manifest");
    assert(d.getElementById("container").contains(btn), id + " should live in the canvas area");
  });
});

test("handle arrows and aria state follow the panel state", () => {
  const win = boot();
  const d = win.document;
  const h = d.getElementById("manifestToggle");
  eq(h.getAttribute("aria-expanded"), "true", "starts expanded");
  const open = h.textContent;
  win.toggleManifest();
  eq(h.getAttribute("aria-expanded"), "false", "aria not updated on collapse");
  assert(h.textContent !== open, "arrow direction did not change");
});

test("resize updates camera aspect and renderer size", () => {
  const win = boot();
  win.onResize();
  eq(win.camera.aspect, 800 / 600, "camera aspect");
  eq(win.renderer.domElement.width, 800, "renderer width");
});

console.log("\n" + passed + " passed, " + failed + " failed");
if (failed) { console.log("\nFailures:\n  " + failures.join("\n  ")); process.exit(1); }
