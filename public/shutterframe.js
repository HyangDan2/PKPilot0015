/*!
 * HD2Lab ShutterFrame v1 — the shared custom 4-cut frame engine.
 *
 * One plain script, loaded as a classic <script> by Mynda Ljósa (PKPilot0015),
 * Shutterplate (PKPilot0003) and Nordlys (PKPilot0011), so all three read the
 * same `.shutterframe.json` byte for byte: one validator, one painter, one
 * lz-string share codec and one IndexedDB shelf.
 *
 *   window.ShutterFrame.validate(raw)      → { ok, spec, errors, warnings }
 *   window.ShutterFrame.decode(text)        → spec | null
 *   window.ShutterFrame.encode(spec)        → compressed share string
 *   window.ShutterFrame.layout(spec, opts)  → { W, H, custom: {...} }
 *   window.ShutterFrame.paint(ctx, layout)  → boolean (painted a custom plate)
 *
 * No dependencies. lz-string is used when window.LZString is present; without
 * it the share string is the URI-encoded JSON, which decodes the same way.
 */
(function (root) {
  'use strict';

  var SCHEMA = 'shutterframe/v1';
  var VERSION = 1;
  var VAR_NAMES = ['date', 'camera', 'lens', 'film', 'title', 'caption', 'shutter', 'iso', 'aperture'];
  var FONTS = {
    sans: '"Pretendard", "Inter", "Helvetica Neue", system-ui, sans-serif',
    serif: '"Noto Serif KR", "Iowan Old Style", Georgia, serif',
    mono: '"JetBrains Mono", "SFMono-Regular", ui-monospace, monospace'
  };

  function num(value, fallback) {
    var n = typeof value === 'number' ? value : parseFloat(value);
    return isFinite(n) ? n : fallback;
  }
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function str(value, fallback) {
    return typeof value === 'string' ? value : (value == null ? fallback : String(value));
  }
  function color(value, fallback) {
    var v = str(value, fallback);
    return /^#([0-9a-f]{3,8})$/i.test(v) || /^rgba?\(/i.test(v) || /^hsla?\(/i.test(v) || v === 'transparent'
      ? v : fallback;
  }
  function uid(prefix) {
    return (prefix || 'sf') + '-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36);
  }

  /* ── validation ─────────────────────────────────────────────────────────── */

  function normalizeCell(raw, W, H) {
    var cell = raw && typeof raw === 'object' ? raw : {};
    var w = clamp(Math.round(num(cell.w, W * 0.4)), 8, W);
    var h = clamp(Math.round(num(cell.h, H * 0.2)), 8, H);
    var x = clamp(Math.round(num(cell.x, 0)), -W, W * 2);
    var y = clamp(Math.round(num(cell.y, 0)), -H, H * 2);
    return { x: x, y: y, w: w, h: h, radius: clamp(num(cell.radius, 0), 0, Math.min(w, h) / 2) };
  }

  function normalizeText(raw, index, W, H) {
    var t = raw && typeof raw === 'object' ? raw : {};
    var align = t.align === 'left' || t.align === 'right' ? t.align : 'center';
    var family = t.family === 'serif' || t.family === 'mono' ? t.family : 'sans';
    return {
      id: str(t.id, 'text-' + (index + 1)),
      text: str(t.text, ''),
      x: clamp(num(t.x, W / 2), -W, W * 2),
      y: clamp(num(t.y, H - 40), -H, H * 2),
      size: clamp(num(t.size, Math.max(8, Math.round(W * 0.028))), 4, Math.max(W, H)),
      family: family,
      weight: clamp(Math.round(num(t.weight, 500)), 100, 900),
      align: align,
      color: color(t.color, '#1b1a18'),
      letterSpacing: clamp(num(t.letterSpacing, 0), -10, 60),
      visible: t.visible !== false
    };
  }

  function normalizeEmblem(raw) {
    var e = raw && typeof raw === 'object' ? raw : {};
    return {
      enabled: e.enabled !== false,
      x: num(e.x, 0),
      y: num(e.y, 0),
      maxW: clamp(num(e.maxW, 240), 8, 4000),
      maxH: clamp(num(e.maxH, 64), 8, 4000),
      align: e.align === 'left' || e.align === 'right' ? e.align : 'center',
      mode: e.mode === 'light' || e.mode === 'dark' ? e.mode : 'auto'
    };
  }

  function normalizePerforation(raw, W, H) {
    var p = raw && typeof raw === 'object' ? raw : {};
    var base = Math.max(6, Math.round(Math.min(W, H) * 0.022));
    return {
      enabled: !!p.enabled,
      style: p.style === 'film' ? 'film' : 'side',
      color: color(p.color, '#e9e4d8'),
      holeWidth: clamp(Math.round(num(p.holeWidth, base)), 2, W / 2),
      holeHeight: clamp(Math.round(num(p.holeHeight, Math.round(base * 0.72))), 2, H / 2),
      gap: clamp(Math.round(num(p.gap, Math.round(base * 1.6))), 1, Math.max(W, H))
    };
  }

  function normalizeOverlay(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var url = str(raw.dataUrl, '');
    if (!/^data:image\//i.test(url)) return null;
    return {
      dataUrl: url,
      layer: raw.layer === 'below' ? 'below' : 'above',
      opacity: clamp(num(raw.opacity, 1), 0, 1)
    };
  }

  /**
   * Reads any candidate document into the one canonical v1 shape. Unknown keys
   * are dropped and every value lands in range, so a frame an app receives is
   * always paintable — an invalid document still returns its errors.
   */
  function validate(raw) {
    var errors = [];
    var warnings = [];
    var input = raw;
    if (typeof input === 'string') {
      try { input = JSON.parse(input); } catch (e) { return { ok: false, spec: null, errors: ['JSON을 읽지 못했습니다.'], warnings: warnings }; }
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return { ok: false, spec: null, errors: ['프레임 문서가 객체가 아닙니다.'], warnings: warnings };
    }
    if (input.schema !== SCHEMA) {
      if (input.schema == null) warnings.push('schema가 없어 shutterframe/v1로 맞췄습니다.');
      else errors.push('schema가 ' + SCHEMA + '가 아닙니다: ' + String(input.schema));
    }
    var cv = input.canvas && typeof input.canvas === 'object' ? input.canvas : {};
    var W = clamp(Math.round(num(cv.width, 0)), 0, 6000);
    var H = clamp(Math.round(num(cv.height, 0)), 0, 6000);
    if (!W || !H) { errors.push('canvas.width / canvas.height가 필요합니다.'); W = W || 600; H = H || 1800; }

    var gradient = null;
    if (cv.gradient && typeof cv.gradient === 'object') {
      var stops = Array.isArray(cv.gradient.stops) ? cv.gradient.stops : [];
      if (stops.length === 2) {
        gradient = {
          type: 'linear',
          angle: num(cv.gradient.angle, 160),
          stops: [color(stops[0], '#f4f1ea'), color(stops[1], '#e3ddf2')]
        };
      }
    }

    var cells = Array.isArray(input.cells) ? input.cells.slice(0, 4) : [];
    while (cells.length < 4) cells.push({ x: 0, y: 0, w: Math.round(W / 2), h: Math.round(H / 2), radius: 0 });
    if (!Array.isArray(input.cells) || input.cells.length !== 4) {
      warnings.push('cells는 4개여야 합니다. 모자란 칸을 기본값으로 채웠습니다.');
    }

    var texts = Array.isArray(input.texts) ? input.texts.map(function (t, i) { return normalizeText(t, i, W, H); }) : [];
    var spec = {
      schema: SCHEMA,
      id: str(input.id, uid('frame')),
      name: str(input.name, 'Untitled frame'),
      author: input.author == null ? undefined : str(input.author, ''),
      updatedAt: str(input.updatedAt, new Date().toISOString()),
      canvas: {
        width: W,
        height: H,
        background: color(cv.background, '#f4f1ea'),
        gradient: gradient || undefined,
        light: cv.light !== false
      },
      perforation: normalizePerforation(input.perforation, W, H),
      cells: cells.map(function (c) { return normalizeCell(c, W, H); }),
      overlay: normalizeOverlay(input.overlay) || undefined,
      texts: texts,
      emblem: normalizeEmblem(input.emblem)
    };
    return { ok: errors.length === 0, spec: spec, errors: errors, warnings: warnings };
  }

  /* A mutable deep copy, so an editor never paints through to its source. */
  function clone(spec) {
    return JSON.parse(JSON.stringify(spec));
  }

  function touch(spec, patch) {
    var next = Object.assign(clone(spec), patch || {});
    next.updatedAt = new Date().toISOString();
    return next;
  }

  /* ── share codec ────────────────────────────────────────────────────────── */

  function lz() { return root.LZString || null; }

  function encode(spec) {
    var clean = validate(spec).spec || spec;
    var json = JSON.stringify(clean);
    var LZ = lz();
    if (LZ && typeof LZ.compressToEncodedURIComponent === 'function') return LZ.compressToEncodedURIComponent(json);
    return encodeURIComponent(json);
  }

  function decodeText(text) {
    var t = String(text || '').trim();
    if (!t) return null;
    if (t.indexOf('frame=') >= 0) {
      var at = t.indexOf('frame=') + 6;
      var rest = t.slice(at);
      var amp = rest.indexOf('&');
      t = amp >= 0 ? rest.slice(0, amp) : rest;
      try { t = decodeURIComponent(t); } catch (e) { /* keep */ }
    }
    var LZ = lz();
    if (LZ) {
      try {
        var out = LZ.decompressFromEncodedURIComponent(t) || LZ.decompressFromBase64(t);
        if (out) {
          var parsed = JSON.parse(out);
          var checked = validate(parsed);
          if (checked.spec) return checked.spec;
        }
      } catch (e) { /* not lz */ }
    }
    try { var direct = JSON.parse(t); var v = validate(direct); return v.spec; } catch (e) { /* not json */ }
    try {
      var dec = decodeURIComponent(t);
      var v2 = validate(JSON.parse(dec));
      return v2.spec;
    } catch (e) { /* not uri json */ }
    try {
      var raw = root.atob ? root.atob(t) : '';
      if (raw) return validate(JSON.parse(raw)).spec;
    } catch (e) { /* not base64 */ }
    return null;
  }

  /** The spec carried by a URL's `#frame=` or `?frame=` parameter, if any. */
  function fromUrl(href) {
    var url = String(href || (root.location && root.location.href) || '');
    var hash = url.indexOf('#') >= 0 ? url.slice(url.indexOf('#') + 1) : '';
    var search = url.indexOf('?') >= 0 ? url.slice(url.indexOf('?') + 1).split('#')[0] : '';
    if (hash.indexOf('frame=') >= 0) return decodeText(hash);
    if (search.indexOf('frame=') >= 0) return decodeText(search);
    return null;
  }

  /** A link that opens `base` with this frame queued for import. */
  function shareUrl(base, spec) {
    var clean = base || (str((root.location && root.location.origin) || '', '') + '/');
    var hashAt = clean.indexOf('#');
    if (hashAt >= 0) clean = clean.slice(0, hashAt);
    return clean + '#frame=' + encode(spec);
  }

  /* ── variables ──────────────────────────────────────────────────────────── */

  function two(n) { return (n < 10 ? '0' : '') + n; }

  function formatDate(value) {
    if (!value) return '';
    var d = value instanceof Date ? value : new Date(String(value).replace(' ', 'T'));
    if (isNaN(d.getTime())) return String(value);
    return d.getFullYear() + '.' + two(d.getMonth() + 1) + '.' + two(d.getDate());
  }

  function buildVars(spec, fields) {
    var f = fields || {};
    var camera = f.camera || [f.make, f.model].filter(Boolean).join(' ');
    return {
      date: f.date || formatDate(f.datetime),
      camera: camera,
      lens: f.lens || '',
      film: f.film || '',
      title: f.title || (spec && spec.name) || 'MYNDA LJÓSA',
      caption: f.caption || '',
      shutter: f.shutter || '',
      iso: f.iso || '',
      aperture: f.aperture || ''
    };
  }

  /* A printed row reads as a list — "camera · lens · shutter". A missing value
     must not leave "· ·" behind, or a naked "f/" where the number should be. */
  function tidyList(line) {
    if (line.indexOf('·') < 0) return line.replace(/\s{2,}/g, ' ').trim();
    var parts = line.split('·');
    var kept = [];
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i].trim();
      if (!part) continue;
      if (/^(f\/|ISO|\u0192\/)$/i.test(part)) continue;
      kept.push(part);
    }
    return kept.join(' · ');
  }

  function applyVars(text, vars) {
    var src = str(text, '');
    var out = src.replace(/\{\{\s*([a-z]+)\s*\}\}/gi, function (whole, name) {
      var key = String(name).toLowerCase();
      return Object.prototype.hasOwnProperty.call(vars || {}, key) ? String(vars[key]) : '';
    });
    return tidyList(out);
  }

  /* ── painting ───────────────────────────────────────────────────────────── */

  function roundRect(ctx, x, y, w, h, r) {
    var rr = Math.max(0, Math.min(r || 0, Math.min(w, h) / 2));
    ctx.beginPath();
    if (!rr) { ctx.rect(x, y, w, h); return; }
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.arcTo(x + w, y, x + w, y + rr, rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
    ctx.lineTo(x + rr, y + h);
    ctx.arcTo(x, y + h, x, y + h - rr, rr);
    ctx.lineTo(x, y + rr);
    ctx.arcTo(x, y, x + rr, y, rr);
    ctx.closePath();
  }

  function drawCover(ctx, img, w, h, x, y, cw, ch) {
    var iw = img.width || img.naturalWidth || 1;
    var ih = img.height || img.naturalHeight || 1;
    var k = Math.max(cw / iw, ch / ih);
    var dw = iw * k;
    var dh = ih * k;
    ctx.drawImage(img, x + (cw - dw) / 2, y + (ch - dh) / 2, dw, dh);
  }

  function fillBackground(ctx, spec, W, H) {
    var cv = spec.canvas;
    if (cv.gradient && cv.gradient.stops && cv.gradient.stops.length === 2) {
      var angle = (num(cv.gradient.angle, 160) - 90) * Math.PI / 180;
      var cx = W / 2;
      var cy = H / 2;
      var reach = Math.abs(Math.cos(angle)) * W / 2 + Math.abs(Math.sin(angle)) * H / 2;
      var g = ctx.createLinearGradient(
        cx - Math.cos(angle) * reach, cy - Math.sin(angle) * reach,
        cx + Math.cos(angle) * reach, cy + Math.sin(angle) * reach
      );
      g.addColorStop(0, cv.gradient.stops[0]);
      g.addColorStop(1, cv.gradient.stops[1]);
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = cv.background || '#f4f1ea';
    }
    ctx.fillRect(0, 0, W, H);
  }

  function inkFor(spec, mode) {
    if (mode === 'light') return '#f5f2e9';
    if (mode === 'dark') return '#1a1917';
    return spec.canvas.light ? '#1a1917' : '#f5f2e9';
  }

  function drawOverlay(ctx, spec, W, H, layer) {
    var ov = spec.overlay;
    if (!ov || ov.layer !== layer) return;
    var img = ov.__image;
    if (!img) return;
    ctx.save();
    ctx.globalAlpha = clamp(num(ov.opacity, 1), 0, 1);
    var iw = img.width || img.naturalWidth || 1;
    var ih = img.height || img.naturalHeight || 1;
    var k = Math.min(W / iw, H / ih);
    var dw = iw * k;
    var dh = ih * k;
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    ctx.restore();
  }

  function drawPerforation(ctx, spec, W, H) {
    var p = spec.perforation;
    if (!p || !p.enabled) return;
    var hw = p.holeWidth;
    var hh = p.holeHeight;
    var gap = p.gap;
    var inset = Math.round(Math.min(W, H) * 0.012) + 2;
    ctx.save();
    ctx.fillStyle = p.color;
    if (p.style === 'side') {
      var pitch = hh + gap;
      var x1 = inset;
      var x2 = W - inset - hw;
      for (var y = inset; y + hh <= H - inset; y += pitch) {
        roundRect(ctx, x1, y, hw, hh, Math.min(hw, hh) * 0.28); ctx.fill();
        roundRect(ctx, x2, y, hw, hh, Math.min(hw, hh) * 0.28); ctx.fill();
      }
    } else {
      var px = hw + gap;
      var y1 = inset;
      var y2 = H - inset - hh;
      for (var x = inset; x + hw <= W - inset; x += px) {
        roundRect(ctx, x, y1, hw, hh, Math.min(hw, hh) * 0.28); ctx.fill();
        roundRect(ctx, x, y2, hw, hh, Math.min(hw, hh) * 0.28); ctx.fill();
      }
    }
    ctx.restore();
  }

  /** The HD2Lab mark in spec space, drawn as vectors so paint stays synchronous. */
  function drawEmblem(ctx, spec, s) {
    var e = spec.emblem;
    if (!e || !e.enabled) return;
    var W = spec.canvas.width;
    var H = spec.canvas.height;
    var ink = inkFor(spec, e.mode);
    var mh = clamp(e.maxH, 8, H);
    var mw = clamp(e.maxW, 8, W);
    var fs = Math.max(6, Math.round(mh * 0.62));
    ctx.save();
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    ctx.textBaseline = 'middle';
    ctx.font = '700 ' + fs + 'px ' + FONTS.sans;
    var label = 'HD2Lab';
    var labelW = ctx.measureText(label).width;
    var markW = fs * 0.9;
    var totalW = Math.min(mw, markW + fs * 0.32 + labelW);
    var x = e.align === 'left' ? e.x : (e.align === 'right' ? e.x - totalW : e.x - totalW / 2);
    var y = e.y;
    // the dual skewed bars
    ctx.lineWidth = Math.max(1, fs * 0.16);
    [0, 0.42].forEach(function (bias) {
      ctx.beginPath();
      ctx.moveTo(x + bias * fs + fs * 0.18, y - fs * 0.42);
      ctx.lineTo(x + bias * fs - fs * 0.02, y + fs * 0.42);
      ctx.stroke();
    });
    ctx.textAlign = 'left';
    ctx.fillText(label, x + markW + fs * 0.32, y);
    ctx.restore();
  }

  function drawTexts(ctx, spec, fields, s) {
    var vars = buildVars(spec, fields);
    spec.texts.forEach(function (t) {
      if (t.visible === false) return;
      var content = applyVars(t.text, vars);
      if (!content) return;
      ctx.save();
      ctx.fillStyle = t.color;
      ctx.textAlign = t.align === 'left' ? 'left' : (t.align === 'right' ? 'right' : 'center');
      ctx.textBaseline = 'alphabetic';
      var size = Math.max(4, t.size);
      ctx.font = t.weight + ' ' + size + 'px ' + (FONTS[t.family] || FONTS.sans);
      if (t.letterSpacing) {
        if ('letterSpacing' in ctx) ctx.letterSpacing = (t.letterSpacing * s) + 'px';
      }
      ctx.fillText(content, t.x, t.y);
      ctx.restore();
    });
  }

  /** Loads the overlay PNG once into the spec, so paint() stays synchronous. */
  function primeOverlay(spec) {
    return new Promise(function (resolve) {
      var ov = spec && spec.overlay;
      if (!ov || ov.__image || !root.Image) { resolve(spec); return; }
      var img = new root.Image();
      img.onload = function () { ov.__image = img; resolve(spec); };
      img.onerror = function () { resolve(spec); };
      img.src = ov.dataUrl;
    });
  }

  /**
   * Paints a custom plate. `layout.custom` carries the spec plus the four slot
   * images and the metadata whose variables fill the text rows.
   */
  function paint(ctx, layout) {
    if (!layout || !layout.custom) return false;
    var spec = layout.custom.spec;
    if (!spec) return false;
    var W = layout.W;
    var H = layout.H;
    var s = W / spec.canvas.width;
    var slots = layout.custom.slots || [];
    var fields = layout.custom.fields || {};
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();
    fillBackground(ctx, spec, W, H);
    drawOverlay(ctx, spec, W, H, 'below');
    drawPerforation(ctx, spec, W, H);
    spec.cells.forEach(function (cell, index) {
      var slot = slots[index];
      var img = slot && (slot.img || slot.image);
      if (!img) return;
      ctx.save();
      roundRect(ctx, cell.x * s, cell.y * s, cell.w * s, cell.h * s, cell.radius * s);
      ctx.clip();
      drawCover(ctx, img, img.width, img.height, cell.x * s, cell.y * s, cell.w * s, cell.h * s);
      ctx.restore();
    });
    drawOverlay(ctx, spec, W, H, 'above');
    drawEmblem(ctx, spec, s);
    drawTexts(ctx, spec, fields, s);
    ctx.restore();
    return true;
  }

  /** A layout in the plate contract the two studios already consume. */
  function layout(spec, opts) {
    opts = opts || {};
    var scale = num(opts.scale, 1) || 1;
    var clean = spec && spec.schema === SCHEMA ? spec : validate(spec).spec;
    if (!clean) return null;
    return {
      style: opts.style || 'custom',
      W: Math.max(2, Math.round(clean.canvas.width * scale)),
      H: Math.max(2, Math.round(clean.canvas.height * scale)),
      colors: { base: clean.canvas.background, light: clean.canvas.light, ink: inkFor(clean, 'auto') },
      radius: 0,
      multi: true,
      cells: clean.cells.map(function (c) { return { x: c.x * scale, y: c.y * scale, w: c.w * scale, h: c.h * scale }; }),
      custom: {
        spec: clean,
        slots: opts.slots || [],
        fields: opts.fields || {},
        scale: scale
      }
    };
  }

  /** Paints straight into a canvas of the spec's design size (× scale). */
  function paintTo(canvas, spec, opts) {
    var L = layout(spec, opts);
    canvas.width = L.W;
    canvas.height = L.H;
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;
    paint(ctx, L);
    return L;
  }

  /* ── layout helpers shared by the editor ────────────────────────────────── */

  /** Equal cells inside a margin: `1x4` strips and `2x2` grids. */
  function alignCells(spec, kind, margin, gutter) {
    var W = spec.canvas.width;
    var H = spec.canvas.height;
    var pad = clamp(num(margin, Math.round(W * 0.06)), 0, Math.min(W, H) / 3);
    var gap = clamp(num(gutter, Math.round(W * 0.03)), 0, Math.min(W, H) / 4);
    var next = clone(spec);
    if (kind === '2x2') {
      var cw = Math.floor((W - pad * 2 - gap) / 2);
      var ch = Math.floor((H - pad * 2 - gap) / 2);
      next.cells = [
        { x: pad, y: pad, w: cw, h: ch, radius: spec.cells[0].radius },
        { x: pad + cw + gap, y: pad, w: cw, h: ch, radius: spec.cells[1].radius },
        { x: pad, y: pad + ch + gap, w: cw, h: ch, radius: spec.cells[2].radius },
        { x: pad + cw + gap, y: pad + ch + gap, w: cw, h: ch, radius: spec.cells[3].radius }
      ];
    } else {
      var w = Math.floor(W - pad * 2);
      var h = Math.floor((H - pad * 2 - gap * 3) / 4);
      next.cells = [0, 1, 2, 3].map(function (i) {
        return { x: pad, y: pad + i * (h + gap), w: w, h: h, radius: spec.cells[i].radius };
      });
    }
    return next;
  }

  /* ── IndexedDB shelf (shared store name and shape) ──────────────────────── */

  var DB_NAME = 'hd2_custom_frames_v1';
  var STORE = 'frames';

  function db() {
    return new Promise(function (resolve, reject) {
      if (!root.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
      var req = root.indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var d = req.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function tx(mode, run) {
    return db().then(function (d) {
      return new Promise(function (resolve, reject) {
        var t = d.transaction(STORE, mode);
        var store = t.objectStore(STORE);
        var out = run(store);
        t.oncomplete = function () { resolve(out && out.result !== undefined ? out.result : out); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error); };
      });
    });
  }

  var store = {
    list: function () {
      return tx('readonly', function (s) { return s.getAll(); }).then(function (rows) {
        var list = rows || [];
        return list.map(function (r) { return r.spec || r; }).filter(function (s) { return s && s.schema === SCHEMA; });
      });
    },
    get: function (id) {
      return tx('readonly', function (s) { return s.get(id); }).then(function (row) { return row ? (row.spec || row) : null; });
    },
    put: function (spec) {
      var clean = validate(spec).spec || spec;
      return tx('readwrite', function (s) {
        s.put({ id: clean.id, name: clean.name, updatedAt: clean.updatedAt, spec: clean });
        return clean;
      });
    },
    remove: function (id) {
      return tx('readwrite', function (s) { s.delete(id); return true; });
    },
    clear: function () {
      return tx('readwrite', function (s) { s.clear(); return true; });
    }
  };

  /* ── progress messages for the two host apps ────────────────────────────── */

  function summary(spec) {
    return spec.canvas.width + '×' + spec.canvas.height + ' · ' + spec.cells.length + '컷 · ' + spec.texts.length + '텍스트';
  }

  var api = {
    SCHEMA: SCHEMA,
    VERSION: VERSION,
    VAR_NAMES: VAR_NAMES,
    FONTS: FONTS,
    validate: validate,
    parse: function (raw) { return validate(raw); },
    clone: clone,
    touch: touch,
    uid: uid,
    encode: encode,
    decode: decodeText,
    decodeText: decodeText,
    fromUrl: fromUrl,
    shareUrl: shareUrl,
    buildVars: buildVars,
    applyVars: applyVars,
    formatDate: formatDate,
    layout: layout,
    paint: paint,
    primeOverlay: primeOverlay,
    paintTo: paintTo,
    alignCells: alignCells,
    summary: summary,
    store: store,
    helpers: { roundRect: roundRect, drawCover: drawCover, fillBackground: fillBackground }
  };

  root.ShutterFrame = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
