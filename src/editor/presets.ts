import { sf, type ShutterFrameSpec, type FrameCell, type FrameText } from '../spec/shutterframe';

/** A text row with everything the spec wants, so a preset reads as data. */
function text(partial: Partial<FrameText> & { id: string; text: string; x: number; y: number }): FrameText {
  return {
    size: 22,
    family: 'sans',
    weight: 500,
    align: 'center',
    color: '#2a2724',
    letterSpacing: 0,
    ...partial,
  };
}

function cells(list: FrameCell[]): FrameCell[] {
  return list;
}

/**
 * The photobooth overlay: a transparent centre with a printed border. It is
 * pure frame artwork — every word the plate prints is a text layer the user
 * can select, retype or delete, never lettering burned into an image.
 */
function boothOverlay(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="1800" viewBox="0 0 600 1800">
<g fill="none" stroke="#ffffff" stroke-width="54">
  <rect x="27" y="27" width="546" height="1746" rx="18"/>
</g>
<g fill="none" stroke="#d9b7c8" stroke-width="2" stroke-dasharray="8 8">
  <rect x="66" y="66" width="468" height="1668" rx="10"/>
</g>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export interface PresetDef {
  id: string;
  label: string;
  labelEn: string;
  blurb: string;
  blurbEn: string;
  build(): ShutterFrameSpec;
}

function assemble(name: string, partial: Partial<ShutterFrameSpec>): ShutterFrameSpec {
  const draft = {
    schema: 'shutterframe/v1',
    id: sf().uid('frame'),
    name,
    author: 'HD2Lab',
    updatedAt: new Date().toISOString(),
    /* every plate starts on a sheet of paper, never on flat colour: matte
       cotton with the grain just high enough to read as print stock */
    canvas: {
      width: 600,
      height: 1800,
      background: '#f4f1ea',
      texture: { kind: 'cotton', strength: 0.55 },
      light: true,
    },
    perforation: { enabled: false, style: 'side', color: '#e9e4d8' },
    cells: [
      { x: 36, y: 96, w: 528, h: 380, radius: 4 },
      { x: 36, y: 496, w: 528, h: 380, radius: 4 },
      { x: 36, y: 896, w: 528, h: 380, radius: 4 },
      { x: 36, y: 1296, w: 528, h: 380, radius: 4 },
    ],
    texts: [],
    emblem: { enabled: true, id: 'hd2lab', mono: false, x: 300, y: 1738, maxW: 240, maxH: 46, align: 'center', mode: 'auto' },
    ...partial,
  } as ShutterFrameSpec;
  const checked = sf().validate(draft);
  if (!checked.spec) throw new Error(`preset ${name}: ${checked.errors.join(' / ')}`);
  return checked.spec;
}

export const PRESETS: PresetDef[] = [
  {
    id: 'classic-strip',
    label: '클래식 1×4 스트립',
    labelEn: 'Classic 1×4 strip',
    blurb: '종이 여백 위에 네 컷을 세로로. 가장 조용한 인생네컷.',
    blurbEn: 'Four cuts stacked on quiet paper — the calmest photo booth strip.',
    build: () => assemble('Classic Strip', {
      canvas: { width: 600, height: 1800, background: '#f4f1ea', light: true, texture: { kind: 'cotton', strength: 0.55 } },
      cells: cells([
        { x: 36, y: 96, w: 528, h: 380, radius: 4 },
        { x: 36, y: 496, w: 528, h: 380, radius: 4 },
        { x: 36, y: 896, w: 528, h: 380, radius: 4 },
        { x: 36, y: 1296, w: 528, h: 380, radius: 4 },
      ]),
      texts: [
        text({ id: 't-title', text: 'FRAMEBUILDER', x: 300, y: 62, size: 26, weight: 700, letterSpacing: 6 }),
        text({ id: 't-foot', text: 'HD2LAB · FRAMEBUILDER', x: 300, y: 1788, size: 15, color: '#8a8177', letterSpacing: 4 }),
        text({ id: 't-date', text: '{{date}}', x: 300, y: 1740, size: 20, color: '#6b635a', letterSpacing: 2 }),
        text({ id: 't-cap', text: '{{caption}}', x: 300, y: 1706, size: 18, color: '#8a8177', family: 'serif' }),
      ],
      emblem: { enabled: false, id: 'hd2lab', mono: false, x: 300, y: 1738, maxW: 240, maxH: 46, align: 'center', mode: 'auto' },
    }),
  },
  {
    id: 'nordic-grid',
    label: '노르딕 2×2 그리드',
    labelEn: 'Nordic 2×2 grid',
    blurb: '넓은 2×2 판에 북유럽 하늘색 그라디언트.',
    blurbEn: 'A wide 2×2 plate washed in a Nordic sky gradient.',
    build: () => assemble('Nordic Grid', {
      canvas: {
        width: 1200,
        height: 1600,
        background: '#e8eef5',
        light: true,
        gradient: { type: 'linear', angle: 165, stops: ['#f2f6fb', '#d7e3f0'] },
        texture: { kind: 'cotton', strength: 0.4 },
      },
      cells: cells([
        { x: 64, y: 150, w: 526, h: 646, radius: 10 },
        { x: 610, y: 150, w: 526, h: 646, radius: 10 },
        { x: 64, y: 816, w: 526, h: 646, radius: 10 },
        { x: 610, y: 816, w: 526, h: 646, radius: 10 },
      ]),
      texts: [
        text({ id: 't-title', text: 'FRAMEBUILDER', x: 600, y: 96, size: 42, weight: 700, letterSpacing: 14 }),
        text({ id: 't-sub', text: '{{date}} · {{camera}}', x: 600, y: 1520, size: 24, color: '#5a6b7d', letterSpacing: 2 }),
      ],
      emblem: { enabled: true, id: 'hd2lab', mono: false, x: 600, y: 1570, maxW: 260, maxH: 46, align: 'center', mode: 'auto' },
    }),
  },
  {
    id: 'dark-cinema',
    label: '다크 시네마 1×4',
    labelEn: 'Dark cinema 1×4',
    blurb: '필름 퍼포레이션이 뚫린 검은 스트립. 영화 인화 느낌.',
    blurbEn: 'A black strip pierced with film sprockets, printed like a movie still.',
    build: () => assemble('Dark Cinema', {
      canvas: { width: 680, height: 1960, background: '#121110', light: false, texture: { kind: 'archive', strength: 0.4 } },
      perforation: { enabled: true, style: 'side', color: '#efe9dc', holeWidth: 16, holeHeight: 12, gap: 26 },
      cells: cells([
        { x: 92, y: 150, w: 496, h: 352, radius: 2 },
        { x: 92, y: 528, w: 496, h: 352, radius: 2 },
        { x: 92, y: 906, w: 496, h: 352, radius: 2 },
        { x: 92, y: 1284, w: 496, h: 352, radius: 2 },
      ]),
      texts: [
        text({ id: 't-title', text: 'FRAMEBUILDER', x: 340, y: 88, size: 30, weight: 700, color: '#f2ede2', letterSpacing: 8 }),
        text({ id: 't-film', text: '{{film}} · ISO {{iso}}', x: 340, y: 1716, size: 20, color: '#c9c2b5', family: 'mono', letterSpacing: 2 }),
        text({ id: 't-exif', text: '{{camera}} · {{shutter}} · f/{{aperture}}', x: 340, y: 1754, size: 16, color: '#948d81', family: 'mono' }),
        text({ id: 't-num', text: 'HD2 · FRAME 04', x: 340, y: 1852, size: 16, color: '#6f695f', family: 'mono', letterSpacing: 4 }),
      ],
      emblem: { enabled: true, id: 'hd2lab', mono: false, x: 340, y: 1812, maxW: 210, maxH: 40, align: 'center', mode: 'light' },
    }),
  },
  {
    id: 'magazine-collage',
    label: '매거진 비대칭 콜라주',
    labelEn: 'Magazine collage',
    blurb: '네 컷의 크기를 다르게 나눈 편집 디자인.',
    blurbEn: 'An editorial layout where each of the four cuts has its own size.',
    build: () => assemble('Magazine Collage', {
      canvas: { width: 1200, height: 1600, background: '#fbf9f5', light: true, texture: { kind: 'archive', strength: 0.5 } },
      cells: cells([
        { x: 60, y: 190, w: 700, h: 760, radius: 0 },
        { x: 788, y: 190, w: 352, h: 760, radius: 0 },
        { x: 60, y: 978, w: 460, h: 480, radius: 0 },
        { x: 548, y: 978, w: 592, h: 480, radius: 0 },
      ]),
      texts: [
        text({ id: 't-mast', text: 'FRAME', x: 60, y: 120, size: 84, weight: 800, align: 'left', color: '#1d1b19', letterSpacing: -2 }),
        text({ id: 't-mast2', text: 'BUILDER', x: 560, y: 120, size: 84, weight: 300, align: 'left', color: '#8d6c80', letterSpacing: -2 }),
        text({ id: 't-issue', text: 'ISSUE 04 · {{date}}', x: 1140, y: 120, size: 24, weight: 600, align: 'right', color: '#1d1b19', letterSpacing: 3 }),
        text({ id: 't-cap', text: '{{caption}}', x: 60, y: 1540, size: 28, family: 'serif', align: 'left', color: '#3a352f' }),
        text({ id: 't-shot', text: '{{camera}} · {{lens}} · {{shutter}}', x: 1140, y: 1540, size: 18, align: 'right', color: '#7c7368', family: 'mono' }),
      ],
      emblem: { enabled: false, id: 'hd2lab', mono: false, x: 60, y: 1580, maxW: 220, maxH: 44, align: 'left', mode: 'auto' },
    }),
  },
  {
    id: 'photobooth-png',
    label: '포토부스 PNG 오버레이',
    labelEn: 'Photo booth PNG overlay',
    blurb: '투명 PNG 테두리를 사진 위에 얹는 인생네컷 템플릿.',
    blurbEn: 'A transparent PNG frame laid over the photos, like a booth print.',
    build: () => assemble('Photo Booth Overlay', {
      canvas: { width: 600, height: 1800, background: '#ffffff', light: true, texture: { kind: 'cotton', strength: 0.35 } },
      cells: cells([
        { x: 66, y: 118, w: 468, h: 372, radius: 10 },
        { x: 66, y: 508, w: 468, h: 372, radius: 10 },
        { x: 66, y: 898, w: 468, h: 372, radius: 10 },
        { x: 66, y: 1288, w: 468, h: 372, radius: 10 },
      ]),
      overlay: { dataUrl: boothOverlay(), layer: 'above', opacity: 1 },
      texts: [
        text({ id: 't-title', text: 'FRAMEBUILDER', x: 300, y: 96, size: 22, weight: 700, color: '#ffffff', letterSpacing: 8 }),
        text({ id: 't-date', text: '{{date}}', x: 300, y: 1712, size: 16, color: '#ffffff', letterSpacing: 4 }),
        text({ id: 't-foot', text: 'HD2LAB · FRAMEBUILDER', x: 300, y: 1752, size: 18, color: '#ffffff', letterSpacing: 6 }),
      ],
      emblem: { enabled: false, x: 300, y: 1738, maxW: 240, maxH: 46, align: 'center', mode: 'auto' },
    }),
  },
];

export function blankSpec(name = '새 프레임'): ShutterFrameSpec {
  return assemble(name, {
    texts: [
      text({ id: 't-title', text: '{{title}}', x: 300, y: 62, size: 26, weight: 700, letterSpacing: 4 }),
      text({ id: 't-date', text: '{{date}}', x: 300, y: 1740, size: 20, color: '#6b635a', letterSpacing: 2 }),
    ],
    emblem: { enabled: true, id: 'hd2lab', mono: false, x: 300, y: 1782, maxW: 220, maxH: 40, align: 'center', mode: 'auto' },
  });
}

/** The demo photographs and the metadata the preview prints. */
export const DEMO_FIELDS = {
  date: '2026.11.21',
  camera: 'Leica M6',
  make: 'Leica',
  model: 'M6',
  lens: 'Summicron 35mm',
  film: 'Nordlys 400',
  title: 'FrameBuilder',
  caption: '겨울 바다, 오후 네 시',
  shutter: '1/250',
  iso: '400',
  aperture: '2.0',
};
