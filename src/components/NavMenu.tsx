import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icons';

/** The three apps plus the two portals, the same list in every ⋮ menu. */
export const HD2_LINKS = [
  { id: 'web-hq', label: 'HD2Lab Web-HQ', note: '포털 홈', href: 'https://hyangdan2.github.io/' },
  { id: 'apphub', label: 'ApplicationHub', note: '앱 허브', href: 'https://hyangdan2.github.io/ApplicationHub/' },
  { id: 'shutterplate', label: 'Shutterplate', note: 'EXIF & 4컷 인화 스튜디오', href: 'https://hyangdan2.github.io/PKPilot0003/' },
  { id: 'nordlys', label: 'Nordlys', note: '필름 색보정 & 영상 스튜디오', href: 'https://hyangdan2.github.io/PKPilot0011/' },
  { id: 'mynda', label: 'Mynda Ljósa', note: '커스텀 4컷 프레임 에디터', href: 'https://hyangdan2.github.io/PKPilot0015/' },
];

export interface NavMenuProps {
  /** The app the visitor is in; its own row is not repeated. */
  self: 'mynda' | 'shutterplate' | 'nordlys';
  onReset?: () => void;
}

/**
 * The ⋮ menu: one navigation section shared by all three apps, plus the
 * app-local action at the bottom.
 */
export function NavMenu({ self, onReset }: NavMenuProps) {
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
  return (
    <div className="nav-menu" ref={box}>
      <button
        type="button"
        className="icon-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="더 보기 메뉴"
        title="더 보기"
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="menu" size={18} />
      </button>
      {open && (
        <div className="nav-pop" role="menu">
          <p className="nav-kicker">NAVIGATION</p>
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
              <span className="nav-name">{item.label}</span>
              <span className="nav-note">{item.note}</span>
              <Icon name="external" size={13} />
            </a>
          ))}
          {onReset && (
            <>
              <p className="nav-kicker">THIS STUDIO</p>
              <button
                type="button"
                role="menuitem"
                className="nav-row nav-row-btn"
                onClick={() => { setOpen(false); onReset(); }}
              >
                <span className="nav-name">내 프레임 초기화</span>
                <span className="nav-note">기본 프리셋으로 되돌립니다</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
