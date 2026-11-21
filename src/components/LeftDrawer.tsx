import { Icon } from './Icons';
import { Drawer } from './Drawer';
import { useI18n } from '../i18n';
import type { ShutterFrameSpec, FrameSlot } from '../spec/shutterframe';
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
  onToggleText: (id: string) => void;
  onMoveText: (id: string, delta: number) => void;
  onToggleOverlay: () => void;
  onToggleEmblem: () => void;
  onRemoveOverlay: () => void;
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

function LayersPanel(props: LeftDrawerProps) {
  const { t } = useI18n();
  const { spec, selection } = props;
  const total = spec.cells.length + spec.texts.length + 2;
  return (
    <section className="rail-section grow">
      <h3 className="rail-title">{t('layers.title')} <small>{t('layers.meta', { n: total })}</small></h3>
      <ul className="layer-list">
        {spec.cells.map((_cell, index) => (
          <li key={`cell-${index}`}>
            <button
              type="button"
              className={`layer-row${selection?.kind === 'cell' && selection.index === index ? ' active' : ''}`}
              onClick={() => props.onSelect({ kind: 'cell', index })}
            >
              <span className="layer-num">{(index + 1).toString().padStart(2, '0')}</span>
              <span className="layer-thumb">
                {props.slots[index]?.img
                  ? <LayerThumb slot={props.slots[index]} />
                  : <Icon name="image" size={13} />}
              </span>
              <span className="layer-name">
                {t('layers.slot', { n: index + 1 })}
                <small>{props.slotNames[index] ?? t('layers.slotEmpty')}</small>
              </span>
            </button>
          </li>
        ))}
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
        {spec.texts.map((item, index) => (
          <li key={item.id}>
            <button
              type="button"
              className={`layer-row${selection?.kind === 'text' && selection.id === item.id ? ' active' : ''}`}
              onClick={() => props.onSelect({ kind: 'text', id: item.id })}
            >
              <span className="layer-num">T{(index + 1).toString().padStart(2, '0')}</span>
              <span className="layer-thumb"><Icon name="spark" size={13} /></span>
              <span className="layer-name">
                {item.text || t('layers.textEmpty')}
                <small>{item.family} · {item.size}px</small>
              </span>
            </button>
            <button
              type="button"
              className="icon-btn tiny eye"
              aria-label={t('layers.visibility', { name: item.text || t('layers.textEmpty') })}
              title={t('layers.visibility', { name: item.text || t('layers.textEmpty') })}
              onClick={() => props.onToggleText(item.id)}
            >
              <Icon name={item.visible === false ? 'eyeOff' : 'eye'} size={13} />
            </button>
            <span className="order-pair">
              <button type="button" className="icon-btn tiny" aria-label={t('layers.forward', { name: item.text || t('layers.textEmpty') })} title={t('layers.forward', { name: item.text || t('layers.textEmpty') })} onClick={() => props.onMoveText(item.id, -1)}>
                <Icon name="up" size={12} />
              </button>
              <button type="button" className="icon-btn tiny" aria-label={t('layers.backward', { name: item.text || t('layers.textEmpty') })} title={t('layers.backward', { name: item.text || t('layers.textEmpty') })} onClick={() => props.onMoveText(item.id, 1)}>
                <Icon name="down" size={12} />
              </button>
            </span>
          </li>
        ))}
        <li>
          <button
            type="button"
            className={`layer-row${selection?.kind === 'emblem' ? ' active' : ''}`}
            onClick={() => props.onSelect({ kind: 'emblem' })}
          >
            <span className="layer-num">HD</span>
            <span className="layer-thumb"><Icon name="spark" size={13} /></span>
            <span className="layer-name">{t('layers.emblem')}<small>{spec.emblem.mode} · {spec.emblem.align}</small></span>
          </button>
          <button
            type="button"
            className="icon-btn tiny eye"
            aria-label={t('layers.visibility', { name: t('layers.emblem') })}
            title={t('layers.visibility', { name: t('layers.emblem') })}
            onClick={props.onToggleEmblem}
          >
            <Icon name={spec.emblem.enabled ? 'eye' : 'eyeOff'} size={13} />
          </button>
        </li>
      </ul>
    </section>
  );
}

function LayerThumb({ slot }: { slot: FrameSlot }) {
  const src = slot.img;
  if (!src || !(src instanceof HTMLImageElement)) return <Icon name="image" size={13} />;
  return <img src={src.src} alt="" />;
}
