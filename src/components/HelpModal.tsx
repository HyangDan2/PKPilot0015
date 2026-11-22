import { useEffect, useRef } from 'react';
import { useI18n } from '../i18n';
import { Icon } from './Icons';

export interface HelpModalProps {
  open: boolean;
  onClose: () => void;
  onOpenIn: (app: 'shutterplate' | 'cineplate') => void;
}

/** What the ⋮ menu's 도움말 opens: canvas basics, shortcuts, saving, and the two doors. */
export function HelpModal({ open, onClose, onOpenIn }: HelpModalProps) {
  const { t } = useI18n();
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const focus = box.current?.querySelector<HTMLElement>('button, a');
    focus?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" data-testid="help-modal" onClick={onClose}>
      <div
        ref={box}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('help.title')}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <p className="drawer-kicker">{t('help.kicker')}</p>
            <h2 className="modal-title">{t('help.title')}</h2>
          </div>
          <button type="button" className="icon-btn" aria-label={t('help.close')} title={t('help.close')} onClick={onClose}>
            <Icon name="close" size={17} />
          </button>
        </div>

        <div className="modal-body">
          <section className="help-section">
            <h3 className="rail-title">{t('help.canvasTitle')}</h3>
            <ul className="help-list">
              <li>{t('help.canvas1')}</li>
              <li>{t('help.canvas2')}</li>
              <li>{t('help.canvas3')}</li>
            </ul>
          </section>

          <section className="help-section">
            <h3 className="rail-title">{t('help.keysTitle')}</h3>
            <dl className="help-keys">
              <div><dt><kbd>Esc</kbd></dt><dd>{t('help.keyEsc')}</dd></div>
              <div><dt><kbd>⌘</kbd> / <kbd>Ctrl</kbd> + <kbd>S</kbd></dt><dd>{t('help.keySave')}</dd></div>
              <div><dt><kbd>←</kbd> <kbd>→</kbd></dt><dd>{t('help.keyTurn')}</dd></div>
              <div><dt><kbd>↑</kbd> <kbd>↓</kbd></dt><dd>{t('help.keySize')}</dd></div>
            </dl>
          </section>

          <section className="help-section">
            <h3 className="rail-title">{t('help.saveTitle')}</h3>
            <ul className="help-list">
              <li>{t('help.save1')}</li>
              <li>{t('help.save2')}</li>
              <li>{t('help.save3')}</li>
              <li className="help-vars">{t('help.save4')}</li>
            </ul>
          </section>

          <section className="help-section">
            <h3 className="rail-title">{t('help.linksTitle')}</h3>
            <div className="row-btns">
              <button type="button" className="btn ghost small" data-testid="help-shutterplate" onClick={() => { onClose(); onOpenIn('shutterplate'); }}>
                <Icon name="cuts4" size={13} /> {t('dock.shutterplate')} · {t('dock.shutterplateSub')}
              </button>
              <button type="button" className="btn ghost small" data-testid="help-cineplate" onClick={() => { onClose(); onOpenIn('cineplate'); }}>
                <Icon name="film" size={13} /> {t('dock.cineplate')} · {t('dock.cineplateSub')}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
