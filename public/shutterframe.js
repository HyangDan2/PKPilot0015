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
 * v1 stays 100% backward compatible. A document written by the first editor
 * keeps its exact printed order, and the same document may now also carry:
 *
 *   canvas.backgroundImage  { dataUrl, opacity }      a cropped photograph
 *   cells[].rotation / .z   texts[].rotation / .z     emblem.rotation / .z
 *   stickers[]              transparent stripe stickers and uploaded sprites
 *
 * Elements without an explicit `z` keep the legacy order — cells, PNG overlay
 * set to "above", stickers, emblem, texts — expressed in the Z table below so
 * any element with an explicit `z` can be pulled in front of or behind it.
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

  /* The legacy painting order as numbers. A document that carries no `z`
     resolves to exactly this, so old frames print as they always have. */
  var Z = { cell: 10, overlayAbove: 14, sticker: 20, emblem: 26, text: 30 };

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
  /** Degrees, wrapped to (-180, 180]; a missing value is 0. */
  function rotation(value) {
    var n = num(value, 0);
    if (!isFinite(n)) return 0;
    n = ((n % 360) + 360) % 360;
    if (n > 180) n -= 360;
    return Math.round(n * 100) / 100;
  }
  /** An explicit layer order, or undefined so the legacy default applies. */
  function layerZ(value) {
    if (value == null || value === '') return undefined;
    var n = num(value, NaN);
    return isFinite(n) ? clamp(Math.round(n), -9999, 9999) : undefined;
  }
  function dataUrlImage(value) {
    var v = str(value, '');
    return /^data:image\//i.test(v) ? v : '';
  }

  /* ── transparent stripe stickers ────────────────────────────────────────── */

  function seeded(seed) {
    var s = Math.floor(Math.abs(seed) || 1) % 2147483647;
    return function () { s = (s * 16807) % 2147483647; return s / 2147483647; };
  }

  /**
   * Every stripe sticker is drawn by the engine itself (no image needed), so a
   * frame that uses one stays a few kilobytes. `box` is in output pixels and is
   * already clipped to the sticker's rounded rectangle by drawSticker().
   */
  var STICKER_PRESETS = {
    'diagonal-bar': {
      label: '사선 스트라이프',
      draw: function (ctx, b, o) {
        var band = Math.max(5, b.h * 0.2);
        var reach = Math.sqrt(b.w * b.w + b.h * b.h) * 1.3;
        ctx.save();
        ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
        ctx.rotate(-Math.PI / 4);
        ctx.fillStyle = o.color;
        ctx.fillRect(-reach / 2, -reach / 2, reach, reach);
        ctx.fillStyle = o.color2;
        for (var x = -reach; x < reach; x += band * 2) ctx.fillRect(x, -reach / 2, band, reach);
        ctx.restore();
      }
    },
    'film-tape': {
      label: '필름 테이프',
      draw: function (ctx, b, o) {
        ctx.save();
        ctx.fillStyle = o.color;
        ctx.fillRect(b.x, b.y, b.w, b.h);
        var hole = Math.max(3, b.h * 0.17);
        var step = hole * 2.2;
        var inset = b.h * 0.13;
        ctx.fillStyle = o.color2;
        for (var x = b.x + hole * 0.6; x + hole <= b.x + b.w - hole * 0.6; x += step) {
          roundRect(ctx, x, b.y + inset, hole, hole * 0.78, hole * 0.22); ctx.fill();
          roundRect(ctx, x, b.y + b.h - inset - hole * 0.78, hole, hole * 0.78, hole * 0.22); ctx.fill();
        }
        ctx.restore();
      }
    },
    'masking-tape': {
      label: '마스킹 테이프',
      draw: function (ctx, b, o) {
        var rnd = seeded(b.w * 31 + b.h);
        var teeth = Math.max(8, Math.round(b.w / 14));
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(b.x, b.y + b.h * (0.06 + rnd() * 0.06));
        for (var i = 1; i <= teeth; i++) {
          var t = i / teeth;
          ctx.lineTo(b.x + b.w * t, b.y + b.h * (0.02 + rnd() * 0.12));
        }
        for (var j = teeth; j >= 0; j--) {
          var u = j / teeth;
          ctx.lineTo(b.x + b.w * u, b.y + b.h * (0.98 - rnd() * 0.12));
        }
        ctx.closePath();
        ctx.fillStyle = o.color;
        ctx.fill();
        ctx.clip();
        ctx.strokeStyle = o.color2;
        ctx.globalAlpha *= 0.55;
        ctx.lineWidth = Math.max(1, b.h * 0.035);
        for (var y = b.y; y < b.y + b.h; y += Math.max(5, b.h * 0.16)) {
          ctx.beginPath();
          ctx.moveTo(b.x, y);
          ctx.lineTo(b.x + b.w, y + b.h * 0.08);
          ctx.stroke();
        }
        ctx.restore();
      }
    },
    'halftone-strip': {
      label: '하프톤 스트립',
      draw: function (ctx, b, o) {
        ctx.save();
        ctx.fillStyle = o.color2;
        var step = Math.max(6, b.h / 7);
        var col = 0;
        for (var x = b.x + step * 0.5; x < b.x + b.w + step; x += step * 0.9) {
          var grow = (x - b.x) / Math.max(1, b.w);
          var r = (step * 0.5) * clamp(0.15 + grow * 1.15, 0.1, 0.95);
          for (var y = b.y + step * 0.5 + (col % 2 ? step * 0.5 : 0); y < b.y + b.h; y += step) {
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
          }
          col += 1;
        }
        if (o.color !== 'transparent' && o.color !== '#ffffff') {
          /* a faint wash keeps the dots readable on a busy photograph */
          ctx.globalAlpha *= 0.18;
          ctx.fillStyle = o.color;
          ctx.fillRect(b.x, b.y, b.w, b.h);
        }
        ctx.restore();
      }
    },
    'nordic-sparkle': {
      label: '노르딕 반짝임',
      draw: function (ctx, b, o) {
        var rnd = seeded(b.w * 17 + b.h * 7 + 3);
        var count = clamp(Math.round((b.w * b.h) / 9000), 4, 26);
        ctx.save();
        ctx.fillStyle = o.color2;
        ctx.fillStyle = o.color2 === '#ffffff' ? o.color : o.color2;
        for (var i = 0; i < count; i++) {
          var cx = b.x + b.w * (0.06 + rnd() * 0.88);
          var cy = b.y + b.h * (0.1 + rnd() * 0.8);
          var r = Math.max(2, Math.min(b.w, b.h) * (0.03 + rnd() * 0.06));
          ctx.beginPath();
          ctx.moveTo(cx, cy - r * 2.1);
          ctx.quadraticCurveTo(cx, cy, cx + r * 2.1, cy);
          ctx.quadraticCurveTo(cx, cy, cx, cy + r * 2.1);
          ctx.quadraticCurveTo(cx, cy, cx - r * 2.1, cy);
          ctx.quadraticCurveTo(cx, cy, cx, cy - r * 2.1);
          ctx.fill();
        }
        ctx.restore();
      }
    },
    'corner-frame': {
      label: '코너 브래킷',
      draw: function (ctx, b, o) {
        var len = Math.min(b.w, b.h) * 0.34;
        var lw = Math.max(2, Math.min(b.w, b.h) * 0.075);
        ctx.save();
        ctx.strokeStyle = o.color;
        ctx.lineWidth = lw;
        ctx.lineCap = 'square';
        var corners = [
          [b.x + lw / 2, b.y + lw / 2, 1, 1],
          [b.x + b.w - lw / 2, b.y + lw / 2, -1, 1],
          [b.x + lw / 2, b.y + b.h - lw / 2, 1, -1],
          [b.x + b.w - lw / 2, b.y + b.h - lw / 2, -1, -1]
        ];
        corners.forEach(function (c) {
          ctx.beginPath();
          ctx.moveTo(c[0] + len * c[2], c[1]);
          ctx.lineTo(c[0], c[1]);
          ctx.lineTo(c[0], c[1] + len * c[3]);
          ctx.stroke();
        });
        if (o.color2 !== 'transparent') {
          ctx.globalAlpha *= 0.5;
          ctx.strokeStyle = o.color2;
          ctx.lineWidth = Math.max(1, lw * 0.3);
          ctx.strokeRect(b.x + lw, b.y + lw, b.w - lw * 2, b.h - lw * 2);
        }
        ctx.restore();
      }
    },
    'grid-mesh': {
      label: '그리드 메시',
      draw: function (ctx, b, o) {
        var gap = Math.max(7, Math.min(b.w, b.h) / 5);
        ctx.save();
        ctx.strokeStyle = o.color;
        ctx.lineWidth = Math.max(1, Math.min(b.w, b.h) * 0.012);
        ctx.globalAlpha *= 0.9;
        for (var x = b.x; x <= b.x + b.w + 0.5; x += gap) {
          ctx.beginPath(); ctx.moveTo(x, b.y); ctx.lineTo(x, b.y + b.h); ctx.stroke();
        }
        for (var y = b.y; y <= b.y + b.h + 0.5; y += gap) {
          ctx.beginPath(); ctx.moveTo(b.x, y); ctx.lineTo(b.x + b.w, y); ctx.stroke();
        }
        ctx.restore();
      }
    }
  };

  var STICKER_IDS = Object.keys(STICKER_PRESETS);

  function stickerPresets() {
    return STICKER_IDS.map(function (id) { return { id: id, label: STICKER_PRESETS[id].label }; });
  }

  /** Paints one stripe preset into any box — the studio's swatches use this too. */
  function drawStickerPreset(ctx, preset, box, opts) {
    var p = STICKER_PRESETS[preset] || STICKER_PRESETS['diagonal-bar'];
    var o = opts || {};
    ctx.save();
    roundRect(ctx, box.x, box.y, box.w, box.h, Math.min(box.w, box.h) * 0.08);
    ctx.clip();
    p.draw(ctx, box, { color: color(o.color, '#7c5cd6'), color2: color(o.color2, '#ffffff') });
    ctx.restore();
  }

  /* ── validation ─────────────────────────────────────────────────────────── */

  function normalizeCell(raw, W, H) {
    var cell = raw && typeof raw === 'object' ? raw : {};
    var w = clamp(Math.round(num(cell.w, W * 0.4)), 8, W);
    var h = clamp(Math.round(num(cell.h, H * 0.2)), 8, H);
    var x = clamp(Math.round(num(cell.x, 0)), -W, W * 2);
    var y = clamp(Math.round(num(cell.y, 0)), -H, H * 2);
    return {
      x: x, y: y, w: w, h: h,
      radius: clamp(num(cell.radius, 0), 0, Math.min(w, h) / 2),
      rotation: rotation(cell.rotation),
      z: layerZ(cell.z)
    };
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
      rotation: rotation(t.rotation),
      z: layerZ(t.z),
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
      mode: e.mode === 'light' || e.mode === 'dark' ? e.mode : 'auto',
      rotation: rotation(e.rotation),
      z: layerZ(e.z)
    };
  }

  function normalizeSticker(raw, index, W, H) {
    var s = raw && typeof raw === 'object' ? raw : {};
    var kind = s.kind === 'sprite' ? 'sprite' : 'stripe';
    var url = dataUrlImage(s.dataUrl);
    if (kind === 'sprite' && !url) return null;
    var w = clamp(Math.round(num(s.w, Math.round(W * 0.62))), 8, W * 2);
    var h = clamp(Math.round(num(s.h, Math.round(H * 0.14))), 8, H * 2);
    var preset = str(s.preset, 'diagonal-bar');
    var out = {
      id: str(s.id, 'sticker-' + (index + 1)),
      kind: kind,
      label: str(s.label, kind === 'sprite' ? '스프라이트' : (STICKER_PRESETS[preset] || {}).label || '스트라이프'),
      color: color(s.color, kind === 'sprite' ? '#7c5cd6' : '#7c5cd6'),
      color2: color(s.color2, '#ffffff'),
      opacity: clamp(num(s.opacity, 0.92), 0, 1),
      x: clamp(num(s.x, Math.round((W - w) / 2)), -W, W * 2),
      y: clamp(num(s.y, Math.round((H - h) / 2)), -H, H * 2),
      w: w,
      h: h,
      rotation: rotation(s.rotation),
      z: layerZ(s.z),
      visible: s.visible !== false
    };
    if (kind === 'sprite') {
      out.dataUrl = url;
      out.preset = undefined;
    } else {
      out.preset = STICKER_PRESETS[preset] ? preset : 'diagonal-bar';
      if (STICKER_PRESETS[preset]) out.label = str(s.label, STICKER_PRESETS[preset].label);
    }
    return out;
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
    var url = dataUrlImage(raw.dataUrl);
    if (!url) return null;
    return {
      dataUrl: url,
      layer: raw.layer === 'below' ? 'below' : 'above',
      opacity: clamp(num(raw.opacity, 1), 0, 1)
    };
  }

  function normalizeBackgroundImage(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var url = dataUrlImage(raw.dataUrl);
    if (!url) return null;
    return { dataUrl: url, opacity: clamp(num(raw.opacity, 1), 0, 1) };
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
    var stickers = [];
    if (Array.isArray(input.stickers)) {
      input.stickers.slice(0, 40).forEach(function (s, i) {
        var item = normalizeSticker(s, i, W, H);
        if (item) stickers.push(item);
        else warnings.push('스프라이트 데이터(data:image)가 없어 스티커 ' + (i + 1) + '을 건너뛰었습니다.');
      });
    }
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
        backgroundImage: normalizeBackgroundImage(cv.backgroundImage) || undefined,
        light: cv.light !== false
      },
      perforation: normalizePerforation(input.perforation, W, H),
      cells: cells.map(function (c) { return normalizeCell(c, W, H); }),
      overlay: normalizeOverlay(input.overlay) || undefined,
      stickers: stickers,
      texts: texts,
      emblem: normalizeEmblem(input.emblem)
    };
    /* A validated copy stays paintable: images already loaded on the document
       we were handed follow it, so a shelf save never blinks a plate blank. */
    carryImages(input, cv, spec);
    return { ok: errors.length === 0, spec: spec, errors: errors, warnings: warnings };
  }

  function carryImages(input, cv, spec) {
    var seen = {};
    (Array.isArray(input.stickers) ? input.stickers : []).forEach(function (raw) {
      if (raw && raw.__image && raw.id != null) seen[String(raw.id)] = raw;
    });
    if (input.overlay && input.overlay.__image && spec.overlay && spec.overlay.dataUrl === str(input.overlay.dataUrl, '')) {
      spec.overlay.__image = input.overlay.__image;
    }
    var inBg = cv.backgroundImage;
    if (inBg && inBg.__image && spec.canvas.backgroundImage && spec.canvas.backgroundImage.dataUrl === str(inBg.dataUrl, '')) {
      spec.canvas.backgroundImage.__image = inBg.__image;
    }
    spec.stickers.forEach(function (st) {
      var raw = seen[st.id];
      if (raw && raw.__image && raw.dataUrl === st.dataUrl) st.__image = raw.__image;
    });
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

  /** The document as it belongs in a file or a share link — no loaded images. */
  function serialize(spec) {
    return JSON.stringify(spec, function (key, value) {
      if (typeof key === 'string' && key.indexOf('__') === 0) return undefined;
      return value;
    });
  }

  /* ── share codec ────────────────────────────────────────────────────────── */

  function lz() { return root.LZString || null; }

  function encode(spec) {
    var clean = validate(spec).spec || spec;
    var json = serialize(clean);
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

  function drawContain(ctx, img, x, y, cw, ch) {
    var iw = img.width || img.naturalWidth || 1;
    var ih = img.height || img.naturalHeight || 1;
    var k = Math.min(cw / iw, ch / ih);
    var dw = iw * k;
    var dh = ih * k;
    ctx.drawImage(img, x + (cw - dw) / 2, y + (ch - dh) / 2, dw, dh);
  }

  /** Turns the canvas around a point (in the canvas's current space). */
  function turnAt(ctx, cx, cy, deg) {
    var r = num(deg, 0);
    if (!r) return;
    ctx.translate(cx, cy);
    ctx.rotate(r * Math.PI / 180);
    ctx.translate(-cx, -cy);
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

  /** A photograph chosen in the editor, cropped to the plate by the browser. */
  function drawBackgroundImage(ctx, spec, W, H) {
    var bg = spec.canvas && spec.canvas.backgroundImage;
    if (!bg) return false;
    var img = bg.__image;
    if (!img) return false;
    ctx.save();
    ctx.globalAlpha = clamp(num(bg.opacity, 1), 0, 1);
    drawCover(ctx, img, W, H, 0, 0, W, H);
    ctx.restore();
    return true;
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

  function drawPerforation(ctx, spec, W, H, s) {
    var p = spec.perforation;
    if (!p || !p.enabled) return;
    var hw = p.holeWidth * s;
    var hh = p.holeHeight * s;
    var gap = p.gap * s;
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
    var label = 'HD2Lab';
    var markW = fs * 0.9;
    ctx.save();
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    ctx.textBaseline = 'middle';
    ctx.font = '700 ' + fs + 'px ' + FONTS.sans;
    var labelW = ctx.measureText(label).width;
    var totalW = Math.min(mw, markW + fs * 0.32 + labelW);
    var x = e.align === 'left' ? e.x : (e.align === 'right' ? e.x - totalW : e.x - totalW / 2);
    var y = e.y;
    ctx.save();
    turnAt(ctx, (x + totalW / 2) * s, y * s, e.rotation);
    ctx.scale(s, s);
    ctx.translate(x, y);
    // the dual skewed bars
    ctx.lineWidth = Math.max(1, fs * 0.16);
    [0, 0.42].forEach(function (bias) {
      ctx.beginPath();
      ctx.moveTo(bias * fs + fs * 0.18, -fs * 0.42);
      ctx.lineTo(bias * fs - fs * 0.02, fs * 0.42);
      ctx.stroke();
    });
    ctx.textAlign = 'left';
    ctx.fillText(label, markW + fs * 0.32, 0);
    ctx.restore();
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
      var size = Math.max(4, t.size * s);
      ctx.font = t.weight + ' ' + size + 'px ' + (FONTS[t.family] || FONTS.sans);
      if (t.letterSpacing) {
        if ('letterSpacing' in ctx) ctx.letterSpacing = (t.letterSpacing * s) + 'px';
      }
      if (t.rotation) {
        ctx.translate(t.x * s, t.y * s);
        ctx.rotate(t.rotation * Math.PI / 180);
        ctx.fillText(content, 0, 0);
      } else {
        ctx.fillText(content, t.x * s, t.y * s);
      }
      ctx.restore();
    });
  }

  function drawSticker(ctx, sticker, s) {
    if (!sticker || sticker.visible === false) return;
    var x = sticker.x * s;
    var y = sticker.y * s;
    var w = sticker.w * s;
    var h = sticker.h * s;
    if (w <= 0 || h <= 0) return;
    ctx.save();
    ctx.globalAlpha *= clamp(num(sticker.opacity, 1), 0, 1);
    turnAt(ctx, x + w / 2, y + h / 2, sticker.rotation);
    if (sticker.kind === 'sprite') {
      var img = sticker.__image;
      if (img) drawContain(ctx, img, x, y, w, h);
    } else {
      drawStickerPreset(ctx, sticker.preset, { x: x, y: y, w: w, h: h }, { color: sticker.color, color2: sticker.color2 });
    }
    ctx.restore();
  }

  /* ── the layer table (one order for everything) ─────────────────────────── */

  function keyOf(ref) {
    if (!ref) return '';
    if (typeof ref === 'string') return ref;
    if (ref.key) return String(ref.key);
    if (ref.kind === 'cell') return 'cell:' + ref.index;
    if (ref.kind === 'sticker' || ref.kind === 'text') return ref.kind + ':' + ref.id;
    if (ref.kind === 'emblem') return 'emblem';
    if (ref.kind === 'overlay') return 'overlay';
    return '';
  }

  function parseKey(key) {
    var k = String(key || '');
    var at = k.indexOf(':');
    if (k === 'emblem') return { kind: 'emblem' };
    if (k === 'overlay') return { kind: 'overlay' };
    if (k.indexOf('cell:') === 0) return { kind: 'cell', index: parseInt(k.slice(5), 10) || 0 };
    if (at > 0) return { kind: k.slice(0, at), id: k.slice(at + 1) };
    return null;
  }

  /** Every drawable element with its effective z, back to front. */
  function layers(spec) {
    var list = [];
    var seq = 0;
    function push(item) { item.seq = seq++; list.push(item); }
    spec.cells.forEach(function (cell, i) {
      push({ key: 'cell:' + i, kind: 'cell', index: i, z: cell.z == null ? Z.cell + i : cell.z, rotation: cell.rotation || 0, visible: true, label: '슬롯 ' + (i + 1) });
    });
    if (spec.overlay) {
      push({
        key: 'overlay', kind: 'overlay', z: spec.overlay.layer === 'above' ? Z.overlayAbove : Z.cell - 1,
        rotation: 0, visible: spec.overlay.opacity > 0, label: 'PNG 오버레이'
      });
    }
    (spec.stickers || []).forEach(function (st, i) {
      push({
        key: 'sticker:' + st.id, kind: 'sticker', id: st.id,
        z: st.z == null ? Z.sticker + i : st.z, rotation: st.rotation || 0,
        visible: st.visible !== false, label: st.label || (st.kind === 'sprite' ? '스프라이트' : '스트라이프')
      });
    });
    if (spec.emblem) {
      push({
        key: 'emblem', kind: 'emblem', z: spec.emblem.z == null ? Z.emblem : spec.emblem.z,
        rotation: spec.emblem.rotation || 0, visible: spec.emblem.enabled !== false, label: '엠블럼'
      });
    }
    spec.texts.forEach(function (t, i) {
      push({
        key: 'text:' + t.id, kind: 'text', id: t.id,
        z: t.z == null ? Z.text + i : t.z, rotation: t.rotation || 0,
        visible: t.visible !== false, label: applyVars(t.text, {}) || '텍스트 ' + (i + 1)
      });
    });
    list.sort(function (a, b) { return a.z - b.z || a.seq - b.seq; });
    return list;
  }

  /** The paint order: the layer table minus hidden elements, overlay inline. */
  function paintOrder(spec) {
    var list = layers(spec).filter(function (item) { return item.kind !== 'overlay' && item.visible; });
    if (spec.overlay && spec.overlay.layer === 'above' && spec.overlay.opacity > 0) {
      list.push({ key: 'overlay', kind: 'overlay', z: Z.overlayAbove, seq: 10.5, label: 'PNG 오버레이' });
      list.sort(function (a, b) { return a.z - b.z || a.seq - b.seq; });
    }
    return list;
  }

  /** Pulls an element one step forward (+1) or back (-1) in the shared order. */
  function moveLayer(spec, ref, dir) {
    var key = keyOf(ref);
    var list = layers(spec).filter(function (item) { return item.kind !== 'overlay'; });
    var at = -1;
    for (var i = 0; i < list.length; i++) if (list[i].key === key) { at = i; break; }
    if (at < 0) return spec;
    var to = at + (dir >= 0 ? 1 : -1);
    if (to < 0 || to >= list.length) return spec;
    var self = list[at];
    var other = list[to];
    var next = clone(spec);
    var zSelf = other.z;
    var zOther = self.z;
    if (zSelf === zOther) {
      /* two elements sharing a z fall back to insertion order, so make the
         step explicit instead of silently doing nothing. */
      if (dir >= 0) { zSelf = self.z + 1; zOther = self.z; } else { zSelf = self.z; zOther = self.z + 1; }
    }
    setZ(next, self.key, zSelf);
    setZ(next, other.key, zOther);
    return touch(next, {});
  }

  function setZ(spec, ref, z) {
    var key = keyOf(ref);
    var at = key.indexOf(':');
    if (key === 'emblem') { spec.emblem.z = z; return spec; }
    if (key.indexOf('cell:') === 0) { spec.cells[parseInt(key.slice(5), 10)].z = z; return spec; }
    if (at > 0) {
      var id = key.slice(at + 1);
      if (key.indexOf('text:') === 0) {
        spec.texts.forEach(function (t) { if (t.id === id) t.z = z; });
      } else if (key.indexOf('sticker:') === 0) {
        (spec.stickers || []).forEach(function (s) { if (s.id === id) s.z = z; });
      }
    }
    return spec;
  }

  /* 1-based position in the visible stack, for the editor's layer list. */
  function depthOf(spec, ref) {
    var key = keyOf(ref);
    var list = layers(spec).filter(function (item) { return item.kind !== 'overlay'; });
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return { index: i, count: list.length };
    return null;
  }

  /* ── geometry: one box for drawing, hitting and aligning ────────────────── */

  function boxOf(x, y, w, h, deg) {
    var cx = x + w / 2;
    var cy = y + h / 2;
    var r = deg || 0;
    var cos = Math.abs(Math.cos(r * Math.PI / 180));
    var sin = Math.abs(Math.sin(r * Math.PI / 180));
    var aw = w * cos + h * sin;
    var ah = w * sin + h * cos;
    return { x: cx - aw / 2, y: cy - ah / 2, w: aw, h: ah, cx: cx, cy: cy, box: { x: x, y: y, w: w, h: h }, rotation: r };
  }

  function findSticker(spec, id) {
    var list = spec.stickers || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /**
   * The element's own box plus the axis-aligned box it covers. `measure(text)`
   * lets the editor hand in the real width of a rendered row; without it the
   * engine falls back to a readable estimate.
   */
  function boundsOf(spec, ref, measure) {
    if (!spec || !ref) return null;
    if (ref.kind === 'cell') {
      var c = spec.cells[ref.index];
      if (!c) return null;
      return boxOf(c.x, c.y, c.w, c.h, c.rotation);
    }
    if (ref.kind === 'sticker') {
      var st = findSticker(spec, ref.id);
      if (!st) return null;
      return boxOf(st.x, st.y, st.w, st.h, st.rotation);
    }
    if (ref.kind === 'emblem') {
      var e = spec.emblem;
      var mw = Math.min(e.maxW, e.maxH * 3.4);
      var left = e.align === 'left' ? e.x : e.align === 'right' ? e.x - mw : e.x - mw / 2;
      return boxOf(left, e.y - e.maxH / 2, mw, e.maxH, e.rotation);
    }
    if (ref.kind === 'text') {
      var t = null;
      for (var i = 0; i < spec.texts.length; i++) if (spec.texts[i].id === ref.id) t = spec.texts[i];
      if (!t) return null;
      var content = applyVars(t.text, ref.vars || {});
      var width = typeof measure === 'function' ? measure(t, content) : Math.max(12, content.length * t.size * 0.56);
      var bx = t.align === 'left' ? t.x : t.align === 'right' ? t.x - width : t.x - width / 2;
      return boxOf(bx, t.y - t.size * 0.82, width, t.size * 1.1, t.rotation);
    }
    return null;
  }

  function translate(spec, ref, dx, dy) {
    var next = clone(spec);
    if (ref.kind === 'cell') {
      var c = next.cells[ref.index];
      if (!c) return next;
      c.x = Math.round(c.x + dx); c.y = Math.round(c.y + dy);
    } else if (ref.kind === 'sticker') {
      var st = findSticker(next, ref.id);
      if (!st) return next;
      st.x = Math.round(st.x + dx); st.y = Math.round(st.y + dy);
    } else if (ref.kind === 'emblem') {
      next.emblem.x = Math.round(next.emblem.x + dx);
      next.emblem.y = Math.round(next.emblem.y + dy);
    } else if (ref.kind === 'text') {
      next.texts = next.texts.map(function (t) {
        return t.id === ref.id ? Object.assign({}, t, { x: Math.round(t.x + dx), y: Math.round(t.y + dy) }) : t;
      });
    }
    return next;
  }

  /** 하늘/가로 중앙·좌·우·위·아래 맞춤, computed from the element's covered box. */
  function alignLayer(spec, ref, mode, box) {
    var b = box || boundsOf(spec, ref);
    if (!b) return spec;
    var W = spec.canvas.width;
    var H = spec.canvas.height;
    var dx = 0;
    var dy = 0;
    if (mode === 'h-center' || mode === 'center-x') dx = W / 2 - (b.x + b.w / 2);
    else if (mode === 'left') dx = -b.x;
    else if (mode === 'right') dx = W - (b.x + b.w);
    else if (mode === 'v-center' || mode === 'center-y') dy = H / 2 - (b.y + b.h / 2);
    else if (mode === 'top') dy = -b.y;
    else if (mode === 'bottom') dy = H - (b.y + b.h);
    var next = translate(spec, ref, dx, dy);
    return touch(next, {});
  }

  /** Is `pt` (design space) inside the element, counting its rotation? */
  function hitLayer(spec, ref, pt, measure) {
    var b = boundsOf(spec, ref, measure);
    if (!b) return false;
    var px = pt.x;
    var py = pt.y;
    if (b.rotation) {
      var r = -b.rotation * Math.PI / 180;
      var dx = px - b.cx;
      var dy = py - b.cy;
      px = b.cx + dx * Math.cos(r) - dy * Math.sin(r);
      py = b.cy + dx * Math.sin(r) + dy * Math.cos(r);
    }
    var bx = b.box;
    return px >= bx.x && px <= bx.x + bx.w && py >= bx.y && py <= bx.y + bx.h;
  }

  /* ── asynchronous assets ────────────────────────────────────────────────── */

  var assetListeners = [];

  function onAssetsLoaded(fn) {
    if (typeof fn !== 'function') return function () {};
    assetListeners.push(fn);
    return function () {
      assetListeners = assetListeners.filter(function (item) { return item !== fn; });
    };
  }

  function notifyAssets() {
    assetListeners.slice().forEach(function (fn) {
      try { fn(); } catch (e) { /* one listener must not stop the others */ }
    });
  }

  function loadImage(url) {
    return new Promise(function (resolve) {
      if (!root.Image || !url) { resolve(null); return; }
      var img = new root.Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = url;
    });
  }

  /**
   * Loads every image a document points at — the PNG overlay, the background
   * photograph and each sprite — into the document itself, so paint() can stay
   * synchronous. Listeners registered with onAssetsLoaded() are told once at
   * least one image arrived, which is how all three apps re-render a plate
   * without ever leaving it blank.
   */
  function primeAssets(spec) {
    if (!spec) return Promise.resolve(spec);
    var jobs = [];
    if (spec.overlay && !spec.overlay.__image) {
      jobs.push(loadImage(spec.overlay.dataUrl).then(function (img) { if (img) spec.overlay.__image = img; return !!img; }));
    }
    var bg = spec.canvas && spec.canvas.backgroundImage;
    if (bg && !bg.__image) {
      jobs.push(loadImage(bg.dataUrl).then(function (img) { if (img) bg.__image = img; return !!img; }));
    }
    (spec.stickers || []).forEach(function (st) {
      if (st.kind !== 'sprite' || st.__image || !st.dataUrl) return;
      jobs.push(loadImage(st.dataUrl).then(function (img) { if (img) st.__image = img; return !!img; }));
    });
    if (!jobs.length) return Promise.resolve(spec);
    return Promise.all(jobs).then(function (loaded) {
      if (loaded.some(Boolean)) notifyAssets();
      return spec;
    });
  }

  /** The name the first three apps already call; it primes every asset now. */
  function primeOverlay(spec) { return primeAssets(spec); }

  /** paint() has no room to await, so a missing image is loaded and announced. */
  function ensureAssets(spec) {
    var missing = false;
    if (spec.overlay && !spec.overlay.__image) missing = true;
    var bg = spec.canvas && spec.canvas.backgroundImage;
    if (bg && !bg.__image) missing = true;
    (spec.stickers || []).some(function (st) {
      if (st.kind === 'sprite' && !st.__image) { missing = true; return true; }
      return false;
    });
    if (!missing) return false;
    void primeAssets(spec);
    return true;
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
    var awaiting = ensureAssets(spec);
    if (awaiting && layout.custom.onNeedAssets) layout.custom.onNeedAssets(spec);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();
    fillBackground(ctx, spec, W, H);
    drawBackgroundImage(ctx, spec, W, H);
    drawOverlay(ctx, spec, W, H, 'below');
    drawPerforation(ctx, spec, W, H, s);
    paintOrder(spec).forEach(function (item) {
      if (item.kind === 'cell') {
        var cell = spec.cells[item.index];
        var slot = slots[item.index];
        var img = slot && (slot.img || slot.image);
        if (!cell || !img) return;
        var cw = cell.w * s;
        var ch = cell.h * s;
        ctx.save();
        turnAt(ctx, (cell.x + cell.w / 2) * s, (cell.y + cell.h / 2) * s, cell.rotation);
        roundRect(ctx, cell.x * s, cell.y * s, cw, ch, cell.radius * s);
        ctx.clip();
        drawCover(ctx, img, img.width, img.height, cell.x * s, cell.y * s, cw, ch);
        ctx.restore();
      } else if (item.kind === 'overlay') {
        drawOverlay(ctx, spec, W, H, 'above');
      } else if (item.kind === 'sticker') {
        drawSticker(ctx, findSticker(spec, item.id), s);
      } else if (item.kind === 'emblem') {
        drawEmblem(ctx, spec, s);
      } else if (item.kind === 'text') {
        var one = spec.texts.filter(function (t) { return t.id === item.id; });
        var alone = Object.assign({}, spec, { texts: one });
        drawTexts(ctx, alone, fields, s);
      }
    });
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
        scale: scale,
        onNeedAssets: opts.onNeedAssets
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
        { x: pad, y: pad, w: cw, h: ch, radius: spec.cells[0].radius, rotation: spec.cells[0].rotation || 0, z: spec.cells[0].z },
        { x: pad + cw + gap, y: pad, w: cw, h: ch, radius: spec.cells[1].radius, rotation: spec.cells[1].rotation || 0, z: spec.cells[1].z },
        { x: pad, y: pad + ch + gap, w: cw, h: ch, radius: spec.cells[2].radius, rotation: spec.cells[2].rotation || 0, z: spec.cells[2].z },
        { x: pad + cw + gap, y: pad + ch + gap, w: cw, h: ch, radius: spec.cells[3].radius, rotation: spec.cells[3].rotation || 0, z: spec.cells[3].z }
      ];
    } else {
      var w = Math.floor(W - pad * 2);
      var h = Math.floor((H - pad * 2 - gap * 3) / 4);
      next.cells = [0, 1, 2, 3].map(function (i) {
        return { x: pad, y: pad + i * (h + gap), w: w, h: h, radius: spec.cells[i].radius, rotation: spec.cells[i].rotation || 0, z: spec.cells[i].z };
      });
    }
    return next;
  }

  /** A centred stripe sticker with the engine's own house colours. */
  function addSticker(spec, preset, patch) {
    var W = spec.canvas.width;
    var H = spec.canvas.height;
    var w = Math.round(W * 0.66);
    var h = Math.round(H * 0.075);
    var item = normalizeSticker(Object.assign({
      id: uid('sticker'),
      kind: 'stripe',
      preset: preset,
      x: Math.round((W - w) / 2),
      y: Math.round((H - h) / 2),
      w: w,
      h: h,
      color: '#7c5cd6',
      color2: '#ffffff',
      opacity: 0.92
    }, patch || {}), (spec.stickers || []).length, W, H);
    var next = clone(spec);
    next.stickers = (next.stickers || []).concat([item]);
    return touch(next, {});
  }

  /** An uploaded transparent PNG/SVG/WebP, contained inside its box. */
  function addSprite(spec, dataUrl, patch) {
    var W = spec.canvas.width;
    var H = spec.canvas.height;
    var w = Math.round(W * 0.34);
    var h = Math.round(H * 0.14);
    var item = normalizeSticker(Object.assign({
      id: uid('sprite'),
      kind: 'sprite',
      dataUrl: dataUrl,
      x: Math.round((W - w) / 2),
      y: Math.round((H - h) / 2),
      w: w,
      h: h,
      label: '스프라이트',
      opacity: 1
    }, patch || {}), (spec.stickers || []).length, W, H);
    if (!item) return spec;
    var next = clone(spec);
    next.stickers = (next.stickers || []).concat([item]);
    return touch(next, {});
  }

  function removeLayer(spec, ref) {
    var key = keyOf(ref);
    var next = clone(spec);
    if (key.indexOf('sticker:') === 0) {
      var id = key.slice(8);
      next.stickers = (next.stickers || []).filter(function (s) { return s.id !== id; });
    } else if (key.indexOf('text:') === 0) {
      var tid = key.slice(5);
      next.texts = next.texts.filter(function (t) { return t.id !== tid; });
    }
    return touch(next, {});
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
    var extras = (spec.stickers || []).length;
    return spec.canvas.width + '×' + spec.canvas.height + ' · ' + spec.cells.length + '컷 · ' + spec.texts.length + '텍스트'
      + (extras ? ' · ' + extras + '스티커' : '');
  }

  var api = {
    SCHEMA: SCHEMA,
    VERSION: VERSION,
    VAR_NAMES: VAR_NAMES,
    FONTS: FONTS,
    STICKER_PRESETS: STICKER_PRESETS,
    validate: validate,
    parse: function (raw) { return validate(raw); },
    clone: clone,
    touch: touch,
    uid: uid,
    serialize: serialize,
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
    paintTo: paintTo,
    primeAssets: primeAssets,
    primeOverlay: primeOverlay,
    onAssetsLoaded: onAssetsLoaded,
    stickerPresets: stickerPresets,
    drawStickerPreset: drawStickerPreset,
    layers: layers,
    paintOrder: paintOrder,
    moveLayer: moveLayer,
    setZ: setZ,
    depthOf: depthOf,
    boundsOf: boundsOf,
    hitLayer: hitLayer,
    alignLayer: alignLayer,
    translate: translate,
    resetLayers: function (spec) {
      var next = clone(spec);
      next.cells.forEach(function (c) { c.z = undefined; });
      next.texts.forEach(function (t) { t.z = undefined; });
      (next.stickers || []).forEach(function (s) { s.z = undefined; });
      if (next.emblem) next.emblem.z = undefined;
      return touch(next, {});
    },
    addSticker: addSticker,
    addSprite: addSprite,
    removeLayer: removeLayer,
    alignCells: alignCells,
    summary: summary,
    store: store,
    helpers: {
      roundRect: roundRect,
      drawCover: drawCover,
      drawContain: drawContain,
      fillBackground: fillBackground,
      turnAt: turnAt,
      boxOf: boxOf
    }
  };

  root.ShutterFrame = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
