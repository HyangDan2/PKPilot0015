import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { Icon } from './Icons';
import type { FrameCell } from '../spec/shutterframe';

export interface SlotModalProps {
  open: boolean;
  index: number;
  cell: FrameCell | null;
  /** The photograph in this cut, if there is one. */
  photoUrl?: string;
  photoName?: string;
  onClose: () => void;
  onChoosePhoto: () => void;
  onClearPhoto: () => void;
  /** Live edits: size, angle, corner — each one is saved like any other edit. */
  onChangeCell: (patch: Partial<FrameCell>) => void;
}

const MIN = 16;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * The one sheet a cut opens on a double click or double tap: its photograph
 * (add, replace, remove), its printed size and its angle. It exists because the
 * compact bar over the plate has room for one gesture at a time, and a cut has
 * three things to settle at once.
 */
export function SlotModal(props: SlotModalProps) {
  const { t } = useI18n();
  const box = useRef<HTMLDivElement | null>(null);
  const base = useRef<{ w: number; h: number } | null>(null);
  const [lock, setLock] = useState(true);

  useEffect(() => {
    if (!props.open) return;
    const focus = box.current?.querySelector<HTMLElement>('button');
    focus?.focus();
  }, [props.open]);

  /* A sheet remembers the size it opened at: the scale slider and the ratio
     lock measure against that, not against the value the last edit left. */
  useEffect(() => {
    if (!props.open) return;
    base.current = props.cell ? { w: props.cell.w, h: props.cell.h } : null;
    setLock(true);
    /* only a new cut or a reopened sheet resets the base */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, props.index]);

  if (!props.open || !props.cell) return null;

  const cell = props.cell;
  const number = String(props.index + 1).padStart(2, '0');
  const baseW = Math.max(MIN, base.current?.w ?? cell.w);
  const baseH = Math.max(MIN, base.current?.h ?? cell.h);
  const shownScale = clamp(Math.round((cell.w / baseW) * 100), 20, 300);

  const resize = (w: number, h: number) => props.onChangeCell({ w: Math.max(MIN, Math.round(w)), h: Math.max(MIN, Math.round(h)) });

  const onWidth = (value: number) => {
    const w = Math.max(MIN, value);
    resize(w, lock ? (w * baseH) / baseW : cell.h);
  };

  const onHeight = (value: number) => {
    const h = Math.max(MIN, value);
    resize(lock ? (h * baseW) / baseH : cell.w, h);
  };

  const onScale = (pct: number) => {
    resize((baseW * pct) / 100, (baseH * pct) / 100);
  };

  return (
    <div className="modal-backdrop" data-testid="slot-sheet" onClick={props.onClose}>
      <div
        ref={box}
        className="modal slot-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('slot.title', { n: number })}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <p className="drawer-kicker">{t('slot.kicker')}</p>
            <h2 className="modal-title">{t('slot.title', { n: number })}</h2>
          </div>
          <button type="button" className="icon-btn" aria-label={t('slot.close')} title={t('slot.close')} onClick={props.onClose}>
            <Icon name="close" size={17} />
          </button>
        </div>

        <div className="modal-body">
          <p className="drawer-sub slot-sub">{t('slot.sub')}</p>

          {props.photoUrl ? (
            <div className="slot-photo" data-filled="true">
              <img src={props.photoUrl} alt={t('slot.preview', { n: number })} draggable={false} />
              <div className="slot-photo-actions">
                <button type="button" className="btn ghost small" data-testid="slot-choose" onClick={props.onChoosePhoto}>
                  <Icon name="image" size={13} /> {t('slot.replace')}
                </button>
                <button type="button" className="btn ghost small danger" data-testid="slot-clear" onClick={props.onClearPhoto}>
                  <Icon name="trash" size={13} /> {t('slot.clear')}
                </button>
              </div>
              {props.photoName && <p className="slot-photo-name">{props.photoName}</p>}
            </div>
          ) : (
            <button type="button" className="drop-zone slot-empty" data-testid="slot-empty" onClick={props.onChoosePhoto}>
              <Icon name="image" size={22} />
              <span>{t('slot.empty')}</span>
              <small>{t('slot.emptyHint')}</small>
            </button>
          )}

          <section className="slot-section">
            <h3 className="rail-title">{t('slot.size')}</h3>
            <div className="pair">
              <label className="num-field">
                <span>{t('slot.width')}</span>
                <input type="number" data-testid="slot-width" min={MIN} max={4000} value={Math.round(cell.w)} onChange={(event) => onWidth(Number(event.target.value))} />
              </label>
              <label className="num-field">
                <span>{t('slot.height')}</span>
                <input type="number" data-testid="slot-height" min={MIN} max={4000} value={Math.round(cell.h)} onChange={(event) => onHeight(Number(event.target.value))} />
              </label>
            </div>
            <div className="slot-row">
              <button
                type="button"
                className={`chip${lock ? ' on' : ''}`}
                data-testid="slot-lock"
                aria-pressed={lock}
                onClick={() => setLock((value) => !value)}
              >
                <Icon name={lock ? 'link' : 'close'} size={12} /> {t('slot.lockRatio')}
              </button>
              <span className="slot-readout">{shownScale}%</span>
            </div>
            <input
              className="slot-range"
              type="range"
              data-testid="slot-scale"
              min={20}
              max={300}
              step={1}
              value={shownScale}
              aria-label={t('slot.size')}
              onChange={(event) => onScale(Number(event.target.value))}
            />
          </section>

          <section className="slot-section">
            <h3 className="rail-title">{t('slot.rotation')} <small>{Math.round(cell.rotation ?? 0)}°</small></h3>
            <div className="slot-row">
              <input
                className="slot-range"
                type="range"
                data-testid="slot-rotation"
                min={-180}
                max={180}
                step={1}
                value={Math.round(cell.rotation ?? 0)}
                aria-label={t('slot.rotation')}
                onChange={(event) => props.onChangeCell({ rotation: Number(event.target.value) })}
              />
              <label className="num-field compact unit">
                <input
                  type="number"
                  data-testid="slot-rotation-number"
                  min={-180}
                  max={180}
                  value={Math.round(cell.rotation ?? 0)}
                  onChange={(event) => props.onChangeCell({ rotation: clamp(Number(event.target.value), -180, 180) })}
                />
                <span>°</span>
              </label>
            </div>
            <div className="slot-row">
              <label className="num-field compact">
                <span>{t('slot.corner')}</span>
                <input
                  type="number"
                  data-testid="slot-corner"
                  min={0}
                  max={240}
                  value={Math.round(cell.radius)}
                  onChange={(event) => props.onChangeCell({ radius: clamp(Number(event.target.value), 0, 240) })}
                />
              </label>
              <span className="slot-keys">{t('slot.keys')}</span>
            </div>
          </section>
        </div>

        <div className="modal-foot">
          <button type="button" className="btn primary small" data-testid="slot-done" onClick={props.onClose}>{t('slot.done')}</button>
        </div>
      </div>
    </div>
  );
}
