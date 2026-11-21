import { useState } from 'react';
import { useI18n } from '../i18n';
import { Icon } from './Icons';
import type { LeftTab } from './LeftDrawer';

export interface FloatingDockProps {
  leftOpen: boolean;
  leftTab: LeftTab;
  rightOpen: boolean;
  hasSelection: boolean;
  zoom: number | 'fit';
  grid: boolean;
  scale: number;
  saving: boolean;
  onLeft: (tab: LeftTab) => void;
  onProps: () => void;
  onZoom: (zoom: number | 'fit') => void;
  onGrid: (value: boolean) => void;
  onSave: () => void;
  onCopyLink: () => void;
  onOpenIn: (app: 'shutterplate' | 'nordlys') => void;
}

/**
 * The five controls that replaced the fixed rails and the crowded header.
 * They float over the plate and leave every pixel of canvas to the frame.
 */
export function FloatingDock(props: FloatingDockProps) {
  const { t } = useI18n();
  const [saveOpen, setSaveOpen] = useState(false);

  const toggle = (tab: LeftTab) => () => props.onLeft(tab);
  const leftOn = (tab: LeftTab) => props.leftOpen && props.leftTab === tab;

  return (
    <>
      <div className="dock dock-left" role="toolbar" aria-label={t('dock.presets') + ' / ' + t('dock.layers')}>
        <button
          type="button"
          className={`fab${leftOn('presets') ? ' on' : ''}`}
          data-testid="dock-presets"
          aria-expanded={leftOn('presets')}
          aria-label={leftOn('presets') ? t('dock.close', { name: t('dock.presets') }) : t('dock.open', { name: t('dock.presets') })}
          title={`${t('dock.presets')} — ${t('dock.open', { name: t('dock.presets') })}`}
          onClick={toggle('presets')}
        >
          <Icon name="folder" size={16} />
          <span className="fab-label">{t('dock.presets')}</span>
        </button>
        <button
          type="button"
          className={`fab${leftOn('layers') ? ' on' : ''}`}
          data-testid="dock-layers"
          aria-expanded={leftOn('layers')}
          aria-label={leftOn('layers') ? t('dock.close', { name: t('dock.layers') }) : t('dock.open', { name: t('dock.layers') })}
          title={t('dock.layers')}
          onClick={toggle('layers')}
        >
          <Icon name="layers" size={16} />
          <span className="fab-label">{t('dock.layers')}</span>
        </button>
      </div>

      <div className="dock dock-right">
        <button
          type="button"
          className={`fab${props.rightOpen ? ' on' : ''}`}
          data-testid="dock-props"
          aria-expanded={props.rightOpen}
          aria-label={props.rightOpen ? t('dock.close', { name: t('dock.props') }) : t('dock.open', { name: t('dock.props') })}
          title={t('dock.props')}
          onClick={props.onProps}
        >
          <Icon name="sliders" size={16} />
          <span className="fab-label">{t('dock.props')}</span>
          {props.hasSelection && !props.rightOpen && <span className="fab-dot" aria-label={t('dock.propsBadge')} />}
        </button>
      </div>

      <div className="dock dock-zoom">
        <div className="zoom-capsule" role="group" aria-label={t('dock.zoom')}>
          <button type="button" className={`zoom-btn${props.zoom === 'fit' ? ' on' : ''}`} data-testid="zoom-fit" onClick={() => props.onZoom('fit')}>{t('dock.zoomFit')}</button>
          <button type="button" className={`zoom-btn${props.zoom === 0.5 ? ' on' : ''}`} data-testid="zoom-50" onClick={() => props.onZoom(0.5)}>50%</button>
          <button type="button" className={`zoom-btn${props.zoom === 1 ? ' on' : ''}`} data-testid="zoom-100" onClick={() => props.onZoom(1)}>100%</button>
          <span className="zoom-readout" aria-live="polite">{Math.round(props.scale * 100)}%</span>
          <span className="zoom-sep" aria-hidden="true" />
          <button
            type="button"
            className={`zoom-btn grid-btn${props.grid ? ' on' : ''}`}
            data-testid="grid-toggle"
            aria-pressed={props.grid}
            onClick={() => props.onGrid(!props.grid)}
          >
            <Icon name="grid" size={13} />
            <span className="zoom-label">{t('dock.grid')}</span>
          </button>
        </div>
      </div>

      <div className={`dock dock-save${saveOpen ? ' expanded' : ''}`}>
        <div className="dock-save-items" role="group" aria-label={t('dock.copyLink')}>
          <button
            type="button"
            className="fab save-fab"
            data-testid="dock-save"
            title={`${t('dock.save')} — ${t('dock.saveHint')}`}
            aria-label={`${t('dock.save')} — ${t('dock.saveHint')}`}
            onClick={() => { setSaveOpen(false); props.onSave(); }}
          >
            {props.saving ? <span className="spin" aria-hidden="true" /> : <Icon name="download" size={16} />}
            <span className="fab-label">{t('dock.save')}</span>
          </button>
          <button
            type="button"
            className="fab"
            data-testid="dock-copy-link"
            title={t('dock.copyLinkHint')}
            aria-label={t('dock.copyLink')}
            onClick={() => { setSaveOpen(false); props.onCopyLink(); }}
          >
            <Icon name="link" size={16} />
            <span className="fab-label">{t('dock.copyLink')}</span>
          </button>
          <button
            type="button"
            className="fab"
            data-testid="dock-shutterplate"
            title={t('dock.shutterplateHint')}
            aria-label={t('dock.shutterplateHint')}
            onClick={() => { setSaveOpen(false); props.onOpenIn('shutterplate'); }}
          >
            <Icon name="external" size={15} />
            <span className="fab-label">{t('dock.shutterplate')}</span>
          </button>
          <button
            type="button"
            className="fab"
            data-testid="dock-nordlys"
            title={t('dock.nordlysHint')}
            aria-label={t('dock.nordlysHint')}
            onClick={() => { setSaveOpen(false); props.onOpenIn('nordlys'); }}
          >
            <Icon name="external" size={15} />
            <span className="fab-label">{t('dock.nordlys')}</span>
          </button>
        </div>
        <button
          type="button"
          className={`fab fab-save-toggle${saveOpen ? ' on' : ''}`}
          data-testid="dock-save-toggle"
          aria-expanded={saveOpen}
          aria-label={t('dock.save') + ' · ' + t('dock.copyLink')}
          onClick={() => setSaveOpen((value) => !value)}
        >
          <Icon name={saveOpen ? 'close' : 'download'} size={17} />
          <span className="fab-label">{t('dock.save')} · {t('dock.copyLink')}</span>
        </button>
      </div>
    </>
  );
}
