import { Icon } from './Icons';
import type { ShutterFrameSpec, FrameSlot } from '../spec/shutterframe';
import { PRESETS } from '../editor/presets';
import type { Selection } from '../editor/selection';

export interface LibraryItem {
  id: string;
  name: string;
  updatedAt: string;
  canvas: string;
}

export interface LeftRailProps {
  spec: ShutterFrameSpec;
  slots: FrameSlot[];
  slotNames: string[];
  selection: Selection;
  library: LibraryItem[];
  activeId: string;
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

export function LeftRail(props: LeftRailProps) {
  const { spec, selection } = props;
  return (
    <aside className="rail left-rail">
      <section className="rail-section">
        <h2 className="rail-title">프리셋 <small>1클릭 생성</small></h2>
        <div className="preset-list">
          {PRESETS.map((preset) => (
            <button key={preset.id} type="button" className={`preset-row preset-${preset.id}`} onClick={() => props.onPreset(preset.id)}>
              <span className="preset-swatch" aria-hidden="true" />
              <span className="preset-copy">
                <b>{preset.label}</b>
                <small>{preset.blurb}</small>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="rail-section">
        <h2 className="rail-title">
          보관함 <small>{props.library.length}개 · 자동 저장</small>
        </h2>
        <div className="lib-actions">
          <button type="button" className="btn ghost small" onClick={props.onNew}><Icon name="plus" size={13} />새로 만들기</button>
          <button type="button" className="btn ghost small" onClick={props.onDuplicate}><Icon name="copy" size={13} />복제</button>
        </div>
        <ul className="lib-list">
          {props.library.length === 0 && <li className="lib-empty">아직 저장된 프레임이 없습니다.</li>}
          {props.library.map((item) => (
            <li key={item.id} className={item.id === props.activeId ? 'lib-row active' : 'lib-row'}>
              <button type="button" className="lib-open" onClick={() => props.onOpenLibrary(item.id)} title={item.name}>
                <span className="lib-name">{item.name}</span>
                <span className="lib-meta">{item.canvas}</span>
              </button>
              <button type="button" className="icon-btn tiny" aria-label="삭제" title="삭제" onClick={() => props.onDeleteLibrary(item.id)}>
                <Icon name="trash" size={13} />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="rail-section grow">
        <h2 className="rail-title">레이어 <small>{spec.cells.length + spec.texts.length + 2}개</small></h2>
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
                <span className="layer-name">슬롯 {index + 1}<small>{props.slotNames[index] ?? '빈 칸'}</small></span>
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
                <span className="layer-name">오버레이<small>{spec.overlay.layer === 'above' ? '사진 위' : '사진 아래'}</small></span>
              </button>
              <button type="button" className="icon-btn tiny eye" aria-label="오버레이 표시" title="표시/숨김"
                onClick={props.onToggleOverlay}>
                <Icon name={spec.overlay.opacity > 0 ? 'eye' : 'eyeOff'} size={13} />
              </button>
              <button type="button" className="icon-btn tiny" aria-label="오버레이 제거" title="제거" onClick={props.onRemoveOverlay}>
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
                <span className="layer-name">{item.text || '빈 텍스트'}<small>{item.family} · {item.size}px</small></span>
              </button>
              <button type="button" className="icon-btn tiny eye" aria-label="텍스트 표시" title="표시/숨김"
                onClick={() => props.onToggleText(item.id)}>
                <Icon name={item.visible === false ? 'eyeOff' : 'eye'} size={13} />
              </button>
              <span className="order-pair">
                <button type="button" className="icon-btn tiny" aria-label="앞으로" title="앞으로" onClick={() => props.onMoveText(item.id, -1)}>
                  <Icon name="up" size={12} />
                </button>
                <button type="button" className="icon-btn tiny" aria-label="뒤로" title="뒤로" onClick={() => props.onMoveText(item.id, 1)}>
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
              <span className="layer-name">엠블럼<small>{spec.emblem.mode} · {spec.emblem.align}</small></span>
            </button>
            <button type="button" className="icon-btn tiny eye" aria-label="엠블럼 표시" title="표시/숨김" onClick={props.onToggleEmblem}>
              <Icon name={spec.emblem.enabled ? 'eye' : 'eyeOff'} size={13} />
            </button>
          </li>
        </ul>
      </section>
    </aside>
  );
}

function LayerThumb({ slot }: { slot: FrameSlot }) {
  const src = slot.img;
  if (!src || !(src instanceof HTMLImageElement)) return <Icon name="image" size={13} />;
  return <img src={src.src} alt="" />;
}
