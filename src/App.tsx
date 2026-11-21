import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sf, loadEngine, layerRef, type AlignMode, type FrameFields, type FrameSlot, type LayerRef, type ShutterFrameSpec } from './spec/shutterframe';
import { Header } from './components/Header';
import { LeftDrawer, type LeftTab, type LibraryItem } from './components/LeftDrawer';
import { StageCanvas } from './components/StageCanvas';
import { RightDrawer } from './components/RightPanel';
import { FloatingDock } from './components/FloatingDock';
import { HelpModal } from './components/HelpModal';
import { ContextToolbar } from './components/ContextToolbar';
import { StickerDrawer, PALETTES } from './components/StickerDrawer';
import { BackgroundCropModal } from './components/BackgroundCropModal';
import { PRESETS, DEMO_FIELDS, blankSpec } from './editor/presets';
import { loadDemoSlots, slotFromFile } from './editor/photos';
import { prepareSprite } from './editor/images';
import type { Selection } from './editor/selection';
import { I18nContext, translate, type Lang, type TKey, type Vars } from './i18n';

const THEME_KEY = 'mynda.theme';
const LANG_KEY = 'mynda.lang';
const WIDE = '(min-width: 1024px)';

function storedLang(): Lang {
  return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'ko';
}

function storedTheme(): 'iris' | 'navy' {
  return localStorage.getItem(THEME_KEY) === 'iris' ? 'iris' : 'navy';
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [spec, setSpec] = useState<ShutterFrameSpec | null>(null);
  const [slots, setSlots] = useState<FrameSlot[]>([]);
  const [slotNames, setSlotNames] = useState<string[]>(['Fjord Dawn', 'Pine Ridge', 'Snow Field', 'Midnight Sun']);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [theme, setTheme] = useState<'iris' | 'navy'>(storedTheme);
  const [lang, setLangState] = useState<Lang>(storedLang);
  const [grid, setGrid] = useState(false);
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const [scale, setScale] = useState(1);
  const [leftOpen, setLeftOpen] = useState(false);
  const [leftTab, setLeftTab] = useState<LeftTab>('presets');
  const [rightOpen, setRightOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [stickerOpen, setStickerOpen] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [palette, setPalette] = useState(PALETTES[0].id);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null);
  const importInput = useRef<HTMLInputElement | null>(null);
  const spriteInput = useRef<HTMLInputElement | null>(null);
  const slotInput = useRef<HTMLInputElement | null>(null);
  const slotIndex = useRef(0);
  const saveTimer = useRef<number>(0);
  const toastTimer = useRef<number>(0);
  const fields = useMemo<FrameFields>(() => ({ ...DEMO_FIELDS }), []);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try { localStorage.setItem(LANG_KEY, next); } catch { /* private mode */ }
  }, []);

  const t = useCallback((key: TKey, vars?: Vars) => translate(lang, key, vars), [lang]);
  const i18n = useMemo(() => ({ lang, t, setLang }), [lang, t, setLang]);

  const say = useCallback((text: string, tone: 'ok' | 'warn' = 'ok') => {
    setToast({ text, tone });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  const refreshLibrary = useCallback(async () => {
    try {
      const rows = await sf().store.list();
      setLibrary(rows.map((item) => ({
        id: item.id,
        name: item.name,
        updatedAt: item.updatedAt,
        canvas: `${item.canvas.width}×${item.canvas.height}`,
      })));
    } catch {
      setLibrary([]);
    }
  }, []);

  /* ── boot: engine, demo photographs, the shared shelf, and a #frame= link ── */
  useEffect(() => {
    let alive = true;
    (async () => {
      await loadEngine();
      const [demo] = await Promise.all([loadDemoSlots()]);
      if (!alive) return;
      setSlots(demo);
      let incoming: ShutterFrameSpec | null = null;
      try {
        incoming = sf().fromUrl(window.location.href);
      } catch {
        incoming = null;
      }
      let initial: ShutterFrameSpec;
      if (incoming) {
        initial = incoming;
        say(translate(storedLang(), 'toast.fromLink'));
      } else {
        /* a webview that blocks IndexedDB still opens on a frame to touch */
        let rows: ShutterFrameSpec[] = [];
        try {
          rows = await sf().store.list();
        } catch {
          rows = [];
        }
        initial = rows.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0] ?? PRESETS[0].build();
      }
      /* a background photograph or a sprite must arrive before the first paint */
      await sf().primeAssets(initial);
      if (!alive) return;
      setSpec(initial);
      setReady(true);
      void refreshLibrary();
      if (window.location.hash.indexOf('frame=') >= 0) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    })();
    return () => { alive = false; };
  }, [refreshLibrary, say]);

  /* A #frame= link can arrive after the studio has booted (a pasted fragment,
     or a browser that applies the hash once the document is ready). */
  useEffect(() => {
    if (!ready) return;
    const applyHash = () => {
      let incoming: ShutterFrameSpec | null = null;
      try {
        incoming = sf().fromUrl(window.location.href);
      } catch {
        incoming = null;
      }
      if (!incoming) return;
      void sf().primeAssets(incoming).then(() => setSpec(incoming as ShutterFrameSpec));
      setSelection(null);
      say(t('toast.fromLink'));
      if (window.location.hash.indexOf('frame=') >= 0) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    };
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, [ready, say, t]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* private mode */ }
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  /* ── autosave ───────────────────────────────────────────────────────────── */
  const persist = useCallback(async (next: ShutterFrameSpec, quiet = true) => {
    try {
      setSaving(true);
      await sf().store.put(next);
      await refreshLibrary();
      setDirty(false);
      if (!quiet) say(translate(lang, 'toast.savedShelf'));
    } catch {
      if (!quiet) say(translate(lang, 'toast.saveFailed'), 'warn');
    } finally {
      setSaving(false);
    }
  }, [refreshLibrary, say, lang]);

  const commit = useCallback((next: ShutterFrameSpec) => {
    setSpec(next);
    setDirty(true);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { void persist(next); }, 550);
  }, [persist]);

  useEffect(() => {
    if (!spec || !ready) return;
    const onLeave = () => { void sf().store.put(spec); };
    window.addEventListener('pagehide', onLeave);
    return () => window.removeEventListener('pagehide', onLeave);
  }, [spec, ready]);

  /* ── drawers ────────────────────────────────────────────────────────────── */
  const closeDrawers = useCallback(() => {
    setLeftOpen(false);
    setRightOpen(false);
    setStickerOpen(false);
  }, []);

  const openLeft = useCallback((tab: LeftTab) => {
    setLeftOpen((open) => (open && leftTab === tab ? false : true));
    setLeftTab(tab);
    setStickerOpen(false);
  }, [leftTab]);

  const openRight = useCallback(() => {
    setRightOpen((open) => !open);
    setStickerOpen(false);
  }, []);

  const selectFromCanvas = useCallback((value: Selection) => {
    setSelection(value);
    if (value && typeof window !== 'undefined' && window.matchMedia(WIDE).matches) {
      setRightOpen(true);
      setStickerOpen(false);
      setLeftOpen(false);
    }
  }, []);

  const selectAndEdit = useCallback((value: Selection) => {
    setSelection(value);
    setLeftOpen(false);
    setStickerOpen(false);
    setRightOpen(true);
  }, []);

  /* ── actions ────────────────────────────────────────────────────────────── */
  const applyPreset = async (id: string) => {
    const preset = PRESETS.find((item) => item.id === id);
    if (!preset || !spec) return;
    await persist(spec);
    /* A preset fills the frame being edited — it does not fork a new library
       entry on every click. */
    const next = { ...preset.build(), id: spec.id, updatedAt: new Date().toISOString() };
    await sf().primeAssets(next);
    setSpec(next);
    setSelection(null);
    say(t('toast.presetApplied', { name: lang === 'en' ? preset.labelEn : preset.label }));
    setLeftOpen(false);
  };

  /** The floating 초기화 button: this frame back to its default, shelf intact. */
  const resetFrame = async () => {
    if (!spec) return;
    const next = { ...PRESETS[0].build(), id: spec.id, name: spec.name, updatedAt: new Date().toISOString() };
    await sf().primeAssets(next);
    setSpec(next);
    setSelection(null);
    setDirty(true);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { void persist(next); }, 400);
    say(t('toast.frameReset'));
  };

  const openLibrary = async (id: string) => {
    if (!spec) return;
    if (spec.id === id) { setLeftOpen(false); return; }
    await persist(spec);
    const found = await sf().store.get(id);
    if (!found) { say(t('toast.frameNotFound'), 'warn'); return; }
    await sf().primeAssets(found);
    setSpec(found);
    setSelection(null);
    say(t('toast.frameOpened', { name: found.name }));
    setLeftOpen(false);
  };

  const newFrame = async () => {
    if (!spec) return;
    await persist(spec);
    const next = PRESETS[0].build();
    setSpec(next);
    setSelection(null);
    say(t('toast.created'));
    setLeftOpen(false);
  };

  const duplicate = async () => {
    if (!spec) return;
    const next = sf().touch(sf().clone(spec), { id: sf().uid('frame'), name: `${spec.name} ${lang === 'en' ? 'copy' : '복사'}` });
    next.updatedAt = new Date().toISOString();
    setSpec(next);
    await persist(next);
    say(t('toast.duplicated'));
  };

  const deleteFrame = async (id: string) => {
    if (!spec) return;
    await sf().store.remove(id);
    await refreshLibrary();
    if (id === spec.id) {
      const rows = await sf().store.list();
      const fallback = rows[0] ?? PRESETS[0].build();
      await sf().primeAssets(fallback);
      setSpec(fallback);
    }
    say(t('toast.deleted'));
  };

  const saveFile = useCallback(() => {
    if (!spec) return;
    const blob = new Blob([JSON.stringify(JSON.parse(sf().serialize(spec)), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${slug(spec.name)}.shutterframe.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    void persist(spec);
    say(translate(lang, 'toast.savedFile'));
  }, [spec, persist, say, lang]);

  const importJson = async (file: File) => {
    const text = await file.text();
    const result = sf().parse(text);
    if (!result.spec) {
      say(t('toast.importFailed', { reason: result.errors[0] ?? t('toast.unknownFormat') }), 'warn');
      return;
    }
    await sf().primeAssets(result.spec);
    setSpec(result.spec);
    setSelection(null);
    await persist(result.spec);
    say(t('toast.imported', { name: result.spec.name }));
  };

  const shareLink = (app: 'mynda' | 'shutterplate' | 'nordlys') => {
    if (!spec) return '';
    const base = app === 'mynda'
      ? `${window.location.origin}${import.meta.env.BASE_URL}`
      : app === 'shutterplate'
        ? 'https://hyangdan2.github.io/PKPilot0003/'
        : 'https://hyangdan2.github.io/PKPilot0011/';
    return sf().shareUrl(base, spec);
  };

  const copyLink = async () => {
    const link = shareLink('mynda');
    try {
      await navigator.clipboard.writeText(link);
      say(
        link.length > 7000 ? t('toast.linkCopiedLong') : t('toast.linkCopied'),
        link.length > 12000 ? 'warn' : 'ok',
      );
    } catch {
      window.prompt(t('toast.copyPrompt'), link);
    }
  };

  const openIn = (app: 'shutterplate' | 'nordlys') => {
    const link = shareLink(app);
    if (link.length > 12000) {
      say(t('toast.linkTooLong'), 'warn');
      return;
    }
    window.open(link, '_blank', 'noopener');
    if (link.length > 7000) say(t('toast.linkLong'), 'warn');
  };

  const addSlotFile = async (index: number, file: File) => {
    try {
      const loaded = await slotFromFile(file);
      setSlots((previous) => {
        const next = previous.slice();
        while (next.length < 4) next.push({ img: null, w: 0, h: 0 });
        next[index] = loaded;
        return next;
      });
      setSlotNames((previous) => {
        const next = previous.slice();
        while (next.length < 4) next.push(t('layers.slotEmpty'));
        next[index] = file.name;
        return next;
      });
      say(t('toast.slotFilled', { n: index + 1 }));
    } catch {
      say(t('toast.photoFailed'), 'warn');
    }
  };

  const addOverlay = async (file: File) => {
    if (!spec) return;
    const dataUrl = await readAsDataURL(file);
    if (!/^data:image\//i.test(dataUrl)) { say(t('toast.notImage'), 'warn'); return; }
    const next = sf().clone(spec);
    next.overlay = { dataUrl, layer: 'above', opacity: 1 };
    await sf().primeAssets(next);
    commit(next);
    say(t('toast.overlayAdded'));
  };

  const resetStudio = async () => {
    await sf().store.clear();
    const next = PRESETS[0].build();
    setSpec(next);
    setSelection(null);
    await refreshLibrary();
    say(t('toast.reset'));
  };

  /* ── the new touch tools: stickers, sprites, a background, text ──────────── */
  const addStripe = (preset: string) => {
    if (!spec) return;
    const chosen = PALETTES.find((item) => item.id === palette) ?? PALETTES[0];
    const next = sf().addSticker(spec, preset, { color: chosen.color, color2: chosen.color2 });
    const added = (next.stickers ?? [])[(next.stickers ?? []).length - 1];
    commit(next);
    setStickerOpen(false);
    if (added) {
      setSelection({ kind: 'sticker', id: added.id });
      if (window.matchMedia(WIDE).matches) setRightOpen(true);
    }
    say(t('toast.stickerAdded'));
  };

  const addSprite = async (file: File) => {
    if (!spec) return;
    try {
      const prepared = await prepareSprite(file);
      const next = sf().addSprite(spec, prepared.dataUrl, {
        w: Math.round(spec.canvas.width * 0.36),
        h: Math.round(spec.canvas.width * 0.36 * (prepared.h / Math.max(1, prepared.w))),
        label: file.name.slice(0, 24),
      });
      const added = (next.stickers ?? [])[(next.stickers ?? []).length - 1];
      await sf().primeAssets(next);
      commit(next);
      setStickerOpen(false);
      if (added) {
        setSelection({ kind: 'sticker', id: added.id });
        if (window.matchMedia(WIDE).matches) setRightOpen(true);
      }
      say(t('toast.spriteAdded'));
    } catch {
      say(t('toast.spriteFailed'), 'warn');
    }
  };

  const applyBackground = (dataUrl: string) => {
    if (!spec) return;
    const next = sf().clone(spec);
    next.canvas.backgroundImage = { dataUrl, opacity: 1 };
    next.updatedAt = new Date().toISOString();
    void sf().primeAssets(next).then(() => commit(next));
    setCropOpen(false);
    say(t('toast.backgroundSet'));
  };

  const removeBackground = () => {
    if (!spec) return;
    const next = sf().clone(spec);
    delete next.canvas.backgroundImage;
    commit(sf().touch(next, {}));
    setCropOpen(false);
    say(t('toast.backgroundRemoved'));
  };

  const addText = () => {
    if (!spec) return;
    const item = {
      id: sf().uid('text'),
      text: '{{caption}}',
      x: spec.canvas.width / 2,
      y: spec.canvas.height * 0.5,
      size: Math.max(12, Math.round(spec.canvas.width * 0.045)),
      family: 'sans' as const,
      weight: 600,
      align: 'center' as const,
      color: spec.canvas.light ? '#1b1a18' : '#f5f2e9',
      letterSpacing: 0,
      rotation: 0,
      visible: true,
    };
    const next = sf().touch(sf().clone(spec), { texts: [...spec.texts, item] });
    commit(next);
    setSelection({ kind: 'text', id: item.id });
    if (window.matchMedia(WIDE).matches) setRightOpen(true);
    say(t('toast.textAdded'));
  };

  /* ── the selected element: align, layer step, copy, delete, hide ─────────── */
  const selectedRef = selection && selection.kind !== 'overlay' ? layerRef(selection) : null;

  const align = (mode: AlignMode) => {
    if (!spec || !selectedRef) return;
    commit(sf().alignLayer(spec, selectedRef, mode));
  };

  const stepLayer = (ref: LayerRef, dir: 1 | -1) => {
    if (!spec) return;
    const next = sf().moveLayer(spec, ref, dir);
    if (next === spec) return;
    commit(next);
  };

  const duplicateSelection = () => {
    if (!spec || !selection) return;
    if (selection.kind === 'text') {
      const item = spec.texts.find((row) => row.id === selection.id);
      if (!item) return;
      const copy = { ...item, id: sf().uid('text'), x: item.x + 14, y: item.y + 14, z: undefined };
      commit(sf().touch(sf().clone(spec), { texts: [...spec.texts, copy] }));
      setSelection({ kind: 'text', id: copy.id });
      return;
    }
    if (selection.kind === 'sticker') {
      const item = (spec.stickers ?? []).find((row) => row.id === selection.id);
      if (!item) return;
      const copy = { ...item, id: sf().uid('sticker'), x: item.x + 18, y: item.y + 18, z: undefined };
      const next = sf().clone(spec);
      next.stickers = [...(next.stickers ?? []), copy];
      commit(sf().touch(next, {}));
      setSelection({ kind: 'sticker', id: copy.id });
    }
  };

  const deleteSelection = () => {
    if (!spec || !selectedRef) return;
    commit(sf().removeLayer(spec, selectedRef));
    setSelection(null);
    say(t('toast.selectionDeleted'));
  };

  const toggleVisible = (ref: LayerRef) => {
    if (!spec) return;
    if (ref.kind === 'cell') {
      say(t('toast.slotAlwaysPainted'), 'warn');
      return;
    }
    const next = sf().clone(spec);
    if (ref.kind === 'text') {
      next.texts = next.texts.map((item) => (item.id === ref.id ? { ...item, visible: item.visible === false } : item));
    } else if (ref.kind === 'sticker') {
      next.stickers = (next.stickers ?? []).map((item) => (item.id === ref.id ? { ...item, visible: item.visible === false } : item));
    } else if (ref.kind === 'emblem') {
      next.emblem = { ...next.emblem, enabled: !next.emblem.enabled };
    }
    commit(sf().touch(next, {}));
  };

  const replaceSlotPhoto = () => {
    if (selection?.kind !== 'cell') return;
    slotIndex.current = selection.index;
    slotInput.current?.click();
  };

  /* ── keyboard: Esc closes every layer, ⌘/Ctrl+S downloads the frame ─────── */
  const saveRef = useRef(saveFile);
  useEffect(() => { saveRef.current = saveFile; }, [saveFile]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setHelpOpen(false);
        setCropOpen(false);
        closeDrawers();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeDrawers]);

  if (!ready || !spec) {
    return (
      <I18nContext.Provider value={i18n}>
        <div className="boot">
          <span className="mark boot-mark" aria-hidden="true" />
          <p>{t('boot.opening')}</p>
        </div>
      </I18nContext.Provider>
    );
  }

  const selected = selection && selection.kind !== 'overlay' ? selection : null;
  const workspaceClass = `workspace${leftOpen ? ' left-open' : ''}${rightOpen ? ' right-open' : ''}${stickerOpen ? ' sticker-open' : ''}`;

  return (
    <I18nContext.Provider value={i18n}>
      <div className="app">
        <Header
          spec={spec}
          theme={theme}
          dirty={dirty}
          onTheme={() => setTheme(theme === 'navy' ? 'iris' : 'navy')}
          onHelp={() => setHelpOpen(true)}
          onImportJson={() => importInput.current?.click()}
          onReset={resetStudio}
        />

        <main className={workspaceClass}>
          <StageCanvas
            spec={spec}
            slots={slots}
            fields={fields}
            selection={selection}
            grid={grid}
            zoom={zoom}
            onScale={setScale}
            onSelect={selectFromCanvas}
            onSpecChange={commit}
            onSlotFile={addSlotFile}
            overlay={selected ? (
              <ContextToolbar
                selection={selected}
                onAlign={align}
                onLayer={(dir) => { if (selectedRef) stepLayer(selectedRef, dir); }}
                onDuplicate={duplicateSelection}
                onDelete={deleteSelection}
                onDetails={() => { setStickerOpen(false); setRightOpen(true); }}
                onCells={(kind) => {
                  const margin = Math.round(spec.canvas.width * (kind === '1x4' ? 0.06 : 0.05));
                  const gutter = Math.round(spec.canvas.width * (kind === '1x4' ? 0.03 : 0.022));
                  commit(sf().alignCells(spec, kind, margin, gutter));
                }}
                onReplacePhoto={replaceSlotPhoto}
              />
            ) : null}
          />

          <div
            className={`sheet-backdrop${leftOpen || rightOpen || stickerOpen ? ' show' : ''}`}
            onClick={closeDrawers}
            aria-hidden="true"
          />

          <LeftDrawer
            open={leftOpen}
            tab={leftTab}
            spec={spec}
            slots={slots}
            slotNames={slotNames}
            selection={selection}
            library={library}
            activeId={spec.id}
            onTab={setLeftTab}
            onClose={() => setLeftOpen(false)}
            onSelect={selectAndEdit}
            onPreset={applyPreset}
            onOpenLibrary={openLibrary}
            onNew={newFrame}
            onDuplicate={duplicate}
            onDeleteLibrary={deleteFrame}
            onToggleVisible={toggleVisible}
            onLayerZ={(ref, dir) => stepLayer(ref, dir)}
            onToggleOverlay={() => {
              if (!spec.overlay) return;
              const next = sf().clone(spec);
              if (next.overlay) next.overlay.opacity = next.overlay.opacity > 0 ? 0 : 1;
              commit(sf().touch(next, {}));
            }}
            onRemoveOverlay={() => {
              const next = sf().clone(spec);
              delete next.overlay;
              commit(sf().touch(next, {}));
            }}
            onBackground={() => { setLeftOpen(false); setCropOpen(true); }}
          />

          <RightDrawer
            open={rightOpen}
            spec={spec}
            selection={selection}
            onClose={() => setRightOpen(false)}
            onChange={commit}
            onOverlayFile={addOverlay}
            onRemoveOverlay={() => {
              const next = sf().clone(spec);
              delete next.overlay;
              commit(sf().touch(next, {}));
            }}
            onSlotFile={addSlotFile}
            onBackground={() => { setRightOpen(false); setCropOpen(true); }}
            onRemoveBackground={removeBackground}
          />

          <StickerDrawer
            open={stickerOpen}
            palette={palette}
            onPalette={setPalette}
            onClose={() => setStickerOpen(false)}
            onStripe={addStripe}
            onSprite={(file) => { void addSprite(file); }}
          />

          <FloatingDock
            leftOpen={leftOpen}
            leftTab={leftTab}
            rightOpen={rightOpen}
            hasSelection={!!selection}
            zoom={zoom}
            grid={grid}
            scale={scale}
            saving={saving}
            onLeft={openLeft}
            onProps={openRight}
            onZoom={setZoom}
            onGrid={setGrid}
            onSave={saveFile}
            onCopyLink={copyLink}
            onOpenIn={openIn}
            onAddSticker={() => { closeDrawers(); setStickerOpen(true); }}
            onAddSprite={() => spriteInput.current?.click()}
            onAddBackground={() => { closeDrawers(); setCropOpen(true); }}
            onAddText={addText}
            onReset={() => { void resetFrame(); }}
          />
        </main>

        <BackgroundCropModal
          open={cropOpen}
          frameW={spec.canvas.width}
          frameH={spec.canvas.height}
          current={spec.canvas.backgroundImage?.dataUrl}
          onClose={() => setCropOpen(false)}
          onApply={applyBackground}
          onRemove={removeBackground}
        />

        <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} onOpenIn={openIn} />

        {toast && <div className={`toast ${toast.tone}`} role="status">{toast.text}</div>}

        <input
          ref={importInput}
          type="file"
          accept=".json,application/json,*/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importJson(file);
            event.target.value = '';
          }}
        />
        <input
          ref={spriteInput}
          type="file"
          accept="image/png,image/webp,image/svg+xml"
          hidden
          data-testid="sprite-input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void addSprite(file);
            event.target.value = '';
          }}
        />
        <input
          ref={slotInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void addSlotFile(slotIndex.current, file);
            event.target.value = '';
          }}
        />
      </div>
    </I18nContext.Provider>
  );
}

function slug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-|-$/g, '') || 'mynda-frame';
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export { blankSpec };
