import { useEffect, useRef } from 'react';
import { sf } from '../spec/shutterframe';
import { useI18n } from '../i18n';
import { Drawer } from './Drawer';
import { Icon } from './Icons';

export interface Palette {
  id: string;
  color: string;
  color2: string;
}

export const PALETTES: Palette[] = [
  { id: 'iris', color: '#8b6ce8', color2: '#ffffff' },
  { id: 'ink', color: '#1b1a18', color2: '#f1eadd' },
  { id: 'plum', color: '#8d6c80', color2: '#f7e9ef' },
  { id: 'nordic', color: '#7f97a8', color2: '#eef4f9' },
];

export interface StickerDrawerProps {
  open: boolean;
  palette: string;
  onPalette: (id: string) => void;
  onClose: () => void;
  onStripe: (preset: string) => void;
  onSprite: (file: File) => void;
}

function Swatch({ preset, palette }: { preset: string; palette: Palette }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.width = Math.round(120 * dpr);
    el.height = Math.round(64 * dpr);
    const ctx = el.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, 120, 64);
    sf().drawStickerPreset(ctx, preset, { x: 4, y: 10, w: 112, h: 44 }, { color: palette.color, color2: palette.color2 });
  }, [preset, palette]);
  return <canvas ref={canvas} className="swatch" style={{ width: 120, height: 64 }} />;
}

/** Every stripe sticker the engine can draw, plus the visitor's own sprite. */
export function StickerDrawer(props: StickerDrawerProps) {
  const { t } = useI18n();
  const file = useRef<HTMLInputElement | null>(null);
  const presets = sf().stickerPresets();
  const palette = PALETTES.find((item) => item.id === props.palette) ?? PALETTES[0];

  return (
    <Drawer
      side="right"
      open={props.open}
      testId="sticker-drawer"
      title={t('sticker.title')}
      kicker={t('sticker.kicker')}
      sub={t('sticker.sub')}
      closeLabel={t('drawer.close', { name: t('sticker.title') })}
      onClose={props.onClose}
    >
      <div className="palette-row" role="group" aria-label={t('sticker.palette')}>
        {PALETTES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`palette${item.id === palette.id ? ' on' : ''}`}
            onClick={() => props.onPalette(item.id)}
            title={item.id}
            aria-label={`${t('sticker.palette')} ${item.id}`}
          >
            <span style={{ background: item.color }} />
            <span style={{ background: item.color2 }} />
          </button>
        ))}
      </div>

      <div className="sticker-grid">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="sticker-card"
            id={`sticker-${preset.id}`}
            data-testid={`sticker-${preset.id}`}
            onClick={() => props.onStripe(preset.id)}
          >
            <Swatch preset={preset.id} palette={palette} />
            <span>{preset.label}</span>
          </button>
        ))}
      </div>

      <button type="button" className="drop-zone" id="sticker-upload" onClick={() => file.current?.click()}>
        <Icon name="sprite" size={20} />
        <span>{t('sticker.upload')}</span>
        <small>{t('sticker.uploadHint')}</small>
      </button>
      <p className="drawer-note">{t('sticker.note')}</p>
      <input
        ref={file}
        type="file"
        accept="image/png,image/webp,image/svg+xml"
        hidden
        onChange={(event) => {
          const picked = event.target.files?.[0];
          if (picked) props.onSprite(picked);
          event.target.value = '';
        }}
      />
    </Drawer>
  );
}
