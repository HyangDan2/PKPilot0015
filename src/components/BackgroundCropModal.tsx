import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { Icon } from './Icons';
import { backgroundOutputSize, cropToDataUrl, loadImage } from '../editor/images';
import {
  CROP_CORNERS,
  centerCrop,
  containBox,
  fitHeight,
  fitWidth,
  frameRatio,
  moveCrop,
  resizeCrop,
  toSourceRect,
  type Area,
  type CropCorner,
  type CropRect,
} from '../editor/cropbox';

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

type BoxDrag = { id: number; x: number; y: number; rect: CropRect };
type CornerDrag = BoxDrag & { corner: CropCorner };

/**
 * Load one photograph whole, move and size a window that is locked to the
 * plate's own W:H, and apply. Everything outside the window dims, so what will
 * be printed is legible at a glance. EXIF stays the host apps' job.
 */
export function BackgroundCropModal(props: BackgroundCropModalProps) {
  const { t } = useI18n();
  const host = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<Area>({ w: 0, h: 0 });
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [rect, setRect] = useState<CropRect>({ x: 0, y: 0, w: 0, h: 0 });
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const file = useRef<HTMLInputElement | null>(null);
  const drag = useRef<BoxDrag | null>(null);
  const grip = useRef<CornerDrag | null>(null);
  const lastPhoto = useRef<{ src: string; w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    if (!props.open) return;
    const el = host.current;
    if (!el) return;
    const read = () => {
      const box = el.getBoundingClientRect();
      setView({ w: Math.max(0, Math.round(box.width)), h: Math.max(0, Math.round(box.height)) });
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [props.open]);

  const ratio = frameRatio(props.frameW, props.frameH);
  const natural: Area = { w: img?.naturalWidth ?? 0, h: img?.naturalHeight ?? 0 };
  const drawn = containBox(natural, view);

  /* a new photograph, or the viewport changing, keeps the marking sensible */
  useEffect(() => {
    if (!img || !drawn.w || !drawn.h) return;
    const prior = lastPhoto.current;
    if (!prior || prior.src !== img.src) {
      setRect(fitWidth(drawn, ratio));
    } else if (Math.abs(prior.w - drawn.w) > 0.5 || Math.abs(prior.h - drawn.h) > 0.5) {
      const kx = drawn.w / Math.max(1, prior.w);
      const ky = drawn.h / Math.max(1, prior.h);
      setRect((current) => ({ x: current.x * kx, y: current.y * ky, w: current.w * kx, h: current.h * ky }));
    }
    lastPhoto.current = { src: img.src, w: drawn.w, h: drawn.h };
  }, [img, drawn.w, drawn.h, ratio]);

  useEffect(() => {
    if (!props.open) {
      setImg(null);
      setName('');
      setRect({ x: 0, y: 0, w: 0, h: 0 });
      lastPhoto.current = null;
      return;
    }
    if (props.current && !img) {
      loadImage(props.current)
        .then((loaded) => { setImg(loaded); setName(t('crop.current')); })
        .catch(() => setImg(null));
    }
  }, [props.open, props.current, img, t]);

  const pick = async (picked: File) => {
    setBusy(true);
    try {
      const loaded = await loadImage(URL.createObjectURL(picked));
      lastPhoto.current = null;
      setImg(loaded);
      setName(picked.name);
    } catch {
      setImg(null);
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    if (!img || !drawn.w || !drawn.h) return;
    const source = toSourceRect(rect, drawn, natural);
    const out = backgroundOutputSize(props.frameW, props.frameH);
    const url = cropToDataUrl(img, source, out.w, out.h);
    if (url) props.onApply(url);
  };

  const capture = (element: Element, pointerId: number) => {
    try {
      element.setPointerCapture(pointerId);
    } catch {
      /* a pointer that cannot be captured still drags */
    }
  };

  const startBox = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!img) return;
    event.preventDefault();
    event.stopPropagation();
    capture(event.currentTarget, event.pointerId);
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, rect };
  };

  const moveBox = (event: React.PointerEvent<HTMLDivElement>) => {
    const from = drag.current;
    if (!from || from.id !== event.pointerId) return;
    /* always from the rect the drag began on — never accumulating per frame */
    setRect(moveCrop(from.rect, event.clientX - from.x, event.clientY - from.y, drawn));
  };

  const startGrip = (corner: CropCorner) => (event: React.PointerEvent<HTMLSpanElement>) => {
    if (!img) return;
    event.preventDefault();
    event.stopPropagation();
    capture(event.currentTarget, event.pointerId);
    grip.current = { id: event.pointerId, corner, x: event.clientX, y: event.clientY, rect };
  };

  const moveGrip = (event: React.PointerEvent<HTMLSpanElement>) => {
    const from = grip.current;
    if (!from || from.id !== event.pointerId) return;
    setRect(resizeCrop(from.rect, from.corner, event.clientX - from.x, event.clientY - from.y, drawn, ratio));
  };

  const endDrag = useCallback((event: React.PointerEvent) => {
    if (drag.current?.id === event.pointerId) drag.current = null;
    if (grip.current?.id === event.pointerId) grip.current = null;
  }, []);

  if (!props.open) return null;

  const fits = [
    { key: 'crop-fit-height', label: t('crop.fitHeight'), icon: 'vCenter', run: () => setRect(fitHeight(drawn, ratio)) },
    { key: 'crop-fit-width', label: t('crop.fitWidth'), icon: 'hCenter', run: () => setRect(fitWidth(drawn, ratio)) },
    { key: 'crop-center', label: t('crop.center'), icon: 'target', run: () => setRect((current) => centerCrop(current, drawn)) },
  ];

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
          <div className="crop-topline">
            <span className="drawer-sub">{t('crop.sub', { w: props.frameW, h: props.frameH })}</span>
            {img && <span className="crop-name">{name || t('crop.current')}</span>}
          </div>

          <div className="crop-host" ref={host} data-testid="crop-host">
            {!img && (
              <button type="button" className="drop-zone tall" onClick={() => file.current?.click()}>
                <Icon name="upload" size={22} />
                <span>{t('crop.choose')}</span>
                <small>{t('crop.chooseHint')}</small>
              </button>
            )}
            {img && drawn.w > 0 && (
              <div className="crop-stage" style={{ width: drawn.w, height: drawn.h }} data-testid="crop-stage">
                <img className="crop-photo" src={img.src} alt="" draggable={false} />
                <div className="crop-clip" aria-hidden="true">
                  <div
                    className="crop-veil"
                    style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
                    data-testid="crop-veil"
                  />
                </div>
                <div
                  className="crop-box"
                  style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
                  data-testid="crop-box"
                  onPointerDown={startBox}
                  onPointerMove={moveBox}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                >
                  <div className="crop-grid" aria-hidden="true"><span /><span /><span /><span /></div>
                  {CROP_CORNERS.map((corner) => (
                    <span
                      key={corner}
                      className={`crop-handle ${corner}`}
                      data-testid={`crop-handle-${corner}`}
                      onPointerDown={startGrip(corner)}
                      onPointerMove={moveGrip}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {img && (
            <div className="crop-controls" role="group" aria-label={t('crop.fits')}>
              <span className="crop-readout" data-testid="crop-readout">
                {t('crop.size', {
                  w: Math.round((rect.w / Math.max(1, drawn.w)) * 100),
                  h: Math.round((rect.h / Math.max(1, drawn.h)) * 100),
                })}
              </span>
              {fits.map((fit) => (
                <button key={fit.key} type="button" className="chip crop-fit" data-testid={fit.key} onClick={fit.run}>
                  <Icon name={fit.icon} size={13} />{fit.label}
                </button>
              ))}
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
