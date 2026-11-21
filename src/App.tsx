import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sf, loadEngine, type FrameFields, type FrameSlot, type ShutterFrameSpec } from './spec/shutterframe';
import { Header } from './components/Header';
import { LeftDrawer, type LeftTab, type LibraryItem } from './components/LeftDrawer';
import { StageCanvas } from './components/StageCanvas';
import { RightDrawer } from './components/RightPanel';
import { FloatingDock } from './components/FloatingDock';
import { HelpModal } from './components/HelpModal';
import { PRESETS, DEMO_FIELDS, blankSpec } from './editor/presets';
import { loadDemoSlots, slotFromFile } from './editor/photos';
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
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null);
  const importInput = useRef<HTMLInputElement | null>(null);
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
        const rows = await sf().store.list();
        initial = rows.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0] ?? PRESETS[0].build();
        if (!rows.length && initial.overlay) await sf().primeOverlay(initial);
      }
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
      setSpec(incoming);
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
  }, []);

  const openLeft = useCallback((tab: LeftTab) => {
    setLeftOpen((open) => (open && leftTab === tab ? false : true));
    setLeftTab(tab);
  }, [leftTab]);

  const selectFromCanvas = useCallback((value: Selection) => {
    setSelection(value);
    if (value && typeof window !== 'undefined' && window.matchMedia(WIDE).matches) setRightOpen(true);
  }, []);

  const selectAndEdit = useCallback((value: Selection) => {
    setSelection(value);
    setLeftOpen(false);
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
    if (next.overlay) await sf().primeOverlay(next);
    setSpec(next);
    setSelection(null);
    say(t('toast.presetApplied', { name: lang === 'en' ? preset.labelEn : preset.label }));
    setLeftOpen(false);
  };

  const openLibrary = async (id: string) => {
    if (!spec) return;
    if (spec.id === id) { setLeftOpen(false); return; }
    await persist(spec);
    const found = await sf().store.get(id);
    if (!found) { say(t('toast.frameNotFound'), 'warn'); return; }
    if (found.overlay) await sf().primeOverlay(found);
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
      if (fallback.overlay) await sf().primeOverlay(fallback);
      setSpec(fallback);
    }
    say(t('toast.deleted'));
  };

  const saveFile = useCallback(() => {
    if (!spec) return;
    const blob = new Blob([JSON.stringify(spec, null, 2)], { type: 'application/json' });
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
    if (result.spec.overlay) await sf().primeOverlay(result.spec);
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
    await sf().primeOverlay(next);
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

  /* ── keyboard: Esc closes every layer, ⌘/Ctrl+S downloads the frame ─────── */
  const saveRef = useRef(saveFile);
  useEffect(() => { saveRef.current = saveFile; }, [saveFile]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setHelpOpen(false);
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

        <main className={`workspace${leftOpen ? ' left-open' : ''}${rightOpen ? ' right-open' : ''}`}>
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
          />

          <div
            className={`sheet-backdrop${leftOpen || rightOpen ? ' show' : ''}`}
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
            onToggleText={(id) => commit(sf().touch(sf().clone(spec), {
              texts: spec.texts.map((item) => (item.id === id ? { ...item, visible: item.visible === false } : item)),
            }))}
            onMoveText={(id, delta) => {
              const items = spec.texts.slice();
              const at = items.findIndex((item) => item.id === id);
              const to = at + delta;
              if (at < 0 || to < 0 || to >= items.length) return;
              const [moved] = items.splice(at, 1);
              items.splice(to, 0, moved);
              commit(sf().touch(sf().clone(spec), { texts: items }));
            }}
            onToggleOverlay={() => {
              const active = spec.overlay;
              if (!active) return;
              const next = sf().clone(spec);
              next.overlay = { dataUrl: active.dataUrl, layer: active.layer, opacity: active.opacity > 0 ? 0 : 1 };
              commit(sf().touch(next, {}));
            }}
            onToggleEmblem={() => {
              const next = sf().clone(spec);
              next.emblem.enabled = !next.emblem.enabled;
              commit(sf().touch(next, {}));
            }}
            onRemoveOverlay={() => {
              const next = sf().clone(spec);
              delete next.overlay;
              commit(sf().touch(next, {}));
            }}
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
            onProps={() => setRightOpen((open) => !open)}
            onZoom={setZoom}
            onGrid={setGrid}
            onSave={saveFile}
            onCopyLink={copyLink}
            onOpenIn={openIn}
          />
        </main>

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
