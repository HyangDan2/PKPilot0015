import type { ReactNode } from 'react';
import { Icon } from './Icons';

export interface DrawerProps {
  side: 'left' | 'right';
  open: boolean;
  title: string;
  kicker?: string;
  sub?: string;
  closeLabel: string;
  onClose: () => void;
  tabs?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  testId: string;
}

/**
 * One drawer shell for both sides. A wide screen slides it in over the canvas;
 * under 1024px the same markup becomes a bottom sheet (see styles.css), so a
 * phone never loses the plate behind a rail.
 */
export function Drawer(props: DrawerProps) {
  return (
    <aside
      className={`drawer drawer-${props.side}${props.open ? ' open' : ''}`}
      data-testid={props.testId}
      data-open={props.open ? 'true' : 'false'}
      aria-hidden={!props.open}
      aria-label={props.title}
    >
      <div className="drawer-head">
        <div className="drawer-heading">
          {props.kicker && <p className="drawer-kicker">{props.kicker}</p>}
          <h2 className="drawer-title">{props.title}</h2>
        </div>
        <button
          type="button"
          className="icon-btn drawer-close"
          aria-label={props.closeLabel}
          title={props.closeLabel}
          onClick={props.onClose}
        >
          <Icon name="close" size={16} />
        </button>
      </div>
      {props.sub && <p className="drawer-sub">{props.sub}</p>}
      {props.tabs}
      <div className="drawer-body">{props.children}</div>
      {props.footer && <div className="drawer-foot">{props.footer}</div>}
    </aside>
  );
}
