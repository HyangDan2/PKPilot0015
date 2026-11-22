import { Icon } from './Icons';
import { Drawer } from './Drawer';
import { useI18n } from '../i18n';
import { sf, type ShutterFrameSpec, type FrameSlot, type LayerRef, type LayerRow } from '../spec/shutterframe';
import { PRESETS } from '../editor/presets';
import type { Selection } from '../editor/selection';

export interface LibraryItem {
  id: string;
  name: string;
  updatedAt: string;
  canvas: string;
}

export type LeftTab = 'presets' | 'layers';

export interface LeftDrawerProps {
  open: boolean;
  tab: LeftTab;
  spec: ShutterFrameSpec;
  slots: FrameSlot[];
  slotNames: string[];
  selection: Selection;
  library: LibraryItem[];
  activeId: string;
  onTab: (tab: LeftTab) => void;
  onClose: () => void;
  onSelect: (selection: Selection) => void;
  onPreset: (id: string) => void;
  onOpenLibrary: (id: string) => void;
  onNew: () => void;
  onDuplicate: () => void;
  onDeleteLibrary: (id: string) => void;
  onToggleVisible: (ref: LayerRef) => void;
  onLayerZ: (ref: LayerRef, dir: 1 | -1) => void;
  onAddEmblem: () => void;
  onRemoveEmblem: () => void;
  onToggleOverlay: () => void;
  onRemoveOverlay: () => void;
  onBackground: () => void;
}

/** Presets and the saved shelf on the left of the canvas, layers on its other tab. */
export function LeftDrawer(props: LeftDrawerProps) {
  const { t } = useI18n();
  const kicker = props.tab === 'presets' ? t('drawer.presets.kicker') : t('drawer.layers.kicker');

  return (
    <Drawer
      side="left"
      open={props.open}
      testId="drawer-left"
      title={props.tab === 'presets' ? t('library.title') + ' · ' + t('library.shelf') : t('layers.title')}
      kicker={kicker}
      sub={props.tab === 'presets' ? t('drawer.presets.sub') : t('drawer.layers.sub')}
      closeLabel={t('drawer.close', { name: props.tab === 'presets' ? t('dock.presets') : t('dock.layers') })}
      onClose={props.onClose}
      tabs={(
        <div className="drawer-tabs" role="tablist" aria-label={t('dock.presets') + ' / ' + t('dock.layers')}>
          <button
            type="button"
            role="tab"
            aria-selected={props.tab === 'presets'}
            className={`drawer-tab${props.tab === 'presets' ? ' on' : ''}`}
            onClick={() => props.onTab('presets')}
          >
            <Icon name="folder" size={14} />{t('dock.presets')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={props.tab === 'layers'}
            className={`drawer-tab${props.tab === 'layers' ? ' on' : ''}`}
            onClick={() => props.onTab('layers')}
          >
            <Icon name="layers" size={14} />{t('dock.layers')}
          </button>
        </div>
      )}
      footer={<span className="esc-only">{t('drawer.esc')}</span>}
    >
      {props.tab === 'presets' ? <PresetsPanel {...props} /> : <LayersPanel {...props} />}
    </Drawer>
  );
}

function PresetsPanel(props: LeftDrawerProps) {
  const { t, lang } = useI18n();
  return (
    <>
      <section className="rail-section">
        <h3 className="rail-title">{t('library.title')} <small>{t('library.titleHint')}</small></h3>
        <div className="preset-list">
          {PRESETS.map((preset) => (
            <button key={preset.id} type="button" className={`preset-row preset-${preset.id}`} onClick={() => props.onPreset(preset.id)}>
              <span className="preset-swatch" aria-hidden="true" />
              <span className="preset-copy">
                <b>{lang === 'en' ? preset.labelEn : preset.label}</b>
                <small>{lang === 'en' ? preset.blurbEn : preset.blurb}</small>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="rail-section">
        <h3 className="rail-title">
          {t('library.shelf')} <small>{t('library.shelfMeta', { n: props.library.length })}</small>
        </h3>
        <div className="lib-actions">
          <button type="button" className="btn ghost small" onClick={props.onNew}><Icon name="plus" size={13} />{t('library.new')}</button>
          <button type="button" className="btn ghost small" onClick={props.onDuplicate}><Icon name="copy" size={13} />{t('library.duplicate')}</button>
        </div>
        <ul className="lib-list">
          {props.library.length === 0 && <li className="lib-empty">{t('library.empty')}</li>}
          {props.library.map((item) => (
            <li key={item.id} className={item.id === props.activeId ? 'lib-row active' : 'lib-row'}>
              <button type="button" className="lib-open" onClick={() => props.onOpenLibrary(item.id)} title={item.name}>
                <span className="lib-name">{item.name}</span>
                <span className="lib-meta">{item.canvas}</span>
              </button>
              <button type="button" className="icon-btn tiny" aria-label={t('library.delete')} title={t('library.deleteTitle')} onClick={() => props.onDeleteLibrary(item.id)}>
                <Icon name="trash" size={13} />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

/** One stack for slots, stickers, sprites, texts and the emblem — top first. */
function LayersPanel(props: LeftDrawerProps) {
  const { t } = useI18n();
  const { spec, selection } = props;
  const rows = sf().layers(spec).filter((row) => row.kind !== 'overlay').slice().reverse();
  const currentKey = selection
    ? selection.kind === 'cell' ? `cell:${selection.index}`
      : selection.kind === 'text' ? `text:${selection.id}`
        : selection.kind === 'sticker' ? `sticker:${selection.id}`
          : selection.kind === 'emblem' ? 'emblem' : ''
    : '';

  const refOf = (key: string): LayerRef | null => {
    if (key.indexOf('cell:') === 0) return { kind: 'cell', index: Number(key.slice(5)) };
    if (key.indexOf('text:') === 0) return { kind: 'text', id: key.slice(5) };
    if (key.indexOf('sticker:') === 0) return { kind: 'sticker', id: key.slice(8) };
    if (key === 'emblem') return { kind: 'emblem' };
    return null;
  };

  const nameOf = (row: LayerRow): { title: string; sub: string } => {
    if (row.kind === 'cell') return { title: t('layers.slot', { n: (row.index ?? 0) + 1 }), sub: props.slotNames[row.index ?? 0] ?? t('layers.slotEmpty') };
    if (row.kind === 'text') {
      const item = spec.texts.find((text) => text.id === row.id);
      return { title: item?.text || t('layers.textEmpty'), sub: `${item?.family ?? 'sans'} · ${Math.round(item?.size ?? 0)}px` };
    }
    if (row.kind === 'sticker') {
      const item = (spec.stickers ?? []).find((sticker) => sticker.id === row.id);
      return { title: item?.label || t('layers.sticker'), sub: item?.kind === 'sprite' ? t('layers.sprite') : t('layers.stripe') };
    }
    const mark = sf().emblemOf(spec.emblem.id ?? 'hd2lab');
    return { title: t('layers.emblem'), sub: `${mark.name} · ${spec.emblem.mono ? 'ink' : 'brand'}` };
  };

  return (
    <section className="rail-section grow">
      <h3 className="rail-title">{t('layers.title')} <small>{t('layers.meta', { n: rows.length })}</small></h3>
      <ul className="layer-list">
        {rows.map((row) => {
          const ref = refOf(row.key);
          const named = nameOf(row);
          const isActive = row.key === currentKey;
          return (
            <li key={row.key} className={isActive ? 'on' : undefined}>
              <button
                type="button"
                className={`layer-row${isActive ? ' active' : ''}${row.visible ? '' : ' hidden'}`}
                onClick={() => {
                  if (row.kind === 'cell') props.onSelect({ kind: 'cell', index: row.index ?? 0 });
                  else if (row.kind === 'text') props.onSelect({ kind: 'text', id: row.id ?? '' });
                  else if (row.kind === 'sticker') props.onSelect({ kind: 'sticker', id: row.id ?? '' });
                  else props.onSelect({ kind: 'emblem' });
                }}
              >
                <span className="layer-num">
                  {row.kind === 'cell' ? String((row.index ?? 0) + 1).padStart(2, '0')
                    : row.kind === 'text' ? 'T' : row.kind === 'sticker' ? 'S' : 'HD'}
                </span>
                <span className="layer-thumb">
                  {row.kind === 'cell' && props.slots[row.index ?? 0]?.img
                    ? <LayerThumb slot={props.slots[row.index ?? 0]} />
                    : <Icon name={row.kind === 'sticker' ? 'sticker' : row.kind === 'cell' ? 'image' : 'spark'} size={13} />}
                </span>
                <span className="layer-name">
                  {named.title}
                  <small>{named.sub}</small>
                </span>
              </button>
              {ref && (
                <>
                  {row.kind === 'emblem' ? (
                    /* a logo is either on the plate or gone from the stack, so
                       its trash is the whole switch — no half-hidden state */
                    <button
                      type="button"
                      className="icon-btn tiny"
                      data-testid="layer-emblem-remove"
                      aria-label={t('layers.emblemRemove')}
                      title={t('layers.emblemRemove')}
                      onClick={props.onRemoveEmblem}
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="icon-btn tiny eye"
                      aria-label={t('layers.visibility', { name: named.title })}
                      title={t('layers.visibility', { name: named.title })}
                      onClick={() => props.onToggleVisible(ref)}
                    >
                      <Icon name={row.visible ? 'eye' : 'eyeOff'} size={13} />
                    </button>
                  )}
                  <span className="order-pair">
                    <button type="button" className="icon-btn tiny" aria-label={t('layers.forward', { name: named.title })} title={t('layers.forward', { name: named.title })} onClick={() => props.onLayerZ(ref, 1)}>
                      <Icon name="up" size={12} />
                    </button>
                    <button type="button" className="icon-btn tiny" aria-label={t('layers.backward', { name: named.title })} title={t('layers.backward', { name: named.title })} onClick={() => props.onLayerZ(ref, -1)}>
                      <Icon name="down" size={12} />
                    </button>
                  </span>
                </>
              )}
            </li>
          );
        })}
        {spec.overlay && (
          <li>
            <button
              type="button"
              className={`layer-row${selection?.kind === 'overlay' ? ' active' : ''}`}
              onClick={() => props.onSelect({ kind: 'overlay' })}
            >
              <span className="layer-num">PNG</span>
              <span className="layer-thumb"><Icon name="layers" size={13} /></span>
              <span className="layer-name">
                {t('layers.overlay')}
                <small>{spec.overlay.layer === 'above' ? t('layers.overlayAbove') : t('layers.overlayBelow')}</small>
              </span>
            </button>
            <button
              type="button"
              className="icon-btn tiny eye"
              aria-label={t('layers.visibility', { name: t('layers.overlay') })}
              title={t('layers.visibility', { name: t('layers.overlay') })}
              onClick={props.onToggleOverlay}
            >
              <Icon name={spec.overlay.opacity > 0 ? 'eye' : 'eyeOff'} size={13} />
            </button>
            <button type="button" className="icon-btn tiny" aria-label={t('layers.overlayRemove')} title={t('props.remove')} onClick={props.onRemoveOverlay}>
              <Icon name="trash" size={13} />
            </button>
          </li>
        )}
      </ul>
      {spec.emblem.enabled === false && (
        <button type="button" className="layer-bg" data-testid="layers-emblem-add" onClick={props.onAddEmblem}>
          <span className="layer-thumb"><Icon name="plus" size={13} /></span>
          <span className="layer-name">
            {t('layers.emblemAdd')}
            <small>{t('props.emblemTypeHint')}</small>
          </span>
          <Icon name="spark" size={14} />
        </button>
      )}
      <button type="button" className={`layer-bg${spec.canvas.backgroundImage ? ' on' : ''}`} onClick={props.onBackground}>
        <span className="layer-thumb">
          {spec.canvas.backgroundImage ? <img src={spec.canvas.backgroundImage.dataUrl} alt="" /> : <Icon name="image" size={13} />}
        </span>
        <span className="layer-name">
          {t('layers.background')}
          <small>{spec.canvas.backgroundImage ? t('layers.backgroundOn') : t('layers.backgroundOff')}</small>
        </span>
        <Icon name="crop" size={14} />
      </button>
    </section>
  );
}

function LayerThumb({ slot }: { slot: FrameSlot }) {
  const src = slot.img;
  if (!src || !(src instanceof HTMLImageElement)) return <Icon name="image" size={13} />;
  return <img src={src.src} alt="" />;
}
