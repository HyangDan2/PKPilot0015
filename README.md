# Mynda Ljósa — HD2Lab 커스텀 4컷 프레임 스튜디오

**HD2Lab Mynda Ljósa** — Visual custom 4-cut frame studio for Shutterplate & Nordlys, 100% in-browser.

https://hyangdan2.github.io/PKPilot0015/

사진 네 장을 한 장으로 붙이는 4컷 프레임을 브라우저에서 직접 디자인하고, 그 결과를 `.shutterframe.json` 한 파일로 내보내
[Shutterplate](https://hyangdan2.github.io/PKPilot0003/)와 [Nordlys](https://hyangdan2.github.io/PKPilot0011/)에서 그대로 인화합니다.
업로드도 계정도 없습니다 — 모든 계산은 방문자의 브라우저 안에서 끝납니다.

## 무엇을 하는 앱인가

- **프리셋 5종**: 클래식 1×4 스트립 · 노르딕 2×2 그리드 · 다크 시네마 1×4(퍼포레이션) · 매거진 비대칭 콜라주 · 포토부스 PNG 오버레이.
- **위지윅 캔버스**: 슬롯 1~4를 직접 드래그하고 모서리 핸들로 크기를 바꿉니다. 스냅 가이드, 그리드, 맞춤/50%/100% 줌.
- **속성 패널**: 캔버스 프리셋과 직접 입력, 배경색·2색 그라디언트, 슬롯 좌표/모서리, `1×4 정렬`·`2×2 정렬`, 퍼포레이션, 투명 PNG 오버레이(사진 위/아래), 텍스트 + `{{date}}`·`{{camera}}`·`{{film}}` 변수, 엠블럼.
- **보관함**: IndexedDB(`hd2_custom_frames_v1`)에 자동 저장. 새로 만들기 · 복제 · 삭제.
- **공유**: `lz-string`으로 압축한 `#frame=` 링크 한 번으로 Shutterplate·Nordlys에서 즉시 임포트.

## `.shutterframe.json` v1

세 앱이 100% 같은 코드(`public/shutterframe.js`)로 읽는 순수 JSON 스펙입니다.

```json
{
  "schema": "shutterframe/v1",
  "id": "frame-…", "name": "Classic Strip", "updatedAt": "2026-11-21T…",
  "canvas": { "width": 600, "height": 1800, "background": "#f4f1ea", "light": true },
  "perforation": { "enabled": false, "style": "side", "color": "#e9e4d8" },
  "cells": [{ "x": 36, "y": 96, "w": 528, "h": 380, "radius": 4 }, "…4개"],
  "overlay": { "dataUrl": "data:image/png;…", "layer": "above", "opacity": 1 },
  "texts": [{ "id": "t1", "text": "{{date}}", "x": 300, "y": 1740, "size": 20,
              "family": "sans", "weight": 500, "align": "center", "color": "#6b635a" }],
  "emblem": { "enabled": true, "x": 300, "y": 1700, "maxW": 220, "maxH": 40, "align": "center", "mode": "auto" }
}
```

치환 변수: `{{date}}` `{{camera}}` `{{lens}}` `{{film}}` `{{title}}` `{{caption}}` `{{shutter}}` `{{iso}}` `{{aperture}}`.

## 개발

```bash
npm install
npm run dev        # http://localhost:5175/PKPilot0015/
npm test           # vitest (스펙 검증 · 변수 · 정렬 · 공유 코덱 · 레이아웃)
npm run build      # tsc --noEmit && vite build
npm run brand      # favicon · 아이콘 · OG 카드 재생성
```

- Vite + React 19 + TypeScript, `base: '/PKPilot0015/'`.
- 공용 엔진: `public/shutterframe.js` (세 저장소가 같은 파일을 씁니다).

## 구성

| 경로 | 역할 |
| --- | --- |
| `public/shutterframe.js` | 스펙 검증 · 페인터 · lz-string 공유 코덱 · IndexedDB 보관함 |
| `src/spec/shutterframe.ts` | 엔진의 TypeScript 타입 |
| `src/editor/presets.ts` | 프리셋 5종과 데모 메타데이터 |
| `src/components/StageCanvas.tsx` | 드래그 · 리사이즈 · 스냅 · 줌 캔버스 |
| `src/components/RightPanel.tsx` | 프레임 · 슬롯 · 텍스트 · 엠블럼 · 퍼포레이션 · 오버레이 |
| `tools/generate_brand_assets.py` | favicon/아이콘/manifest/OG 카드 생성 |

## 링크

- HD2Lab Web-HQ — https://hyangdan2.github.io/
- ApplicationHub — https://hyangdan2.github.io/ApplicationHub/
- Shutterplate — https://hyangdan2.github.io/PKPilot0003/
- Nordlys — https://hyangdan2.github.io/PKPilot0011/
