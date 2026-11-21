import type { CSSProperties } from 'react';

const PATHS: Record<string, string> = {
  plus: 'M12 5v14M5 12h14',
  save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z M17 21v-8H7v8 M7 3v5h8',
  upload: 'M12 16V4 M7 9l5-5 5 5 M4 20h16',
  download: 'M12 4v12 M7 11l5 5 5-5 M4 20h16',
  link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 14h10l1-14 M10 11v6 M14 11v6',
  copy: 'M9 9h11v11H9z M4 4h11v3 M4 4v11h3',
  image: 'M3 4h18v16H3z M8 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4 M3 17l5-5 4 4 3-3 6 6',
  grid: 'M3 3h18v18H3z M9 3v18 M15 3v18 M3 9h18 M3 15h18',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  eyeOff: 'M3 3l18 18 M10.6 6.2A9 9 0 0 1 22 12c-1 1.6-2.4 3-3.9 4 M6.2 7.1C4 8.6 2 12 2 12s4 7 10 7c1.4 0 2.7-.3 3.8-.8',
  up: 'M12 19V5 M6 11l6-6 6 6',
  down: 'M12 5v14 M6 13l6 6 6-6',
  external: 'M14 4h6v6 M20 4l-9 9 M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  menu: 'M12 6h.01 M12 12h.01 M12 18h.01',
  spark: 'M12 3l2.2 6.2L20 12l-5.8 2.8L12 21l-2.2-6.2L4 12l5.8-2.8z',
  layers: 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5 M3 17l9 5 9-5',
  folder: 'M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10 M12 1v3 M12 20v3 M1 12h3 M20 12h3 M4 4l2 2 M18 18l2 2 M20 4l-2 2 M6 18l-2 2',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  close: 'M18 6L6 18 M6 6l12 12',
  check: 'M20 6L9 17l-5-5',
  sliders: 'M3 7h12 M19 7h2 M3 17h6 M13 17h8 M15 4v6 M9 14v6',
  help: 'M12 17h.01 M9.1 9a3 3 0 1 1 6 0c0 2.1-3 2.3-3 4.1',
  chevron: 'M6 9l6 6 6-6',
  hCenter: 'M12 2v20 M5 9h14v6H5z',
  vCenter: 'M2 12h20 M9 5h6v14H9z',
  alignLeft: 'M3 3v18 M7 8h11v3H7z M7 14h7v3H7z',
  alignRight: 'M21 3v18 M6 8h11v3H6z M10 14h7v3h-7z',
  alignTop: 'M3 3h18 M8 7h3v11H8z M14 7h3v7h-3z',
  alignBottom: 'M3 21h18 M8 6h3v11H8z M14 10h3v7h-3z',
  rotate: 'M21 12a9 9 0 1 1-2.6-6.4 M21 3v6h-6',
  reset: 'M3 12a9 9 0 1 0 2.6-6.4 M3 3v6h6',
  sticker: 'M4 5h16v14H4z M4 12l8-7 M4 19l16-14 M12 19l8-7',
  sprite: 'M12 3l4 4-4 4-4-4z M6 13l3 3-3 3-3-3z M18 13l3 3-3 3-3-3z',
  crop: 'M6 2v16h16 M2 6h16v16',
  plusCircle: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18 M12 8v8 M8 12h8',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18 M12 2v4 M12 18v4 M2 12h4 M18 12h4',
};

export function Icon({ name, size = 16, style }: { name: string; size?: number; style?: CSSProperties }) {
  return (
    <svg
      className="ic"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d={PATHS[name] ?? PATHS.spark} />
    </svg>
  );
}
