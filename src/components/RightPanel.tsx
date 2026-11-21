import { useRef } from 'react';
import { sf, type FrameAlign, type FrameFamily, type ShutterFrameSpec } from '../spec/shutterframe';
import { Icon } from './Icons';
import { Drawer } from './Drawer';
import { useI18n } from '../i18n';
import type { Selection } from '../editor/selection';

export interface RightDrawerProps {
  open: boolean;
  spec: ShutterFrameSpec;
  selection: Selection;
  onClose: () => void;
  onChange: (next: ShutterFrameSpec) => void;
  onOverlayFile: (file: File) => void;
  onRemoveOverlay: () => void;
  onSlotFile: (index: number, file: File) => void;
  onBackground: () => void;
  onRemoveBackground: () => void;
}

const CANVAS_PRESETS = [
  { id: 'strip', label: '1×4 · 600×1800', w: 600, h: 1800 },
  { id: 'grid', label: '2×2 · 1200×1600', w: 1200, h: 1600 },
  { id: 'portrait', label: '3:4 · 1200×1600', w: 1200, h: 1600 },
  { id: 'square', label: '1:1 · 1200×1200', w: 1200, h: 1200 },
];

const VARS = ['date', 'camera', 'title', 'caption', 'film', 'lens', 'shutter', 'iso', 'aperture'];

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}{hint && <small>{hint}</small>}</span>
      {children}
    </label>
  );
}

function NumField({ label, value, min, max, step, onChange }: {
  label: string; value: number; min?: number; max?: number; step?: number; onChange: (value: number) => void;
}) {
  return (
    <label className="num-field">
      <span>{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

/** The right drawer: the selected element first, then the whole frame. */
export function RightDrawer(props: RightDrawerProps) {
  const { t } = useI18n();
  return (
    <Drawer
      side="right"
      open={props.open}
      testId="drawer-right"
      title={t('dock.props')}
      kicker={t('drawer.props.kicker')}
      sub={t('drawer.props.sub')}
      closeLabel={t('drawer.close', { name: t('dock.props') })}
      onClose={props.onClose}
      footer={<span>{t('props.foot')}</span>}
    >
      <PropertiesBody {...props} />
    </Drawer>
  );
}

function PropertiesBody(props: RightDrawerProps) {
  const { t } = useI18n();
  const { spec, selection } = props;
  const overlayInput = useRef<HTMLInputElement | null>(null);
  const slotInput = useRef<HTMLInputElement | null>(null);
  const slotIndex = useRef(0);
  const patch = (next: Partial<ShutterFrameSpec>) => props.onChange(sf().touch(spec, next));

  const setCanvasSize = (w: number, h: number) => {
    const nx = Math.max(240, Math.round(w));
    const ny = Math.max(240, Math.round(h));
    const kx = nx / spec.canvas.width;
    const ky = ny / spec.canvas.height;
    const next = sf().clone(spec);
    next.canvas.width = nx;
    next.canvas.height = ny;
    next.cells = next.cells.map((cell) => ({
      ...cell,
      x: Math.round(cell.x * kx), y: Math.round(cell.y * ky),
      w: Math.round(cell.w * kx), h: Math.round(cell.h * ky),
    }));
    next.texts = next.texts.map((item) => ({ ...item, x: Math.round(item.x * kx), y: Math.round(item.y * ky), size: Math.round(item.size * Math.min(kx, ky)) }));
    next.emblem = { ...next.emblem, x: Math.round(next.emblem.x * kx), y: Math.round(next.emblem.y * ky) };
    props.onChange(sf().touch(next, {}));
  };

  const selectionSections = (
    <>
      {selection?.kind === 'cell' && (() => {
        const index = selection.index;
        const cell = spec.cells[index];
        if (!cell) return null;
        const update = (patchCell: Partial<typeof cell>) => {
          const next = sf().clone(spec);
          next.cells[index] = { ...next.cells[index], ...patchCell };
          props.onChange(sf().touch(next, {}));
        };
        return (
          <section className="rail-section">
            <h3 className="rail-title">{t('props.slot', { n: String(index + 1).padStart(2, '0') })} <small>{t('props.cellProps')}</small></h3>
            <div className="pair">
              <NumField label="X" value={cell.x} onChange={(v) => update({ x: v })} />
              <NumField label="Y" value={cell.y} onChange={(v) => update({ y: v })} />
            </div>
            <div className="pair">
              <NumField label="W" value={cell.w} min={16} onChange={(v) => update({ w: v })} />
              <NumField label="H" value={cell.h} min={16} onChange={(v) => update({ h: v })} />
            </div>
            <div className="pair">
              <NumField label={t('props.corner')} value={cell.radius} min={0} max={200} onChange={(v) => update({ radius: v })} />
              <NumField label={t('props.rotation')} value={cell.rotation ?? 0} min={-180} max={180} onChange={(v) => update({ rotation: v })} />
            </div>
            <div className="preset-grid">
              <button type="button" className="chip" onClick={() => {
                const margin = Math.round(spec.canvas.width * 0.06);
                const gutter = Math.round(spec.canvas.width * 0.03);
                props.onChange(sf().alignCells(spec, '1x4', margin, gutter));
              }}>{t('props.align14')}</button>
              <button type="button" className="chip" onClick={() => {
                const margin = Math.round(spec.canvas.width * 0.05);
                const gutter = Math.round(spec.canvas.width * 0.022);
                props.onChange(sf().alignCells(spec, '2x2', margin, gutter));
              }}>{t('props.align22')}</button>
            </div>
            <button type="button" className="btn ghost small" onClick={() => { slotIndex.current = index; slotInput.current?.click(); }}>
              <Icon name="image" size={13} /> {t('props.putPhoto')}
            </button>
          </section>
        );
      })()}

      {selection?.kind === 'text' && (() => {
        const item = spec.texts.find((item) => item.id === selection.id);
        if (!item) return null;
        const update = (p: Partial<typeof item>) => {
          const next = sf().clone(spec);
          next.texts = next.texts.map((row) => (row.id === item.id ? { ...row, ...p } : row));
          props.onChange(sf().touch(next, {}));
        };
        return (
          <section className="rail-section">
            <h3 className="rail-title">{t('props.text')} <small>{t('props.textHint')}</small></h3>
            <Field label={t('props.content')}>
              <textarea rows={2} value={item.text} onChange={(event) => update({ text: event.target.value })} />
            </Field>
            <div className="var-chips">
              {VARS.map((name) => (
                <button key={name} type="button" className="chip tiny-chip" onClick={() => update({ text: `${item.text}{{${name}}}` })}>
                  {`{{${name}}}`}
                </button>
              ))}
            </div>
            <div className="pair">
              <NumField label="X" value={item.x} onChange={(v) => update({ x: v })} />
              <NumField label="Y" value={item.y} onChange={(v) => update({ y: v })} />
            </div>
            <div className="pair">
              <NumField label={t('props.size')} value={item.size} min={4} max={400} onChange={(v) => update({ size: v })} />
              <NumField label={t('props.tracking')} value={item.letterSpacing} min={-10} max={40} step={0.5} onChange={(v) => update({ letterSpacing: v })} />
            </div>
            <div className="pair">
              <Field label={t('props.family')}>
                <select value={item.family} onChange={(event) => update({ family: event.target.value as FrameFamily })}>
                  <option value="sans">Sans</option>
                  <option value="serif">Serif</option>
                  <option value="mono">Mono</option>
                </select>
              </Field>
              <Field label={t('props.weight')}>
                <select value={item.weight} onChange={(event) => update({ weight: Number(event.target.value) })}>
                  {[300, 400, 500, 600, 700, 800, 900].map((weight) => <option key={weight} value={weight}>{weight}</option>)}
                </select>
              </Field>
            </div>
            <div className="pair">
              <Field label={t('props.align')}>
                <select value={item.align} onChange={(event) => update({ align: event.target.value as FrameAlign })}>
                  <option value="left">{t('props.alignLeft')}</option>
                  <option value="center">{t('props.alignCenter')}</option>
                  <option value="right">{t('props.alignRight')}</option>
                </select>
              </Field>
              <Field label={t('props.color')}>
                <input type="color" value={toHex(item.color)} onChange={(event) => update({ color: event.target.value })} />
              </Field>
            </div>
            <NumField label={t('props.rotation')} value={item.rotation ?? 0} min={-180} max={180} onChange={(v) => update({ rotation: v })} />
            <div className="row-btns">
              <button type="button" className="btn ghost small" onClick={() => update({ visible: item.visible === false })}>
                <Icon name={item.visible === false ? 'eye' : 'eyeOff'} size={13} /> {item.visible === false ? t('props.showAgain') : t('props.hide')}
              </button>
              <button type="button" className="btn ghost small danger" onClick={() => {
                const next = sf().clone(spec);
                next.texts = next.texts.filter((row) => row.id !== item.id);
                props.onChange(sf().touch(next, {}));
              }}>
                <Icon name="trash" size={13} /> {t('library.delete')}
              </button>
            </div>
          </section>
        );
      })()}

      {selection?.kind === 'emblem' && (() => {
        const e = spec.emblem;
        const update = (p: Partial<typeof e>) => {
          const next = sf().clone(spec);
          next.emblem = { ...next.emblem, ...p };
          props.onChange(sf().touch(next, {}));
        };
        return (
          <section className="rail-section">
            <h3 className="rail-title">{t('props.emblem')} <small>HD2Lab</small></h3>
            <div className="pair">
              <NumField label="X" value={e.x} onChange={(v) => update({ x: v })} />
              <NumField label="Y" value={e.y} onChange={(v) => update({ y: v })} />
            </div>
            <div className="pair">
              <NumField label={t('props.maxW')} value={e.maxW} min={8} onChange={(v) => update({ maxW: v })} />
              <NumField label={t('props.maxH')} value={e.maxH} min={8} onChange={(v) => update({ maxH: v })} />
            </div>
            <div className="pair">
              <Field label={t('props.align')}>
                <select value={e.align} onChange={(event) => update({ align: event.target.value as FrameAlign })}>
                  <option value="left">{t('props.alignLeft')}</option>
                  <option value="center">{t('props.alignCenter')}</option>
                  <option value="right">{t('props.alignRight')}</option>
                </select>
              </Field>
              <Field label={t('props.ink')}>
                <select value={e.mode} onChange={(event) => update({ mode: event.target.value as 'auto' | 'light' | 'dark' })}>
                  <option value="auto">Auto</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </Field>
            </div>
            <NumField label={t('props.rotation')} value={e.rotation ?? 0} min={-180} max={180} onChange={(v) => update({ rotation: v })} />
            <button type="button" className="btn ghost small" onClick={() => update({ enabled: !e.enabled })}>
              <Icon name={e.enabled ? 'eyeOff' : 'eye'} size={13} /> {e.enabled ? t('props.emblemOff') : t('props.emblemOn')}
            </button>
          </section>
        );
      })()}

      {selection?.kind === 'sticker' && (() => {
        const item = (spec.stickers ?? []).find((sticker) => sticker.id === selection.id);
        if (!item) return null;
        const update = (p: Partial<typeof item>) => {
          const next = sf().clone(spec);
          next.stickers = (next.stickers ?? []).map((sticker) => (sticker.id === item.id ? { ...sticker, ...p } : sticker));
          props.onChange(sf().touch(next, {}));
        };
        return (
          <section className="rail-section">
            <h3 className="rail-title">
              {item.kind === 'sprite' ? t('props.sprite') : t('props.stripe')} <small>{item.label}</small>
            </h3>
            <div className="pair">
              <Field label={t('props.color')}>
                <input type="color" value={toHex(item.color)} onChange={(event) => update({ color: event.target.value })} />
              </Field>
              <Field label={t('props.color2')}>
                <input type="color" value={toHex(item.color2)} onChange={(event) => update({ color2: event.target.value })} />
              </Field>
            </div>
            <NumField label={t('props.opacity')} value={item.opacity * 100} min={0} max={100} onChange={(v) => update({ opacity: Math.max(0, Math.min(1, v / 100)) })} />
            <div className="pair">
              <NumField label="X" value={item.x} onChange={(v) => update({ x: v })} />
              <NumField label="Y" value={item.y} onChange={(v) => update({ y: v })} />
            </div>
            <div className="pair">
              <NumField label="W" value={item.w} min={8} onChange={(v) => update({ w: v })} />
              <NumField label="H" value={item.h} min={8} onChange={(v) => update({ h: v })} />
            </div>
            <NumField label={t('props.rotation')} value={item.rotation} min={-180} max={180} onChange={(v) => update({ rotation: v })} />
            <div className="row-btns">
              <button type="button" className="btn ghost small" onClick={() => update({ visible: item.visible === false })}>
                <Icon name={item.visible === false ? 'eye' : 'eyeOff'} size={13} /> {item.visible === false ? t('props.showAgain') : t('props.hide')}
              </button>
              <button type="button" className="btn ghost small danger" onClick={() => {
                const next = sf().clone(spec);
                next.stickers = (next.stickers ?? []).filter((sticker) => sticker.id !== item.id);
                props.onChange(sf().touch(next, {}));
              }}>
                <Icon name="trash" size={13} /> {t('library.delete')}
              </button>
            </div>
          </section>
        );
      })()}

      {selection?.kind === 'overlay' && spec.overlay && (
        <section className="rail-section">
          <h3 className="rail-title">{t('layers.overlay')} <small>{t('props.overlayHint')}</small></h3>
          <div className="row-btns">
            <button type="button" className={`chip${spec.overlay.layer === 'above' ? ' on' : ''}`} onClick={() => {
              const next = sf().clone(spec);
              if (next.overlay) next.overlay.layer = 'above';
              props.onChange(sf().touch(next, {}));
            }}>{t('props.layerAbove')}</button>
            <button type="button" className={`chip${spec.overlay.layer === 'below' ? ' on' : ''}`} onClick={() => {
              const next = sf().clone(spec);
              if (next.overlay) next.overlay.layer = 'below';
              props.onChange(sf().touch(next, {}));
            }}>{t('props.layerBelow')}</button>
          </div>
          <NumField label={t('props.opacity')} value={spec.overlay.opacity * 100} min={0} max={100} onChange={(v) => {
            const next = sf().clone(spec);
            if (next.overlay) next.overlay.opacity = Math.max(0, Math.min(1, v / 100));
            props.onChange(sf().touch(next, {}));
          }} />
          <div className="row-btns">
            <button type="button" className="btn ghost small" onClick={() => overlayInput.current?.click()}><Icon name="upload" size={13} /> {t('props.replace')}</button>
            <button type="button" className="btn ghost small danger" onClick={props.onRemoveOverlay}><Icon name="trash" size={13} /> {t('props.remove')}</button>
          </div>
        </section>
      )}
    </>
  );

  const frameSection = (
    <section className="rail-section">
      <h3 className="rail-title">{t('props.frame')}</h3>
      <Field label={t('props.name')}>
        <input data-testid="frame-name" value={spec.name} onChange={(event) => patch({ name: event.target.value })} maxLength={60} />
      </Field>
      <Field label={t('props.canvas')} hint={t('props.canvasHint')}>
        <div className="preset-grid">
          {CANVAS_PRESETS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`chip${spec.canvas.width === item.w && spec.canvas.height === item.h ? ' on' : ''}`}
              onClick={() => setCanvasSize(item.w, item.h)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="pair">
          <NumField label="W" value={spec.canvas.width} min={240} max={4000} onChange={(v) => setCanvasSize(v, spec.canvas.height)} />
          <NumField label="H" value={spec.canvas.height} min={240} max={4000} onChange={(v) => setCanvasSize(spec.canvas.width, v)} />
        </div>
      </Field>
      <div className="pair">
        <Field label={t('props.background')}>
          <input type="color" value={toHex(spec.canvas.background)} onChange={(event) => {
            const next = sf().clone(spec);
            next.canvas.background = event.target.value;
            props.onChange(sf().touch(next, {}));
          }} />
        </Field>
        <Field label={t('props.light')}>
          <button type="button" className={`switch${spec.canvas.light ? ' on' : ''}`} onClick={() => {
            const next = sf().clone(spec);
            next.canvas.light = !next.canvas.light;
            props.onChange(sf().touch(next, {}));
          }}><span /></button>
        </Field>
      </div>
      <Field label={t('props.gradient')} hint={t('props.gradientHint')}>
        <div className="grad-row">
          <input type="checkbox" checked={!!spec.canvas.gradient} onChange={(event) => {
            const next = sf().clone(spec);
            next.canvas.gradient = event.target.checked
              ? { type: 'linear', angle: 165, stops: ['#f4f1ea', '#ded4ef'] }
              : undefined;
            props.onChange(sf().touch(next, {}));
          }} />
          {spec.canvas.gradient ? (
            <>
              <input type="color" value={toHex(spec.canvas.gradient.stops[0])} onChange={(event) => {
                const next = sf().clone(spec);
                if (next.canvas.gradient) next.canvas.gradient.stops[0] = event.target.value;
                props.onChange(sf().touch(next, {}));
              }} />
              <input type="color" value={toHex(spec.canvas.gradient.stops[1])} onChange={(event) => {
                const next = sf().clone(spec);
                if (next.canvas.gradient) next.canvas.gradient.stops[1] = event.target.value;
                props.onChange(sf().touch(next, {}));
              }} />
              <NumField label={t('props.angle')} value={spec.canvas.gradient.angle} min={0} max={360} onChange={(value) => {
                const next = sf().clone(spec);
                if (next.canvas.gradient) next.canvas.gradient.angle = value;
                props.onChange(sf().touch(next, {}));
              }} />
            </>
          ) : <span className="muted">{t('props.off')}</span>}
        </div>
      </Field>
      <Field label={t('props.backgroundImage')} hint={spec.canvas.backgroundImage ? t('props.backgroundOn') : t('props.backgroundOff')}>
        {spec.canvas.backgroundImage ? (
          <div className="bg-row">
            <img className="bg-thumb" src={spec.canvas.backgroundImage.dataUrl} alt="" />
            <div className="bg-actions">
              <button type="button" className="btn ghost small" data-testid="props-bg-cut" onClick={props.onBackground}>
                <Icon name="crop" size={13} />{t('props.bgCut')}
              </button>
              <button type="button" className="btn ghost small danger" onClick={props.onRemoveBackground}>
                <Icon name="trash" size={13} />{t('props.remove')}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="drop-zone" data-testid="props-bg-add" onClick={props.onBackground}>
            <Icon name="image" size={18} />
            <span>{t('props.bgAdd')}</span>
            <small>{t('props.bgAddHint')}</small>
          </button>
        )}
        {spec.canvas.backgroundImage && (
          <NumField label={t('props.opacity')} value={Math.round(spec.canvas.backgroundImage.opacity * 100)} min={0} max={100} onChange={(v) => {
            const next = sf().clone(spec);
            if (next.canvas.backgroundImage) next.canvas.backgroundImage.opacity = Math.max(0, Math.min(1, v / 100));
            props.onChange(sf().touch(next, {}));
          }} />
        )}
      </Field>
    </section>
  );

  const perforationSection = (
    <section className="rail-section">
      <h3 className="rail-title">{t('props.perforation')} <small>{t('props.perforationHint')}</small></h3>
      <div className="row-btns">
        <button type="button" className={`switch${spec.perforation.enabled ? ' on' : ''}`} onClick={() => {
          const next = sf().clone(spec);
          next.perforation.enabled = !next.perforation.enabled;
          props.onChange(sf().touch(next, {}));
        }}><span /></button>
        <select value={spec.perforation.style} onChange={(event) => {
          const next = sf().clone(spec);
          next.perforation.style = event.target.value === 'film' ? 'film' : 'side';
          props.onChange(sf().touch(next, {}));
        }}>
          <option value="side">{t('props.perforationSide')}</option>
          <option value="film">{t('props.perforationFilm')}</option>
        </select>
        <input type="color" value={toHex(spec.perforation.color)} onChange={(event) => {
          const next = sf().clone(spec);
          next.perforation.color = event.target.value;
          props.onChange(sf().touch(next, {}));
        }} />
      </div>
      <div className="pair">
        <NumField label={t('props.holeW')} value={spec.perforation.holeWidth} min={2} onChange={(v) => {
          const next = sf().clone(spec); next.perforation.holeWidth = Math.round(v); props.onChange(sf().touch(next, {}));
        }} />
        <NumField label={t('props.holeH')} value={spec.perforation.holeHeight} min={2} onChange={(v) => {
          const next = sf().clone(spec); next.perforation.holeHeight = Math.round(v); props.onChange(sf().touch(next, {}));
        }} />
      </div>
      <NumField label={t('props.gap')} value={spec.perforation.gap} min={1} onChange={(v) => {
        const next = sf().clone(spec); next.perforation.gap = Math.round(v); props.onChange(sf().touch(next, {}));
      }} />
    </section>
  );

  const overlaySection = (
    <section className="rail-section">
      <h3 className="rail-title">{t('props.overlay')} <small>{t('props.overlayHint')}</small></h3>
      {spec.overlay ? (
        <>
          <div className="row-btns">
            <button type="button" className={`chip${spec.overlay.layer === 'above' ? ' on' : ''}`} onClick={() => {
              const next = sf().clone(spec);
              if (next.overlay) next.overlay.layer = 'above';
              props.onChange(sf().touch(next, {}));
            }}>{t('props.layerAbove')}</button>
            <button type="button" className={`chip${spec.overlay.layer === 'below' ? ' on' : ''}`} onClick={() => {
              const next = sf().clone(spec);
              if (next.overlay) next.overlay.layer = 'below';
              props.onChange(sf().touch(next, {}));
            }}>{t('props.layerBelow')}</button>
          </div>
          <NumField label={t('props.opacity')} value={spec.overlay.opacity * 100} min={0} max={100} onChange={(v) => {
            const next = sf().clone(spec);
            if (next.overlay) next.overlay.opacity = Math.max(0, Math.min(1, v / 100));
            props.onChange(sf().touch(next, {}));
          }} />
          <div className="row-btns">
            <button type="button" className="btn ghost small" onClick={() => overlayInput.current?.click()}><Icon name="upload" size={13} /> {t('props.replace')}</button>
            <button type="button" className="btn ghost small danger" onClick={props.onRemoveOverlay}><Icon name="trash" size={13} /> {t('props.remove')}</button>
          </div>
        </>
      ) : (
        <button type="button" className="drop-zone" onClick={() => overlayInput.current?.click()}>
          <Icon name="upload" size={18} />
          <span>{t('props.dropPng')}</span>
          <small>{t('props.dropHint')}</small>
        </button>
      )}
      <input
        ref={overlayInput}
        type="file"
        accept="image/png,image/webp,image/svg+xml"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) props.onOverlayFile(file);
          event.target.value = '';
        }}
      />
    </section>
  );

  return (
    <>
      {selection ? selectionSections : <p className="drawer-empty">{t('drawer.props.empty')}</p>}
      {frameSection}
      {perforationSection}
      {overlaySection}
      <input
        ref={slotInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) props.onSlotFile(slotIndex.current, file);
          event.target.value = '';
        }}
      />
    </>
  );
}

function toHex(value: string): string {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  }
  return '#f4f1ea';
}
