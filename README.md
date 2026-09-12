# Trailer Loader Pro

A single-file, zero-build HTML tool for planning trailer and container loads in 3D, producing a cargo manifest, and exporting a BOL-style PDF.

Open `index.html` in a browser. There is nothing to install, compile, or serve. The only runtime dependencies are three.js and jsPDF, both loaded from a pinned CDN.

---

## What it does

- Drag-and-drop 3D placement of pallets inside a trailer envelope, with wall/floor/ceiling clamping and automatic separation of overlapping pieces.
- Multiple trailers per project, each with its own dimensions, name, and max payload.
- Live cargo manifest: piece count, gross weight, declared value, floor utilization, payload utilization, and a weight-weighted center of gravity.
- Per-pallet label, footprint, height, weight, value, notes, and photo.
- Shipment/BOL header capture (dates, carrier, seal, ship-from, ship-to, third-party billing).
- PDF export containing the BOL header, a rendered snapshot of the load, and a detailed manifest with per-piece positions and photos.
- Save and load layouts as JSON. Layout files from the original build are migrated automatically.

## Dimensional convention

All dimensions are **inches**, all weights are **pounds**.

The 3D origin sits at the **nose-left-floor corner** of the trailer:

| Axis | Direction | Meaning |
|------|-----------|---------|
| X | 0 to interior length | distance from the nose (front bulkhead) |
| Y | 0 to interior height | height above the deck |
| Z | 0 to interior width | distance from the left wall |

## Limits and disclaimers

- **Center of gravity is a planning aid, not an axle-weight calculation.** It is a simple weight-weighted mean of entered pallet positions. It does not model kingpin position, tandem slide, tractor geometry, or bridge formula limits, and it is not a substitute for certified scale tickets.
- **Trailer presets are nominal starting values only.** They are approximate interior dimensions intended as a convenient starting point and have not been verified against any manufacturer specification. Confirm the real interior of the specific trailer or container before committing a load plan.
- Collision handling is axis-aligned separation, not a packing optimizer. It stops pieces from interpenetrating; it does not decide the best load order.
- Rotation is 90 degrees about the vertical axis only.
- The PDF is a BOL-style summary document. It is not a certified or carrier-approved bill of lading form.

## Keyboard

| Key | Action |
|-----|--------|
| R | rotate selection 90 degrees |
| D | duplicate selection |
| Delete / Backspace | remove selection |
| Esc | clear selection |
| [ | hide or show the controls panel |
| ] | hide or show the cargo manifest |

Both side panels collapse to zero width, leaving the full window for the 3D
view. The handles that reopen them sit on the left and right edges of the
canvas, not inside the panels, so a hidden panel can always be brought back.
The manifest starts collapsed on windows narrower than 900 px.

## Layout file format

Saved files are JSON, tagged with a format name and version so future changes can migrate cleanly:

```json
{
  "format": "trailer-loader-pro",
  "version": 2,
  "app": "2.0.0",
  "saved": "2026-09-11T00:00:00.000Z",
  "shipment": { "ref": "BOL-1234", "carrier": "..." },
  "trailers": [
    {
      "name": "Trailer 1",
      "dims": { "l": 636, "w": 102, "h": 110 },
      "maxWeight": 45000,
      "pallets": [
        { "label": "P-1", "l": 48, "w": 40, "h": 48,
          "weight": 1500, "value": 5000, "notes": "",
          "img": "", "color": "#3aa0ff",
          "pos": { "x": 24, "y": 24, "z": 51 } }
      ]
    }
  ]
}
```

Files written by the original build (shape `{ s, t }`) are detected and migrated on load.

---

## Development

Vanilla JavaScript, no framework, no bundler. The entire application is `index.html`. Edits go directly into that file.

### Validation

The test harness extracts the shipped inline `<script>` from `index.html` and exercises it in jsdom against a three.js test double. It is the same bytes the browser runs, not a copy.

```bash
npm install     # jsdom only
npm test
```

The suite covers two layers:

**Static checks** (catch whole classes of defect, not single instances)

- the inline script parses under Node
- no inline `onclick=`/`onchange=` attributes remain in markup
- every element id referenced by `$("...")` exists in the DOM
- every handler assigned in `wireUI()` resolves to a function that is actually defined
- every third-party script tag is version-pinned
- charset, viewport, and `lang` are declared

**Runtime checks** in jsdom

- boot, trailer creation, add/rotate/duplicate/delete pallet
- envelope clamping and overlap separation
- trailer resize rebuilds the frame and re-clamps cargo
- BOL header round-trip through the modal
- manifest renders user text as text, not markup
- save/load round trip and v1 file migration
- defensive coercion of malformed pallet records
- center of gravity math
- resize handling

### Optional: subresource integrity

The CDN tags are version-pinned but do not carry `integrity` attributes, so the app works even if the CDN path changes form. If your environment wants SRI, these SHA-384 digests were computed locally from the published npm tarballs for `three@0.145.0` and `jspdf@2.5.1`:

```
three.min.js       sha384-+SwWbnsGY/t3OXVAS6HjMD17NY002cJxCjst/IgjKrteM33IUnwAA2E1g9GAJH2f
OrbitControls.js   sha384-JgJ+i2aY66WOpoy8gaHf9qPa7F0njVMMU5PHiyp3XNS/xUhDow/9zampfl1dXLAz
DragControls.js    sha384-xl8j/9WCuz7kw+T3rDWL10UcvT1pWNzqMBuTETGrOwn3Hy3fIpJvFk/cadSOwWEz
jspdf.umd.min.js   sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk
```

These digests are verified against the npm packages. They are **not** verified against what the CDN actually serves. Test in a browser before relying on them, and drop the `integrity` attribute if a script fails to load.

### Offline and air-gapped use

If the plant floor has no internet access, download the four scripts above, drop them in a `vendor/` directory, and change the four `<script src>` tags to relative paths. Everything else keeps working, and `npm test` is unaffected because the harness stubs the libraries anyway.

---

## Repository setup

```bash
cd trailer-loader-pro
git init
git add .
git commit -m "Trailer Loader Pro v2.0.0"
git branch -M main
git remote add origin git@github.com:<user>/trailer-loader-pro.git
git push -u origin main
```

GitHub Pages: Settings, Pages, Source = GitHub Actions. The included workflow publishes the repository root, so the live tool is served at `https://<user>.github.io/trailer-loader-pro/`.

CI runs the test suite on every push and pull request against `main`.

## License

MIT. See `LICENSE`.
