import { BrandMark, Icon } from './Icons';
import { NavMenu } from './NavMenu';
import type { ShutterFrameSpec } from '../spec/shutterframe';

export interface HeaderProps {
  spec: ShutterFrameSpec;
  theme: 'iris' | 'navy';
  saving: boolean;
  dirty: boolean;
  opacity?: number;
  onTheme: () => void;
  onPresets: () => void;
  onImportJson: () => void;
  onSave: () => void;
  onCopyLink: () => void;
  onOpenIn: (app: 'shutterplate' | 'nordlys') => void;
  onReset: () => void;
}

export function Header(props: HeaderProps) {
  const { spec } = props;
  return (
    <header className="topbar">
      <div className="topbar-brand">
        <BrandMark />
        <span className="brand-word">HD2Lab</span>
        <span className="brand-sep" aria-hidden="true">|</span>
        <span className="brand-app">Mynda Ljósa</span>
        <span className="badge">FRAME STUDIO</span>
      </div>
      <div className="topbar-actions">
        <button type="button" className="btn ghost" onClick={props.onPresets} title="프리셋 열기">
          <Icon name="spark" size={15} /><span>프리셋</span>
        </button>
        <button type="button" className="btn ghost" onClick={props.onImportJson} title=".shutterframe.json 불러오기">
          <Icon name="upload" size={15} /><span>JSON 불러오기</span>
        </button>
        <button type="button" className="btn ghost" onClick={props.onSave} title="내 보관함에 저장 (자동 저장 켜짐)">
          {props.saving ? <span className="spin" aria-hidden="true" /> : <Icon name="save" size={15} />}
          <span>저장</span>
        </button>
        <button type="button" className="btn ghost" onClick={props.onCopyLink} title="이 프레임의 공유 링크 복사">
          <Icon name="link" size={15} /><span>링크 복사</span>
        </button>
        <button type="button" className="btn primary" onClick={() => props.onOpenIn('shutterplate')} title="Shutterplate에서 이 프레임으로 4컷 인화">
          <Icon name="external" size={14} /><span>Shutterplate에서 열기</span>
        </button>
        <button type="button" className="btn primary alt" onClick={() => props.onOpenIn('nordlys')} title="Nordlys에서 이 프레임으로 4컷 인화">
          <Icon name="external" size={14} /><span>Nordlys에서 열기</span>
        </button>
        <button type="button" className="icon-btn" onClick={props.onTheme} aria-label="테마 전환" title="테마 전환">
          <Icon name={props.theme === 'iris' ? 'moon' : 'sun'} size={17} />
        </button>
        <NavMenu self="mynda" onReset={props.onReset} />
      </div>
      <div className="topbar-status" aria-live="polite">
        <span className={`dot${props.dirty ? ' dirty' : ''}`} />
        <span className="status-name">{spec.name}</span>
        <span className="status-meta">{spec.canvas.width}×{spec.canvas.height} · {spec.cells.length}컷</span>
      </div>
    </header>
  );
}
