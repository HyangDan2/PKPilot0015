import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sf, loadEngine, type FrameFields, type FrameSlot, type ShutterFrameSpec } from './spec/shutterframe';
import { Header } from './components/Header';
import { LeftRail, type LibraryItem } from './components/LeftRail';
import { StageCanvas } from './components/StageCanvas';
import { RightPanel } from './components/RightPanel';
import { Icon } from './components/Icons';
import { PRESETS, DEMO_FIELDS, blankSpec } from './editor/presets';
import { loadDemoSlots, slotFromFile } from './editor/photos';
import type { Selection } from './editor/selection';

const THEME_KEY = 'mynda.theme';

export default function App() {
  const [ready, setReady] = useState(false);
  const [spec, setSpec] = useState<ShutterFrameSpec | null>(null);
  const [slots, setSlots] = useState<FrameSlot[]>([]);
  const [slotNames, setSlotNames] = useState<string[]>(['Fjord Dawn', 'Pine Ridge', 'Snow Field', 'Midnight Sun']);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [theme, setTheme] = useState<'iris' | 'navy'>(() => (localStorage.getItem(THEME_KEY) === 'navy' ? 'navy' : 'iris'));
  const [grid, setGrid] = useState(false);
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null);
  const [tab, setTab] = useState<'frames' | 'stage' | 'props'>('stage');
  const importInput = useRef<HTMLInputElement | null>(null);
  const saveTimer = useRef<number>(0);
  const toastTimer = useRef<number>(0);
  const fields = useMemo<FrameFields>(() => ({ ...DEMO_FIELDS }), []);

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
        say('링크에서 프레임을 불러왔습니다.');
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

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  /* ── autosave ───────────────────────────────────────────────────────────── */
  const persist = useCallback(async (next: ShutterFrameSpec, quiet = true) => {
    try {
      setSaving(true);
      await sf().store.put(next);
      await refreshLibrary();
      setDirty(false);
      if (!quiet) say('저장했습니다 · 내 보관함');
    } catch {
      if (!quiet) say('저장하지 못했습니다.', 'warn');
    } finally {
      setSaving(false);
    }
  }, [refreshLibrary, say]);

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

  /* ── actions ────────────────────────────────────────────────────────────── */
  const applyPreset = async (id: string) => {
    const preset = PRESETS.find((item) => item.id === id);
    if (!preset || !spec) return;
    await persist(spec);
    const next = preset.build();
    if (next.overlay) await sf().primeOverlay(next);
    setSpec(next);
    setSelection(null);
    say(`${preset.label} 프리셋을 적용했습니다.`);
    setTab('stage');
  };

  const openLibrary = async (id: string) => {
    if (!spec) return;
    if (spec.id === id) return;
    await persist(spec);
    const found = await sf().store.get(id);
    if (!found) { say('프레임을 찾지 못했습니다.', 'warn'); return; }
    if (found.overlay) await sf().primeOverlay(found);
    setSpec(found);
    setSelection(null);
    say(`'${found.name}' 프레임을 열었습니다.`);
    setTab('stage');
  };

  const newFrame = async () => {
    if (!spec) return;
    await persist(spec);
    const next = PRESETS[0].build();
    setSpec(next);
    setSelection(null);
    say('새 프레임을 만들었습니다.');
  };

  const duplicate = async () => {
    if (!spec) return;
    const next = sf().touch(sf().clone(spec), { id: sf().uid('frame'), name: `${spec.name} 복사` });
    next.updatedAt = new Date().toISOString();
    setSpec(next);
    await persist(next);
    say('프레임을 복제했습니다.');
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
    say('보관함에서 삭제했습니다.');
  };

  const saveFile = () => {
    if (!spec) return;
    const blob = new Blob([JSON.stringify(spec, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${slug(spec.name)}.shutterframe.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    void persist(spec);
    say('저장했습니다 · 보관함 + .shutterframe.json');
  };

  const importJson = async (file: File) => {
    const text = await file.text();
    const result = sf().parse(text);
    if (!result.spec) { say(`불러오지 못했습니다: ${result.errors[0] ?? '알 수 없는 형식'}`, 'warn'); return; }
    if (result.spec.overlay) await sf().primeOverlay(result.spec);
    setSpec(result.spec);
    setSelection(null);
    await persist(result.spec);
    say(`'${result.spec.name}' 프레임을 불러왔습니다.`);
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
      say(link.length > 7000 ? '링크를 복사했습니다 — PNG가 커서 길이가 깁니다. 파일 저장도 함께 쓰세요.' : '링크를 복사했습니다.', link.length > 12000 ? 'warn' : 'ok');
    } catch {
      window.prompt('아래 링크를 복사하세요', link);
    }
  };

  const openIn = (app: 'shutterplate' | 'nordlys') => {
    const link = shareLink(app);
    if (link.length > 12000) {
      say('PNG가 커서 링크가 너무 깁니다. 프레임을 파일로 저장한 뒤 그 앱에서 불러오세요.', 'warn');
      return;
    }
    window.open(link, '_blank', 'noopener');
    if (link.length > 7000) say('링크가 깁니다 — 상대 앱에서 임포트되지 않으면 파일로 저장해 불러오세요.', 'warn');
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
        while (next.length < 4) next.push('빈 칸');
        next[index] = file.name;
        return next;
      });
      say(`슬롯 ${index + 1}에 내 사진을 넣었습니다.`);
    } catch {
      say('사진을 읽지 못했습니다.', 'warn');
    }
  };

  const addOverlay = async (file: File) => {
    if (!spec) return;
    const dataUrl = await readAsDataURL(file);
    if (!/^data:image\//i.test(dataUrl)) { say('이미지 파일이 아닙니다.', 'warn'); return; }
    const next = sf().clone(spec);
    next.overlay = { dataUrl, layer: 'above', opacity: 1 };
    await sf().primeOverlay(next);
    commit(next);
    say('오버레이를 올렸습니다.');
  };

  if (!ready || !spec) {
    return (
      <div className="boot">
        <div className="boot-mark" />
        <p>Mynda Ljósa — 프레임 스튜디오를 여는 중…</p>
      </div>
    );
  }

  const resetStudio = async () => {
    await sf().store.clear();
    const next = PRESETS[0].build();
    setSpec(next);
    setSelection(null);
    await refreshLibrary();
    say('내 프레임 보관함을 초기화했습니다.');
  };

  return (
    <div className="app">
      <Header
        spec={spec}
        theme={theme}
        saving={saving}
        dirty={dirty}
        onTheme={() => setTheme(theme === 'iris' ? 'navy' : 'iris')}
        onPresets={() => setTab('frames')}
        onImportJson={() => importInput.current?.click()}
        onSave={saveFile}
        onCopyLink={copyLink}
        onOpenIn={openIn}
        onReset={resetStudio}
      />
      <main className={`workspace tab-${tab}`}>
        <LeftRail
          spec={spec}
          slots={slots}
          slotNames={slotNames}
          selection={selection}
          library={library}
          activeId={spec.id}
          onSelect={(value) => { setSelection(value); setTab('props'); }}
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
            if (!spec.overlay) return;
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
        <StageCanvas
          spec={spec}
          slots={slots}
          fields={fields}
          selection={selection}
          grid={grid}
          zoom={zoom}
          onZoom={setZoom}
          onGrid={setGrid}
          onSelect={setSelection}
          onSpecChange={commit}
          onSlotFile={addSlotFile}
        />
        <RightPanel
          spec={spec}
          selection={selection}
          onChange={commit}
          onOverlayFile={addOverlay}
          onRemoveOverlay={() => {
            const next = sf().clone(spec);
            delete next.overlay;
            commit(sf().touch(next, {}));
          }}
          onSlotFile={addSlotFile}
        />
      </main>
      <nav className="tabbar" aria-label="패널 선택">
        <button type="button" className={tab === 'frames' ? 'on' : ''} onClick={() => setTab('frames')}><Icon name="folder" size={16} />프리셋</button>
        <button type="button" className={tab === 'stage' ? 'on' : ''} onClick={() => setTab('stage')}><Icon name="image" size={16} />캔버스</button>
        <button type="button" className={tab === 'props' ? 'on' : ''} onClick={() => setTab('props')}><Icon name="sliders" size={16} />속성</button>
      </nav>
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
