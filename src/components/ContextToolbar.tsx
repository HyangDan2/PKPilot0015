import { Icon } from './Icons';
import { useI18n } from '../i18n';
import type { AlignMode } from '../spec/shutterframe';
import type { Selection } from '../editor/selection';

export interface ContextToolbarProps {
  selection: Exclude<Selection, null>;
  onAlign: (mode: AlignMode) => void;
  onLayer: (dir: 1 | -1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDetails: () => void;
  onCells: (kind: '1x4' | '2x2') => void;
  onReplacePhoto: () => void;
}

const ALIGN: { mode: AlignMode; icon: string; key: 'align.hCenter' | 'align.vCenter' | 'align.left' | 'align.right' | 'align.top' | 'align.bottom' }[] = [
  { mode: 'h-center', icon: 'hCenter', key: 'align.hCenter' },
  { mode: 'v-center', icon: 'vCenter', key: 'align.vCenter' },
  { mode: 'left', icon: 'alignLeft', key: 'align.left' },
  { mode: 'right', icon: 'alignRight', key: 'align.right' },
  { mode: 'top', icon: 'alignTop', key: 'align.top' },
  { mode: 'bottom', icon: 'alignBottom', key: 'align.bottom' },
];

/**
 * The compact bar over the plate: only what a finger needs right now — square
 * up the selection, step it through the layer stack, copy or drop it.
 */
export function ContextToolbar(props: ContextToolbarProps) {
  const { t } = useI18n();
  const { selection } = props;
  const removable = selection.kind === 'text' || selection.kind === 'sticker';
  const named = selection.kind === 'cell'
    ? t('context.slot', { n: String(selection.index + 1).padStart(2, '0') })
    : selection.kind === 'text' ? t('context.text')
      : selection.kind === 'sticker' ? t('context.sticker') : t('context.emblem');

  return (
    <div className="context-bar" role="toolbar" aria-label={t('context.edit', { name: named })} data-testid="context-bar">
      <span className="context-name">{named}</span>
      <div className="context-scroll">
        {ALIGN.map((item) => (
          <button key={item.mode} type="button" className="tool" onClick={() => props.onAlign(item.mode)} title={t(item.key)} aria-label={t(item.key)}>
            <Icon name={item.icon} size={16} />
          </button>
        ))}
        <span className="context-sep" />
        <button type="button" className="tool" onClick={() => props.onLayer(1)} title={t('action.forward')} aria-label={t('action.forward')}>
          <Icon name="up" size={16} />
        </button>
        <button type="button" className="tool" onClick={() => props.onLayer(-1)} title={t('action.backward')} aria-label={t('action.backward')}>
          <Icon name="down" size={16} />
        </button>
        {selection.kind === 'cell' && (
          <>
            <span className="context-sep" />
            <button type="button" className="tool wide" onClick={() => props.onCells('1x4')}>{t('props.align14')}</button>
            <button type="button" className="tool wide" onClick={() => props.onCells('2x2')}>{t('props.align22')}</button>
            <button type="button" className="tool" onClick={props.onReplacePhoto} title={t('props.putPhoto')} aria-label={t('props.putPhoto')}>
              <Icon name="image" size={16} />
            </button>
          </>
        )}
        {removable && (
          <>
            <span className="context-sep" />
            <button type="button" className="tool" onClick={props.onDuplicate} title={t('action.duplicate')} aria-label={t('action.duplicate')}>
              <Icon name="copy" size={16} />
            </button>
            <button type="button" className="tool danger" onClick={props.onDelete} title={t('props.remove')} aria-label={t('props.remove')}>
              <Icon name="trash" size={16} />
            </button>
          </>
        )}
        <span className="context-sep" />
        <button type="button" className="tool wide" onClick={props.onDetails} data-testid="context-details">
          <Icon name="sliders" size={15} /> {t('action.details')}
        </button>
      </div>
    </div>
  );
}
