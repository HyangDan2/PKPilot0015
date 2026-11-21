import type { FrameSlot } from '../spec/shutterframe';

/** Four generated Nordic scenes, so the studio opens on a real four-cut print. */
function scene(kind: 'dawn' | 'ridge' | 'snow' | 'night'): string {
  const palettes = {
    dawn: { sky: ['#f7d9c4', '#e7b8a3'], sun: '#fff3df', far: '#b48a86', near: '#6d4f55', water: '#c9a29b' },
    ridge: { sky: ['#dbe7f2', '#a8c3d8'], sun: '#ffffff', far: '#7f97a8', near: '#41586a', water: '#93aabb' },
    snow: { sky: ['#eef3f7', '#ccdae6'], sun: '#ffffff', far: '#b6c6d4', near: '#7d94a5', water: '#dfe9f0' },
    night: { sky: ['#1b2438', '#2d3d5c'], sun: '#f2ead0', far: '#38496a', near: '#151d2c', water: '#243252' },
  } as const;
  const p = palettes[kind];
  const moon = kind === 'night'
    ? `<circle cx="430" cy="120" r="38" fill="${p.sun}" opacity="0.92"/>
       <circle cx="118" cy="86" r="2.4" fill="#ffffff" opacity="0.8"/>
       <circle cx="192" cy="58" r="1.8" fill="#ffffff" opacity="0.7"/>
       <circle cx="286" cy="96" r="1.5" fill="#ffffff" opacity="0.6"/>
       <circle cx="356" cy="52" r="2" fill="#ffffff" opacity="0.75"/>
       <circle cx="86" cy="150" r="1.6" fill="#ffffff" opacity="0.6"/>`
    : `<circle cx="440" cy="118" r="46" fill="${p.sun}" opacity="0.9"/>`;
  const snow = kind === 'snow'
    ? `<path d="M0 350 L120 300 L210 330 L320 286 L450 340 L600 306 L600 450 L0 450 Z" fill="#ffffff" opacity="0.9"/>`
    : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${p.sky[0]}"/>
      <stop offset="1" stop-color="${p.sky[1]}"/>
    </linearGradient>
    <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${p.water}"/>
      <stop offset="1" stop-color="${p.near}"/>
    </linearGradient>
  </defs>
  <rect width="640" height="480" fill="url(#sky)"/>
  ${moon}
  <path d="M0 250 L90 176 L150 226 L228 150 L320 244 L392 190 L470 250 L560 196 L640 250 L640 330 L0 330 Z" fill="${p.far}" opacity="0.85"/>
  <path d="M0 300 L110 232 L190 292 L280 218 L372 300 L470 244 L560 302 L640 268 L640 350 L0 350 Z" fill="${p.near}"/>
  ${snow}
  <rect y="330" width="640" height="150" fill="url(#water)" opacity="0.92"/>
  <g opacity="0.22" fill="#ffffff">
    <rect x="0" y="352" width="640" height="2.5"/>
    <rect x="40" y="372" width="520" height="2"/>
    <rect x="90" y="392" width="440" height="1.8"/>
    <rect x="30" y="414" width="560" height="1.6"/>
  </g>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const DEMO_SCENES: { title: string; url: string }[] = [
  { title: 'Fjord Dawn', url: scene('dawn') },
  { title: 'Pine Ridge', url: scene('ridge') },
  { title: 'Snow Field', url: scene('snow') },
  { title: 'Midnight Sun', url: scene('night') },
];

function decode(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'));
    img.src = url;
  });
}

export async function loadDemoSlots(): Promise<FrameSlot[]> {
  const slots: FrameSlot[] = [];
  for (const item of DEMO_SCENES) {
    try {
      const img = await decode(item.url);
      slots.push({ img, w: img.naturalWidth, h: img.naturalHeight });
    } catch {
      slots.push({ img: null, w: 0, h: 0 });
    }
  }
  return slots;
}

/** A visitor's own photograph, object-URL backed and released by the caller. */
export async function slotFromFile(file: File): Promise<FrameSlot & { url: string }> {
  const url = URL.createObjectURL(file);
  const img = await decode(url);
  return { img, w: img.naturalWidth, h: img.naturalHeight, url };
}
