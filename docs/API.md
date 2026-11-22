# FrameBuilder — API

HD2Lab FrameBuilder (`PKPilot0015`) has no server. Everything below runs inside the
visitor's browser: the studio is a Vite + React app, and every document it edits is read,
validated and printed by one shared classic script, `public/shutterframe.js`.

- Live: https://hyangdan2.github.io/PKPilot0015/
- Studio name: **FrameBuilder** (HD2Lab)
- Document format: `shutterframe/v1` (`.shutterframe.json`)

## 1. The shared engine

`public/shutterframe.js` is loaded with a plain `<script>` before the app boots and exposes
`window.ShutterFrame`. Shutterplate (`PKPilot0003`) and Nordlys (`PKPilot0011`) load the same
file, so a frame validated in one app paints identically in the other two.

| Call | Returns | What it does |
| --- | --- | --- |
| `validate(raw)` | `{ ok, spec, errors, warnings }` | Reads any candidate document into the canonical shape: unknown keys dropped, every value clamped, missing cells filled. |
| `parse(raw)` | same as `validate` | Alias kept for the two host apps. |
| `encode(spec)` / `decode(text)` | share string / spec | lz-string share codec; a plain JSON string decodes too. |
| `fromUrl(href)` | spec \| null | The frame carried by a `#frame=` or `?frame=` parameter. |
| `shareUrl(base, spec)` | string | `base#frame=…` — the link that opens this frame in another app. |
| `layout(spec, opts)` / `paint(ctx, layout)` / `paintTo(canvas, spec, opts)` | layout / `boolean` | Paints the plate; `paintTo` writes straight into a canvas at design size × `scale`. |
| `primeAssets(spec)` | `Promise<spec>` | Decodes the background photo, the PNG overlay and every sprite into the document. |
| `onAssetsLoaded(fn)` | unsubscribe | Called when a late image arrives, so a host repaints instead of showing a blank plate. |
| `layers(spec)` / `paintOrder(spec)` | `LayerRow[]` | The one stack: back to front, hidden elements removed. |
| `moveLayer` / `setZ` / `depthOf` / `boundsOf` / `hitLayer` / `alignLayer` / `translate` / `resetLayers` | spec or box | Layer order, geometry, alignment and hit testing for the editor. |
| `addSticker` / `addSprite` / `addEmblem` / `removeLayer` | spec | Adds a stripe, an uploaded sprite, the logo, or removes a text / sticker / logo layer. |
| `stickerPresets()` | `[{ id, label }]` | The seven transparent stripe presets. |
| `emblemList()` | `[{ id, name }]` | The eleven logo marks. |
| `emblemOf(id)` / `emblemBox(emblem)` | catalogue entry / box | Mark metadata (its `vb` ratio) and the box it fills on the plate. |
| `store` | `list` · `get` · `put` · `remove` · `clear` | The IndexedDB shelf, `hd2_custom_frames_v1` / `frames`. |

## 2. `shutterframe/v1`

```jsonc
{
  "schema": "shutterframe/v1",
  "id": "frame-…",
  "name": "Classic Strip",
  "author": "HD2Lab",
  "updatedAt": "2026-11-22T00:00:00.000Z",
  "canvas": {
    "width": 600, "height": 1800,
    "background": "#f4f1ea",
    "light": true,
    "gradient": { "type": "linear", "angle": 165, "stops": ["#f4f1ea", "#ded4ef"] },
    "backgroundImage": { "dataUrl": "data:image/png;…", "opacity": 1 }
  },
  "perforation": { "enabled": true, "style": "side", "color": "#e9e4d8",
                   "holeWidth": 16, "holeHeight": 12, "gap": 26 },
  "cells": [{ "x": 36, "y": 96, "w": 528, "h": 380, "radius": 4, "rotation": 0, "z": 10 }],
  "overlay": { "dataUrl": "data:image/png;…", "layer": "above", "opacity": 1 },
  "stickers": [{ "id": "sticker-…", "kind": "stripe", "preset": "diagonal-bar",
                 "color": "#7c5cd6", "color2": "#ffffff", "x": 100, "y": 900,
                 "w": 400, "h": 120, "rotation": 0, "opacity": 0.92 }],
  "texts": [{ "id": "t1", "text": "{{date}}", "x": 300, "y": 1740, "size": 20,
              "family": "sans", "weight": 500, "align": "center",
              "color": "#6b635a", "letterSpacing": 2, "rotation": 0, "visible": true }],
  "emblem": { "enabled": true, "id": "hd2lab", "mono": false, "x": 300, "y": 1700,
              "maxW": 220, "maxH": 40, "align": "center", "mode": "auto",
              "rotation": 0, "z": 26 }
}
```

- **Variables**: `{{date}}` `{{camera}}` `{{lens}}` `{{film}}` `{{title}}` `{{caption}}` `{{shutter}}` `{{iso}}` `{{aperture}}`. A missing value never leaves a stray `·` or `f/` behind.
- **Layers**: `cells`, `stickers`, `emblem` and `texts` share one stack. An element without `z` keeps the legacy order (cells → PNG overlay above photos → stickers → emblem → texts); any explicit `z` pulls an element in front of or behind that order.
- **Images**: only `data:image/…` URLs are accepted for the overlay, the background photo and sprites. Decoded images live on the document as `__image` and are never serialised.

## 3. `emblem` — the logo layer

| Field | Type | Notes |
| --- | --- | --- |
| `enabled` | boolean | `false` removes the logo from the plate **and** from the layer stack; `addEmblem()` brings the same mark back. |
| `id` | string | `hd2lab` (default) · `sony` · `canon` · `nikon` · `fujifilm` · `samsung` · `leica` · `hasselblad` · `apple` · `lumix` · `omsystem`. An unknown id falls back to `hd2lab`. |
| `mono` | boolean | `false` keeps each maker's official colour (Canon `#CC0000`, Samsung `#1428A0`, Leica `#E20613`, …); `true` prints the whole mark in one ink — **All Black**. |
| `x`, `y` | number | Design-space anchor: `x` is the logo's left / centre / right according to `align`, `y` is its vertical centre. |
| `maxW`, `maxH` | number | The box the mark may fill. The mark keeps its own width/height ratio inside it, so a wide wordmark is never squashed. |
| `align` | `left` · `center` · `right` | Anchor for `x`. |
| `mode` | `auto` · `light` · `dark` | The ink: `auto` follows `canvas.light`, `light` and `dark` force it. |
| `rotation`, `z` | number | Degrees around the logo's centre; position in the shared stack. |

The marks are the manufacturers' own published vector artwork, carried as path data in
`public/shutterframe.js` and drawn with Canvas `Path2D` — no SVG image, no font impression, crisp
at 20% and at 400%. Trademarks belong to their owners; the plate prints them to credit the
camera that took the photograph.

Documents written before this layer existed have no `id` or `mono`: they validate to
`id: 'hd2lab'`, `mono: false` and print exactly as they did.

## 4. Touch contract (the studio canvas)

| Gesture | Result |
| --- | --- |
| One-finger short tap | Selects the slot / text / sticker / logo under it; a tap on an empty spot clears the selection. |
| One-finger drag on the **selected** element | Moves it, with snap guides. |
| One-finger drag on an unselected element or an empty spot | Pans the plate; the document is untouched. |
| Two fingers within 0.15 s | Always the viewport's pinch (zoom around the midpoint) and pan. A layer drag the first finger had begun is reverted. |
| Two fingers after holding the selected element ≥ 0.15 s | That element's own pinch: size and rotation. |
| Corner grips / top rotation grip | Resize and rotate the selection, whatever the timing. |

The plate remembers its own viewport (`zoom` + `pan`) separately from the document, so zooming
and panning never edit the frame. `data-scale`, `data-zoom`, `data-pan-x/y` and
`data-origin-x/y` on `canvas.stage-canvas` expose that view for tests.

## 5. Build and check

```bash
npm install
npm run dev        # http://localhost:5175/PKPilot0015/
npm test           # vitest: engine, presets, i18n, shell
npm run test:e2e   # playwright: desktop 1440×900 and mobile 390×844 against dist/
npm run build      # tsc --noEmit && vite build
```

GitHub Actions (`.github/workflows/deploy.yml`) runs `tsc`, `npm test`, `npm run build` and
publishes `dist/` to GitHub Pages on every push to `main`.
