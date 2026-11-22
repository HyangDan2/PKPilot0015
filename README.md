# FrameBuilder — HD2Lab 커스텀 4컷 프레임 스튜디오

**HD2Lab FrameBuilder** — Visual custom 4-cut frame studio for Shutterplate & Nordlys, 100% in-browser.

https://hyangdan2.github.io/PKPilot0015/

사진 네 장을 한 장으로 붙이는 4컷 프레임을 브라우저에서 직접 디자인하고, 그 결과를 `.shutterframe.json` 한 파일로 내보내
[Shutterplate](https://hyangdan2.github.io/PKPilot0003/)와 [Nordlys](https://hyangdan2.github.io/PKPilot0011/)에서 그대로 인화합니다.
업로드도 계정도 없습니다 — 모든 계산은 방문자의 브라우저 안에서 끝납니다.

## 화면 구조 — 캔버스에 집중하는 HD2Lab 셸

- **상단 바는 네 가지뿐**: 시그니처 듀얼 스큐 로고(`.mark`)와 `HD2Lab | FrameBuilder`, `KO | EN`, 테마 토글, `⋮` 메뉴.
- **기본 테마는 Navy & Lavender(다크)**, 토글로 Soft Iris(라이트)로 전환합니다. 선택은 브라우저에 기억됩니다.
- **좌우 고정 레일 없음**: 프레임이 화면 전체를 차지하고, 편집 도구는 필요할 때만 떠오릅니다.
  - ① `프리셋 · 보관함` ② `레이어 · 순서` → 왼쪽 드로워
  - ③ `프레임 · 속성 편집` → 오른쪽 드로워 (캔버스에서 요소를 탭하면 자동으로 열립니다)
  - ④ `줌(맞춤/50/100) · 그리드` → 하단 중앙 캡슐
  - ⑤ `저장 · 링크 복사 · Shutterplate · Nordlys` → 우하단 칩
- **1024px 미만에서는 같은 드로워가 바텀 시트**로 열려 캔버스를 가리지 않고 손끝에 붙습니다.
- **KO \| EN**: 헤더·플로팅 버튼·드로워·모달·안내 문구·토스트까지 모든 문구가 한국어 존댓말과 영어로 전환됩니다.

## 손끝의 약속 — 터치 제스처

- **한 손가락 짧은 탭**: 누른 자리의 슬롯 · 텍스트 · 스티커 · 로고가 선택되고, 빈 곳을 탭하면 선택이 풀립니다.
- **한 손가락 드래그**: 이미 선택된 요소 위에서 끌면 그 요소가 움직이고(스냅 가이드가 가장자리를 맞춰 줍니다),
  선택되지 않은 요소나 빈 곳을 끌면 화면 자체가 이동합니다.
- **두 손가락**: 0.15초 안에 두 손가락이 닿으면 **언제나 화면 확대·축소**입니다. 사진을 키우려다 사진이 커지는 일이 없습니다.
- **선택된 요소를 0.15초 이상 잡은 뒤 두 번째 손가락**을 대면 그 요소의 크기와 각도를 조절합니다. 요소의 모서리 손잡이와 위쪽 회전 손잡이는 언제나 같은 일을 합니다.

## 무엇을 하는 앱인가

- **프리셋 5종**: 클래식 1×4 스트립 · 노르딕 2×2 그리드 · 다크 시네마 1×4(퍼포레이션) · 매거진 비대칭 콜라주 · 포토부스 PNG 오버레이.
- **위지윅 캔버스**: 슬롯 1~4를 직접 드래그하고 모서리 핸들로 크기를 바꿉니다. 스냅 가이드, 그리드, 맞춤/50%/100% 줌, 자유 X·Y 이동.
- **텍스트는 전부 레이어**: 프리셋의 `FRAMEBUILDER` · `HD2LAB · FRAMEBUILDER` 같은 기본 문구도 이미지에 박혀 있지 않고 텍스트 레이어로 올라와 있어, 고치고 지우고 다시 넣을 수 있습니다.
- **로고 레이어**: HD2Lab 정식 듀얼 스큐 마크와 메이커 10종(Sony · Canon · Nikon · Fujifilm · Samsung · Leica · Hasselblad · Apple · Lumix · OM System)을 Canvas `Path2D`로 직접 그립니다. 로고 타입, **브랜드 컬러 / All Black(단색)**, 정렬·크기·회전을 속성 패널에서 조절하고, 레이어 목록에서 지우거나 다시 넣을 수 있습니다.
- **속성 패널**: 선택한 요소의 속성이 먼저, 그 아래 프레임 이름·캔버스 프리셋·배경색·2색 그라디언트·로고·퍼포레이션·투명 PNG 오버레이(사진 위/아래)·텍스트 `{{변수}}`.
- **보관함**: IndexedDB(`hd2_custom_frames_v1`)에 자동 저장. 새로 만들기 · 복제 · 삭제.
- **공유**: `lz-string`으로 압축한 `#frame=` 링크 한 번으로 Shutterplate·Nordlys에서 즉시 임포트.
- **도움말**: `⋮` → `도움말`에서 캔버스 사용법, 단축키(`Esc`, `⌘/Ctrl+S`), 저장·공유 방식을 확인합니다.

## `.shutterframe.json` v1

세 앱이 100% 같은 코드(`public/shutterframe.js`)로 읽는 순수 JSON 스펙입니다.

```json
{
  "schema": "shutterframe/v1",
  "id": "frame-…", "name": "Classic Strip", "updatedAt": "2026-11-22T…",
  "canvas": { "width": 600, "height": 1800, "background": "#f4f1ea", "light": true },
  "perforation": { "enabled": false, "style": "side", "color": "#e9e4d8" },
  "cells": [{ "x": 36, "y": 96, "w": 528, "h": 380, "radius": 4 }, "…4개"],
  "overlay": { "dataUrl": "data:image/png;…", "layer": "above", "opacity": 1 },
  "texts": [{ "id": "t1", "text": "{{date}}", "x": 300, "y": 1740, "size": 20,
              "family": "sans", "weight": 500, "align": "center", "color": "#6b635a" }],
  "emblem": { "enabled": true, "id": "hd2lab", "mono": false, "x": 300, "y": 1700,
              "maxW": 220, "maxH": 40, "align": "center", "mode": "auto" }
}
```

치환 변수: `{{date}}` `{{camera}}` `{{lens}}` `{{film}}` `{{title}}` `{{caption}}` `{{shutter}}` `{{iso}}` `{{aperture}}`.

`emblem.id`는 `hd2lab` · `sony` · `canon` · `nikon` · `fujifilm` · `samsung` · `leica` · `hasselblad` · `apple` · `lumix` · `omsystem` 중 하나이고, `emblem.mono`가 `true`면 로고 전체를 한 가지 잉크(All Black)로 인쇄합니다. `id`와 `mono`가 없는 예전 문서는 HD2Lab 마크의 브랜드 컬러로 그려집니다. `enabled`가 `false`이면 로고는 레이어 목록과 판면 양쪽에서 빠집니다.

## 개발

```bash
npm install
npm run dev        # http://localhost:5175/PKPilot0015/
npm test           # vitest — 스펙 · 변수 · 정렬 · 공유 코덱 · 레이아웃 · i18n · 셸
npm run test:e2e   # playwright — 데스크톱 1440×900 · 모바일 390×844 실브라우저 검증
npm run build      # tsc --noEmit && vite build
npm run brand      # favicon · 아이콘 · OG 카드 재생성
```

- Vite + React 19 + TypeScript, `base: '/PKPilot0015/'`.
- 공용 엔진: `public/shutterframe.js` (세 저장소가 같은 파일을 씁니다).
- E2E는 `npm run build` 뒤 `vite preview`가 서빙하는 `dist/`를 실제 브라우저로 확인합니다 — 다크 기본 테마, `KO | EN` 전환, 플로팅 버튼 5종, 드로워/바텀 시트, 줌·그리드, 로고 타입·컬러 전환, 터치 제스처, 저장 파일, `#frame=` 딥링크, 콘솔 오류 0건, 가로 넘침 0px.

## 구성

| 경로 | 역할 |
| --- | --- |
| `public/shutterframe.js` | 스펙 검증 · 페인터(로고 `Path2D`) · lz-string 공유 코덱 · IndexedDB 보관함 |
| `src/spec/shutterframe.ts` | 엔진의 TypeScript 타입 |
| `src/i18n.tsx` | 한국어 존댓말 · 영어 사전과 `useI18n()` |
| `src/components/Header.tsx` | 로고 · `KO \| EN` · 테마 · `⋮` |
| `src/components/FloatingDock.tsx` | 플로팅 버튼 5종과 줌 캡슐 |
| `src/components/Drawer.tsx` | 좌우 드로워 / 모바일 바텀 시트 셸 |
| `src/components/LeftDrawer.tsx` | 프리셋 · 보관함 · 레이어 |
| `src/components/RightPanel.tsx` | 프레임 · 슬롯 · 텍스트 · 로고 · 퍼포레이션 · 오버레이 |
| `src/components/StageCanvas.tsx` | 탭 · 드래그 · 리사이즈 · 핀치 · 스냅 · 줌 캔버스 |
| `docs/API.md` | 엔진 API와 `.shutterframe.json` 규격 |
| `tests/e2e/` | Playwright 데스크톱 · 모바일 시나리오 |
| `tools/generate_brand_assets.py` | favicon/아이콘/manifest/OG 카드 생성 |

## 링크

- HD2Lab Web-HQ — https://hyangdan2.github.io/
- ApplicationHub — https://hyangdan2.github.io/ApplicationHub/
- Shutterplate — https://hyangdan2.github.io/PKPilot0003/
- Nordlys — https://hyangdan2.github.io/PKPilot0011/
