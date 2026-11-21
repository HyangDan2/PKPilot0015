import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { Icon } from './Icons';
import { backgroundOutputSize, cropToDataUrl, loadImage } from '../editor/images';
import { clamp } from '../editor/geometry';

export interface BackgroundCropModalProps {
  open: boolean;
  frameW: number;
  frameH: number;
  /** The photograph already in the frame, if any. */
  current?: string;
  onClose: () => void;
  onApply: (dataUrl: string) => void;
  onRemove: () => void;
}

/**
 * Load one photograph, drag and zoom the area that should fill the frame, and
 * apply. The crop box is locked to the plate's own W:H, so what is marked is
 * exactly what the plate will print. EXIF stays the host apps' job.
 */
export function BackgroundCropModal(props: BackgroundCropModalProps) {
  const { t } = useI18n();
  const host = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState({ w: 0, h: 0 });
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const file = useRef<HTMLInputElement | null>(null);
  const pins = useRef<Map<number, { x: number; y: number }>>(new Map());
  const dragFrom = useRef<{ id: number; x: number; y: number; ox: number; oy: number } | null>(null);
  const pinchFrom = useRef<{ dist: number; zoom: number } | null>(null);

  useLayoutEffect(() => {
    if (!props.open) return;
    const el = host.current;
    if (!el) return;
    const read = () => {
      const rect = el.getBoundingClientRect();
      setView({ w: Math.max(120, Math.round(rect.width)), h: Math.max(120, Math.round(rect.height)) });
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [props.open]);

  /* the crop box keeps the plate's aspect, inside the measured viewport */
  const boxW = Math.max(80, view.w - 24);
  let cw = boxW;
  let ch = cw * (props.frameH / props.frameW);
  if (ch > view.h - 24) {
    ch = Math.max(80, view.h - 24);
    cw = ch * (props.frameW / props.frameH);
  }

  const base = img ? Math.max(cw / img.naturalWidth, ch / img.naturalHeight) : 1;
  const drawW = img ? img.naturalWidth * base * zoom : 0;
  const drawH = img ? img.naturalHeight * base * zoom : 0;

  const clampOffset = useCallback((x: number, y: number, z: number) => {
    if (!img) return { x: 0, y: 0 };
    const dw = img.naturalWidth * base * z;
    const dh = img.naturalHeight * base * z;
    return { x: clamp(x, Math.min(0, cw - dw), 0), y: clamp(y, Math.min(0, ch - dh), 0) };
  }, [img, base, cw, ch]);

  useEffect(() => {
    if (!props.open) {
      setImg(null);
      setName('');
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      return;
    }
    if (props.current && !img) {
      loadImage(props.current)
        .then((loaded) => { setImg(loaded); setName(t('crop.current')); })
        .catch(() => setImg(null));
    }
  }, [props.open, props.current, img, t]);

  useEffect(() => {
    if (!img || !cw) return;
    setZoom(1);
    setOffset({
      x: (cw - img.naturalWidth * base) / 2,
      y: (ch - img.naturalHeight * base) / 2,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, cw, ch]);

  const pick = async (picked: File) => {
    setBusy(true);
    try {
      const url = URL.createObjectURL(picked);
      const loaded = await loadImage(url);
      setImg(loaded);
      setName(picked.name);
    } catch {
      setImg(null);
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    if (!img) return;
    const k = base * zoom;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const sx = clamp(-offset.x / k, 0, Math.max(0, iw - 1));
    const sy = clamp(-offset.y / k, 0, Math.max(0, ih - 1));
    const sw = Math.min(cw / k, iw - sx);
    const sh = Math.min(ch / k, ih - sy);
    const out = backgroundOutputSize(props.frameW, props.frameH);
    const url = cropToDataUrl(img, { x: sx, y: sy, w: sw, h: sh }, out.w, out.h);
    if (url) props.onApply(url);
  };

  const zoomTo = (next: number) => {
    const z = clamp(next, 1, 5);
    setZoom(z);
    const ratio = z / zoom;
    setOffset((prev) => clampOffset(cw / 2 - (cw / 2 - prev.x) * ratio, ch / 2 - (ch / 2 - prev.y) * ratio, z));
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!img) return;
    try {
      (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
    } catch {
      /* keep dragging even if the pointer cannot be captured */
    }
    pins.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pins.current.size === 2) {
      const [a, b] = Array.from(pins.current.values());
      pinchFrom.current = { dist: Math.hypot(b.x - a.x, b.y - a.y), zoom };
      dragFrom.current = null;
      return;
    }
    dragFrom.current = { id: event.pointerId, x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pins.current.has(event.pointerId)) return;
    pins.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pins.current.size === 2 && pinchFrom.current) {
      const [a, b] = Array.from(pins.current.values());
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const next = clamp((dist / Math.max(1, pinchFrom.current.dist)) * pinchFrom.current.zoom, 1, 5);
      setZoom(next);
      setOffset((prev) => clampOffset(prev.x, prev.y, next));
      return;
    }
    const from = dragFrom.current;
    if (!from || from.id !== event.pointerId) return;
    setOffset(clampOffset(from.ox + (event.clientX - from.x), from.oy + (event.clientY - from.y), zoom));
  };

  const endPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    pins.current.delete(event.pointerId);
    if (pins.current.size < 2) pinchFrom.current = null;
    if (dragFrom.current?.id === event.pointerId) dragFrom.current = null;
  };

  if (!props.open) return null;

  return (
    <div className="modal-backdrop" data-testid="bg-crop-modal" id="bg-crop-modal" onClick={props.onClose}>
      <div className="modal crop-modal" role="dialog" aria-modal="true" aria-label={t('crop.title')} onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <p className="drawer-kicker">{t('crop.kicker')}</p>
            <h2 className="modal-title">{t('crop.title')}</h2>
          </div>
          <button type="button" className="icon-btn" aria-label={t('drawer.close', { name: t('crop.title') })} onClick={props.onClose}>
            <Icon name="close" size={17} />
          </button>
        </div>

        <div className="modal-body">
          <p className="drawer-sub">{t('crop.sub', { w: props.frameW, h: props.frameH })}</p>
          <div className="crop-host" ref={host}>
            {!img && (
              <button type="button" className="drop-zone tall" onClick={() => file.current?.click()}>
                <Icon name="upload" size={22} />
                <span>{t('crop.choose')}</span>
                <small>{t('crop.chooseHint')}</small>
              </button>
            )}
            {img && (
              <div
                className="crop-stage"
                style={{ width: cw, height: ch, touchAction: 'none' }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endPointer}
                onPointerCancel={endPointer}
                onWheel={(event) => { zoomTo(zoom * (event.deltaY < 0 ? 1.08 : 0.93)); }}
              >
                <img src={img.src} alt="" draggable={false} style={{ width: drawW, height: drawH, left: offset.x, top: offset.y }} />
                <div className="crop-grid" aria-hidden="true"><span /><span /><span /><span /></div>
                <div className="crop-frame" aria-hidden="true" />
              </div>
            )}
          </div>
          {img && (
            <div className="crop-controls">
              <span className="crop-name">{name || t('crop.current')}</span>
              <button type="button" className="chip" onClick={() => zoomTo(zoom - 0.15)} aria-label={t('crop.zoomOut')}>−</button>
              <input type="range" min={1} max={5} step={0.01} value={zoom} onChange={(event) => zoomTo(Number(event.target.value))} aria-label={t('crop.zoom')} />
              <button type="button" className="chip" onClick={() => zoomTo(zoom + 0.15)} aria-label={t('crop.zoomIn')}>+</button>
              <span className="crop-readout">{Math.round(zoom * 100)}%</span>
            </div>
          )}
          <p className="drawer-note">{t('crop.note')}</p>
        </div>

        <div className="modal-foot">
          {props.current && (
            <button type="button" className="btn ghost danger" onClick={props.onRemove} id="bg-remove">{t('crop.remove')}</button>
          )}
          <button type="button" className="btn ghost" onClick={() => file.current?.click()}>
            <Icon name="image" size={14} />{img ? t('crop.other') : t('crop.choose')}
          </button>
          <button type="button" className="btn primary" onClick={apply} disabled={!img || busy} id="bg-apply" data-testid="bg-apply">
            <Icon name="check" size={14} />{t('crop.apply')}
          </button>
        </div>

        <input
          ref={file}
          id="bg-file"
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const picked = event.target.files?.[0];
            if (picked) void pick(picked);
            event.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
