import { useI18n, LANGS, type Lang } from '../i18n';
import { Icon } from './Icons';
import { NavMenu } from './NavMenu';
import type { ShutterFrameSpec } from '../spec/shutterframe';

export interface HeaderProps {
  spec: ShutterFrameSpec;
  theme: 'iris' | 'navy';
  dirty: boolean;
  onTheme: () => void;
  onHelp: () => void;
  onImportJson: () => void;
  onReset: () => void;
}

/**
 * The HD2Lab title bar, slimmed to the four controls every app carries:
 * [dual-skew mark] HD2Lab | Mynda Ljósa … KO | EN · theme · ⋮
 * Everything that used to crowd this row now lives in the floating dock,
 * the drawers, or the ⋮ menu.
 */
export function Header(props: HeaderProps) {
  const { spec } = props;
  const { lang, setLang, t } = useI18n();

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span className="mark" aria-hidden="true" />
        <span className="brand-name">HD2Lab</span>
        <em className="brand-app">Mynda Ljósa</em>
      </div>

      <div className="topbar-status" aria-live="polite">
        <span className={`dot${props.dirty ? ' dirty' : ''}`} />
        <span className="status-name">{spec.name}</span>
        <span className="status-meta">
          {t('header.statusMeta', { w: spec.canvas.width, h: spec.canvas.height, n: spec.cells.length })}
        </span>
      </div>

      <div className="topbar-actions">
        <div className="lang-toggle" role="group" aria-label={t('header.lang')}>
          {LANGS.map((code: Lang) => (
            <button
              key={code}
              type="button"
              className={`lang-btn${lang === code ? ' on' : ''}`}
              data-testid={`lang-${code}`}
              aria-pressed={lang === code}
              title={code === 'ko' ? t('header.langKo') : t('header.langEn')}
              onClick={() => setLang(code)}
            >
              {code.toUpperCase()}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="icon-btn"
          data-testid="theme-toggle"
          onClick={props.onTheme}
          aria-label={t('header.theme')}
          title={t('header.theme')}
        >
          <Icon name={props.theme === 'navy' ? 'sun' : 'moon'} size={17} />
        </button>
        <NavMenu self="mynda" onHelp={props.onHelp} onImportJson={props.onImportJson} onReset={props.onReset} />
      </div>
    </header>
  );
}
