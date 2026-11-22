import { useEffect, useRef, useState } from 'react';
import { useI18n, type TKey } from '../i18n';
import { Icon } from './Icons';

/** The four HD2Lab doors, the same list in every ⋮ menu. */
export const HD2_LINKS: { id: string; label: TKey; note: TKey; href: string }[] = [
  { id: 'web-hq', label: 'menu.webHq', note: 'menu.webHqNote', href: 'https://hyangdan2.github.io/' },
  { id: 'apphub', label: 'menu.apphub', note: 'menu.apphubNote', href: 'https://hyangdan2.github.io/ApplicationHub/' },
  { id: 'shutterplate', label: 'menu.shutterplate', note: 'menu.shutterplateNote', href: 'https://hyangdan2.github.io/PKPilot0003/' },
  { id: 'nordlys', label: 'menu.nordlys', note: 'menu.nordlysNote', href: 'https://hyangdan2.github.io/PKPilot0011/' },
  { id: 'framebuilder', label: 'menu.framebuilder', note: 'menu.framebuilderNote', href: 'https://hyangdan2.github.io/PKPilot0015/' },
];

export interface NavMenuProps {
  /** The app the visitor is in; its own row is not repeated. */
  self: 'framebuilder';
  onHelp: () => void;
  onImportJson: () => void;
  onReset: () => void;
}

/**
 * The ⋮ menu: one navigation section shared by every HD2Lab app, then the
 * studio's own actions — help, importing a file, and the library reset.
 */
export function NavMenu({ self, onHelp, onImportJson, onReset }: NavMenuProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    const esc = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const links = HD2_LINKS.filter((item) => item.id !== self);
  const run = (action: () => void) => () => { setOpen(false); action(); };

  return (
    <div className="nav-menu" ref={box}>
      <button
        type="button"
        className="icon-btn"
        data-testid="more-menu"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('header.more')}
        title={t('header.more')}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="menu" size={18} />
      </button>
      {open && (
        <div className="nav-pop" role="menu">
          <p className="nav-kicker">{t('menu.navigation')}</p>
          {links.map((item) => (
            <a
              key={item.id}
              role="menuitem"
              href={item.href}
              target="_blank"
              rel="noreferrer"
              className="nav-row"
              onClick={() => setOpen(false)}
            >
              <span className="nav-name">{t(item.label)}</span>
              <span className="nav-note">{t(item.note)}</span>
              <Icon name="external" size={13} />
            </a>
          ))}

          <p className="nav-kicker">{t('menu.studio')}</p>
          <button type="button" role="menuitem" className="nav-row" onClick={run(onHelp)}>
            <span className="nav-name">{t('menu.help')}</span>
            <span className="nav-note">{t('menu.helpNote')}</span>
            <Icon name="help" size={13} />
          </button>
          <button type="button" role="menuitem" className="nav-row" onClick={run(onImportJson)}>
            <span className="nav-name">{t('menu.import')}</span>
            <span className="nav-note">{t('menu.importNote')}</span>
            <Icon name="upload" size={13} />
          </button>
          <button type="button" role="menuitem" className="nav-row nav-row-btn" onClick={run(onReset)}>
            <span className="nav-name">{t('menu.reset')}</span>
            <span className="nav-note">{t('menu.resetNote')}</span>
            <Icon name="trash" size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
