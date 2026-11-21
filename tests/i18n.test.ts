import { describe, expect, it } from 'vitest';
import { DICT, LANGS, translate, type Lang, type TKey } from '../src/i18n';
import { PRESETS, DEMO_FIELDS, blankSpec } from '../src/editor/presets';

const keys = Object.keys(DICT.ko) as TKey[];
const HANGUL = /[\u3131-\u318e\uac00-\ud7a3]/;

describe('i18n', () => {
  it('keeps both languages on exactly the same keys, none empty', () => {
    expect(keys.length).toBeGreaterThan(100);
    for (const lang of LANGS) {
      expect(Object.keys(DICT[lang]).sort()).toEqual(keys.slice().sort());
      for (const key of keys) expect(DICT[lang][key].trim().length, `${lang}:${key}`).toBeGreaterThan(0);
    }
  });

  it('never leaves Korean text in the English table', () => {
    for (const key of keys) {
      expect(HANGUL.test(DICT.en[key]), `en:${key} → ${DICT.en[key]}`).toBe(false);
    }
  });

  it('speaks polite Korean in every sentence', () => {
    const polite = /(니다|세요|십시오)[.!?]?$/;
    for (const key of keys) {
      const text = DICT.ko[key];
      if (!/다[.!?]?$/.test(text)) continue;
      expect(polite.test(text), `ko:${key} → ${text}`).toBe(true);
    }
  });

  it('interpolates named values and leaves unknown placeholders alone', () => {
    expect(translate('ko', 'toast.slotFilled', { n: 3 })).toBe('슬롯 3에 내 사진을 넣었습니다.');
    expect(translate('en', 'toast.slotFilled', { n: 3 })).toBe('Put your photo in slot 3.');
    expect(translate('en', 'toast.frameOpened', { name: 'E2E Strip' })).toBe('Opened the “E2E Strip” frame.');
    expect(translate('ko', 'toast.slotFilled', {})).toBe('슬롯 {n}에 내 사진을 넣었습니다.');
  });

  it('falls back to the Korean source for an unknown key', () => {
    expect(translate('en', 'no.such.key' as TKey)).toBe('no.such.key');
  });

  it('carries the language codes the header toggles between', () => {
    expect(LANGS).toEqual(['ko', 'en']);
    const asLang: Lang[] = ['ko', 'en'];
    expect(asLang).toEqual(LANGS);
  });
});

describe('presets', () => {
  it('names and describes all five presets in both languages', () => {
    expect(PRESETS).toHaveLength(5);
    for (const preset of PRESETS) {
      expect(preset.label.trim().length).toBeGreaterThan(0);
      expect(preset.labelEn.trim().length).toBeGreaterThan(0);
      expect(preset.blurb.trim().length).toBeGreaterThan(0);
      expect(preset.blurbEn.trim().length).toBeGreaterThan(0);
      expect(HANGUL.test(preset.labelEn), preset.labelEn).toBe(false);
      expect(HANGUL.test(preset.blurbEn), preset.blurbEn).toBe(false);
    }
  });

  it('keeps the nine demo variables the printed rows read', () => {
    for (const name of ['date', 'camera', 'title', 'caption', 'film', 'lens', 'shutter', 'iso', 'aperture']) {
      expect(DEMO_FIELDS).toHaveProperty(name);
    }
  });

  it('ships the blank frame helper the app re-exports', () => {
    expect(blankSpec).toBeTypeOf('function');
  });
});
