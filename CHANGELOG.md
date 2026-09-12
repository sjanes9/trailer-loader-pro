# Changelog

All notable changes to Trailer Loader Pro. Versioning follows semantic versioning.

## [2.6.0] - 2026-09-12

### Added

- Cargo **Type** dropdown gains three options: **Box** (with a "Part count"
  field for how many parts/pieces are in it, shown in the manifest as
  "Box (qty N)"), **Individual Piece** (a plain loose-item type), and
  **Custom** (a free-text type name that's used directly as the item's
  type label everywhere -- manifest, PDF -- instead of a fixed name).

## [2.5.0] - 2026-09-12

### Added

- The cargo Photo field is now two explicit buttons, **Take Photo** and
  **Choose Photo**, so mobile users get the device camera directly instead
  of relying on the browser's own file-picker sheet. Whichever one is used,
  a live preview appears immediately with a **Remove photo** option that
  clears the image (including from an already-added item, on Update).
  Selecting an existing cargo item now shows its current photo, if any.

## [2.4.0] - 2026-09-12

### Fixed

- **Cargo could visually poke through the trailer's walls.** Pallets and
  totes got decorative meshes in 2.3.0 (a wood deck plate, a rim band) that
  were slightly larger than the item's actual footprint, so when an item
  was clamped flush against a wall the decoration overhung past it. All
  cargo decoration is now sized to fit flush inside the item's own footprint,
  so it can never extend past whatever boundary the item itself is clamped to.

### Changed

- **Shelving is now one draggable unit with multiple levels**, not several
  separate racks spread along the wall. "Levels" (was "Count") sets how
  many individually assignable shelves stack inside that one unit. Drag a
  unit in the 3D view to reposition it -- any cargo assigned to one of its
  levels re-snaps to follow it. Units remain fixtures (excluded from
  weight/value/floor-use stats) and removable from the Trailer Fixtures list.

## [2.3.0] - 2026-09-12

### Added

- Trailer dimensions are entered in **feet** instead of inches, with clearer
  "Length / Width / Height" labels. Presets now show their nominal size in
  feet too. Internally the app still works in inches everywhere else (cargo
  dimensions, positions, the PDF), so nothing else changed units.
- **Shelving fixtures.** Shelves are no longer a cargo item type -- they're
  trailer fixtures, added in bulk (start number + count, size, wall side,
  height off the floor) from a new "Shelving" panel, rendered as a rack
  (posts + boards) and excluded from weight/value/floor-use stats, matching
  how a real shelving unit isn't cargo. Pallets and totes can be explicitly
  assigned to a shelf via a "Place on shelf" dropdown, which also positions
  the item on that shelf instead of the floor. Removing a shelf clears the
  assignment on anything that referenced it. Shelves persist through
  save/load.
- Pallets and totes now look like what they are instead of a plain box:
  pallets get a wooden deck plate under the load, totes get a rim band.
- **Update-available banner.** The app checks its own deployed URL
  periodically (and when the tab regains focus) for a newer `APP_VERSION`
  and shows a dismissible "Reload to get it" banner if one is found. No-ops
  entirely offline or when opened via `file://`.

## [2.2.0] - 2026-09-12

### Added

- Cargo items now have a **Type**: Pallet, Tote, or Shelf. Selecting Shelf
  reveals a shelf number field so individual shelf positions can be tracked.
  Type and shelf number are saved/loaded with the layout and show up in the
  cargo manifest and the PDF BOL.
- The tractor unit coupled to the trailer nose is now a low-poly truck model
  (cab, windshield, hood, bumper, wheels) built from primitives and a
  canvas-drawn face texture, instead of a plain wireframe box.

## [2.1.0] - 2026-09-11

### Added

- Both side panels are now collapsible. The controls sidebar gained a hide/show
  handle, matching the one the cargo manifest already had. Collapsing both gives
  the 3D view the full window.
- Keyboard shortcuts `[` and `]` toggle the controls panel and the manifest.
- The manifest starts collapsed on windows narrower than 900 px.

### Fixed

- **A collapsed manifest could not be reopened.** The toggle handle was a child
  of `#manifestSide`, and the collapsed rule set `width:0; overflow:hidden`,
  which clipped the handle positioned at `left:-40px`. Once hidden, the panel
  was gone for the rest of the session. Both handles now live in the canvas
  area, outside the panels they control, and a test asserts they stay there.
- The narrow-screen rule previously set `display:none` on the manifest, hiding
  it with no way to bring it back. Panel widths are reduced instead.

### Changed

- Handle arrows and `aria-expanded` now reflect panel state.

## [2.0.0] - 2026-09-11

First tracked release. The previous build shipped as a loose file titled
"Trailer Planner Pro - Final Verified Build" and is referred to here as v1.

### Fixed

- **Rotate button threw a ReferenceError.** v1 markup bound
  `onclick="rotatePallet()"` but no `rotatePallet` function existed anywhere in
  the script. The button was dead. Rotation is now implemented: it swaps length
  and width, rebuilds the box geometry, re-clamps to the envelope, and
  re-resolves overlaps.
- **Delete mode did nothing.** v1 toggled a `deleteMode` flag and a CSS class,
  but the flag was never read. There was no picking code and no way to remove a
  pallet at all. Delete mode now disables dragging, raycasts on pointer down,
  and removes the picked pallet. A "Delete selected" button and the Delete key
  do the same thing.
- **No window resize handling.** Renderer size and camera aspect were set once
  at init, so resizing the browser stretched the scene. A resize listener now
  updates both, and collapsing the manifest panel triggers it too.
- **Trailer dimensions could not be changed.** v1 hardcoded 636 x 102 x 110 in
  `addNewTrailer` with no UI. Loading a saved project assigned `dims` but never
  rebuilt the wireframe, so a non-default trailer displayed the wrong envelope.
  Dimensions, name, and max payload are now editable, presets are provided, and
  applying them rebuilds the frame, floor, and cab, then re-clamps cargo.
- **Editing a pallet ignored size and label.** v1's `updatePallet` wrote only
  label, weight, value, and notes into `userData`; geometry and the rendered
  face label were never regenerated, so a renamed or resized pallet kept its old
  appearance. Both are now rebuilt when they change.
- **BOL data was invisible after a load and then destroyed.** `openBOL` never
  populated the form from state, and `closeBOL` replaced the entire shipment
  object from whatever the empty form contained. Opening the modal now fills it
  from state, Save writes back, and Cancel discards.
- **Malformed or partial layout files produced NaN geometry.** Pallet records
  missing `pos`, or carrying weights as strings, flowed straight into
  `position.set` and `parseFloat`. All records now pass through
  `normalizePallet`, which coerces and defaults every field.
- **`loadProject` had no error handling.** An invalid JSON file threw silently
  and left the scene half-cleared. Parse failures, missing trailers, and read
  errors are now caught and surfaced to the user.
- **Manifest rendered user input as HTML.** Labels and notes were interpolated
  into `innerHTML`, so a layout file containing markup injected it into the
  page. The manifest is now built with `textContent`.
- **Geometry, material, and texture leaks.** Removing or rebuilding meshes did
  not dispose GPU resources. All removal paths now dispose geometry, material,
  and canvas texture.
- **PDF snapshot was stretched.** The 3D image was forced into a fixed
  190 x 90 mm box regardless of canvas aspect. The image is now fitted and
  centered on its true aspect ratio.
- **PDF filename was always `BOL_FULL.pdf`.** It now uses the BOL reference or
  the trailer name.
- **Save URL was never revoked.** `saveProject` leaked an object URL per save.

### Added

- Manifest statistics: piece count, floor utilization, payload utilization,
  weight-weighted center of gravity from the nose, and lateral CG offset with an
  out-of-balance highlight. Clearly labeled as a planning aid, not an
  axle-weight calculation.
- Multiple named trailers with add and remove, plus nominal presets for 53 ft
  and 48 ft dry vans, 40 ft and 20 ft containers, and a 48 ft flatbed.
- Oversize warnings when a pallet footprint exceeds the floor or its height
  exceeds the interior.
- Click a manifest row to select the corresponding pallet in 3D.
- Duplicate selection, with the copy offset one length aft and auto-renamed.
- Label auto-increment after each add.
- Keyboard shortcuts: R rotate, D duplicate, Delete remove, Esc deselect.
- Photo can now be attached or replaced on an existing pallet, not only at add
  time.
- Versioned save format (`format` + `version` tags) with automatic migration of
  v1 layout files.
- Toast notifications for success and error states.
- Boot guard with a readable message when the CDN libraries fail to load,
  instead of a blank black canvas.
- Per-piece positions printed in the PDF manifest.
- Automated test suite (jsdom) and GitHub Actions CI.

### Changed

- All inline `onclick` attributes replaced with handlers bound in `wireUI()`, so
  the test suite can prove every handler resolves to a defined function. This is
  the structural fix for the dead-rotate-button class of defect.
- Weights and values are stored as numbers rather than raw input strings.
- Pallet colors persist across save, load, rotate, and duplicate.
- Document declares `charset`, `viewport`, and `lang`.
- Directional light added alongside ambient so box faces read with depth.
- jsPDF now loaded from jsDelivr to match the other three pins on one CDN.

### Known limitations

- Rotation is 90 degrees about the vertical axis only.
- Overlap handling separates pieces; it does not optimize load packing.
- Presets are nominal values, not verified manufacturer specifications.
