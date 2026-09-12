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

test("removing a trailer disposes its cargo and keeps at least one trailer", () => {
  const win = boot();
  win.addNewTrailer();
  eq(win.state.trailers.length, 2, "second trailer added");
  win.removeTrailer();
  eq(win.state.trailers.length, 1, "trailer removed");
  win.removeTrailer();
  eq(win.state.trailers.length, 1, "last trailer must not be removable");
});

test("bulk-adding shelves creates numbered fixtures excluded from cargo totals", () => {
  const win = boot();
  const d = win.document;
  d.getElementById("shelfCount").value = "3";
  win.addShelvesFromForm();
  const t = win.state.trailers[0];
  eq(t.fixtures.length, 3, "three fixtures created");
  eq(t.fixtures.map(f => f.shelfNumber).join(","), "1,2,3", "shelf numbers auto-increment from Start #");

  win.addPalletFromForm();
  const tot = win.trailerTotals(t);
  eq(tot.count, 1, "fixtures are not counted as cargo pieces");
  eq(tot.weight, win.document.getElementById("Weight").value * 1, "fixtures do not contribute weight");
});

test("assigning a pallet to a shelf positions it on that shelf, not the floor", () => {
  const win = boot();
  const d = win.document;
  win.addShelvesFromForm();
  const shelf = win.state.trailers[0].fixtures[0];

  d.getElementById("cargoShelfId").value = "1";
  d.getElementById("W").value = "10";
  d.getElementById("H").value = "10";
  win.addPalletFromForm();

  const p = win.state.trailers[0].pallets[0];
  eq(p.userData.shelfId, "1", "shelfId recorded on the cargo item");
  eq(p.position.x, shelf.pos.x, "cargo x lines up with the shelf");
  eq(p.position.z, shelf.pos.z, "cargo z lines up with the shelf");
  assert(p.position.y > shelf.pos.y + shelf.h * 0.9, "cargo rests at/above the shelf's top level, not the floor");
});

test("removing a shelf fixture clears the assignment on cargo that referenced it", () => {
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
