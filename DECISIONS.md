# NPC World Tracker PoC — Handoff

Last reviewed: 2026-09-06

> **현재 재개 지점 — 2026-09-06:** 태현의 P0 승인 후 v0.4 P1 구현과 모의 회귀 검증 23개를 마쳤다. [PR #1](https://github.com/amamirugi/npc-world-tracker-poc/pull/1)의 [최신 handoff](https://github.com/amamirugi/npc-world-tracker-poc/blob/work/v0.4-backstage/DECISIONS.md)를 읽고 **실제 RisuAI + Hayaku 인수 검증(P2)**부터 이어간다. 아래 본문은 재개 당시 v0.3.3 기준 기록이며, P0/P1을 반복하지 않는다. main의 플러그인 JS는 아직 v0.3.3이고 v0.4 업데이트 배포·실환경 설치는 수행하지 않았다.

This is the project handoff document for `amamirugi/npc-world-tracker-poc`. It is written for an AI instance that has no access to the conversation that produced these decisions.

## 확정된 결정

### 1. 프로젝트를 기존 PoC에서 재개한다

- 구현 베이스는 새 플러그인을 처음부터 만드는 것이 아니라 현재 리포의 `npc-world-tracker-poc.js`다.
- 현재 코드 기준 버전은 `0.3.3`이다.
- 기존 PoC의 핵심 철학인 **보조 모델이 메인 모델과 분리된 상태에서 장면 밖 NPC를 독립적으로 추적한다**는 구조를 유지한다.
- KoCoEMon은 대체 베이스가 아니라 **참조 구현**으로 취급한다. 특히 UI/관제, attention scheduling, branch-aware ledger, offscreen progression에서 좋은 아이디어를 선별해 가져온다.

### 2. 목표는 "순수 백스테이지 NPC/world tracker"다

최종 플러그인의 책임은 다음과 같다.

- 장면 밖 NPC와 필요 시 world/faction driver의 현재 위치·목표·행동·압력·다음 판단 시점을 보조 모델이 추적한다.
- NPC 추적용 lore 원문과 상세 상태는 기본적으로 보조 모델 내부에서만 소비한다.
- 메인 모델에는 전체 NPC 원장이나 관련 lore 원문을 상시 전달하지 않는다.
- 백스테이지에서 실제로 의미 있는 변화가 생기거나, 메인 모델이 앞으로의 전개를 설계하는 데 유용한 최소 신호가 있을 때만 선별 정보를 전달한다.
- 메인 모델이 NPC 전체 상태를 계속 읽어야 하는 구조는 이 프로젝트의 목표가 아니다.

### 3. Hayaku와 책임을 분리한다

Hayaku와 겹치는 장기기억/연속성 기능을 새 tracker가 중복 구현하지 않는다.

Hayaku가 맡는 영역:

- 과거 사건과 장기 회상
- 분기 인식 기억
- 현재/과거 상태의 supersession과 continuity
- 장기 검색과 실제 대화 근거 회수

NPC World Tracker가 맡는 영역:

- 현재 장면 밖 NPC의 위치와 활동
- 현재의 actionable goal / current action / pressure
- 다음 판단 시점과 wake condition
- 아직 현재 장면에 도달하지 않은 장면 밖 결과
- 행동 결과·정보·NPC가 현재 장면에 언제 영향을 주는지에 대한 백스테이지 진행

과거 사건 전체, 일반 관계 역사, 장기 narrative memory를 tracker 내부에 별도 정본처럼 축적하지 않는다.

### 4. KoCoEMon의 main-context 설계는 그대로 복제하지 않는다

KoCoEMon v1.15.14는 현재 장면 외 NPC/world를 Hot/Warm/Cold로 추적하고, 관련 상태·관계·사실·지식·선별 lore 원문을 메인 모델의 동적 system context에도 주입한다.

이 방식은 living-world 전개에는 장점이 있지만 다음 이유로 이 프로젝트에는 그대로 적용하지 않는다.

- 키워드 트리거 lore의 토큰 절약 효과를 일부 상쇄할 수 있다.
- Hayaku retrieval과 current-state 정보가 중복될 수 있다.
- 다인물 봇에서 메인 컨텍스트가 커지고 신호 대 잡음비가 나빠질 수 있다.

KoCoEMon에서 재사용할 것은 기능적 아이디어와 UI/스케줄링 패턴이며, 전체 world-state main injection은 아니다.

## 기각된 대안

### KoCoEMon을 그대로 Hayaku와 상시 병용

기각 이유:

- KoCoEMon과 Hayaku는 목적은 다르지만 current-state 구조화 계층이 크게 겹친다.
- KoCoEMon은 tracked NPC/world 상태뿐 아니라 필요한 lore evidence까지 메인 모델에 전달할 수 있다.
- 단순 NPC 추적 목적에는 메인 입력 토큰 비용과 중복 상태 표현이 과하다.

다만 대규모 living-world RP에서 KoCoEMon 자체가 유용하지 않다는 뜻은 아니다. 이 프로젝트의 목표와 맞지 않아 기본 설계로 채택하지 않는 것이다.

### 완전한 이벤트 전용 블랙박스

형태:

`보조 모델이 NPC를 완전히 비공개로 추적 → 실제 사건이 현재 장면에 도달할 때만 메인에 통보`

이 방식만 사용하면 메인 모델이 장면 밖 흐름을 전혀 예측할 수 없어, 사건이 생긴 뒤 반응만 하는 수동적인 전개가 될 수 있다. 따라서 최종 설계는 **전체 원장을 숨기되 메인 모델의 능동적 서사 설계에 필요한 최소한의 미래지향 신호를 줄 수 있어야 한다.**

## 실행 상태

### 현재 리포

- Repository: `amamirugi/npc-world-tracker-poc`
- Main implementation: `npc-world-tracker-poc.js`
- 현재 구현 버전: `0.3.3`
- 이 handoff 작성 전 main 파일 blob SHA: `04f77dbaba83a1321c843f50f9a1161f52f70556`
- 기존 리포에는 이 문서 작성 전 `CHANGELOG.md`와 `npc-world-tracker-poc.js`만 있었다.

### v0.3.3에서 이미 구현된 핵심

현재 PoC는 이미 다음 구조를 갖고 있다.

- 메인 응답 이후 별도 보조 모델 호출로 NPC 상태를 갱신한다.
- 추적 대상 NPC마다 lorebook 원문을 `LORE_DEFINITION`으로 보조 모델에 제공한다.
- 상태 필드:
  - `story_time`
  - `location`
  - `goal`
  - `activity`
  - `company`
  - `next_action`
  - `status`
  - `certainty` (`explicit` / `inferred` / `simulated`)
- 보조 모델은 현재 코드에서 `CURRENT_STATE`의 모든 NPC를 매 호출 한 번씩 평가한다.
- sparse evidence에서는 큰 사건을 발명하지 않고, 되돌릴 수 있는 저위험 시뮬레이션만 허용한다.
- event에는 `severity`, `causal_relevance`, `known_by`, `npc_ids`가 있다.
- 현재 기본값은 `injectionInterval: 5`, `majorThreshold: 3`이다.
- 메인 주입 시 현재 `buildInjection()`은 최대 16명의 NPC 상태, 최근 event 최대 6개, latest brief를 묶어 system message로 전달한다.
- severity가 threshold 이상인 새 event가 생기면 `pendingMajor`가 켜져 다음 요청의 main injection을 앞당긴다.
- dashboard/UI, 설정, 수동 재평가, 상태 저장, tracking queue 등 PoC 기반 기능이 이미 존재한다.

### 현재 구조에서 가장 먼저 바꿀 부분

현재 `buildInjection()`의 full-state periodic synchronization은 새 목표와 맞지 않는다.

현재:

`보조 추적 → NPC 전체 상태 유지 → N턴/major event마다 NPC 원장 묶음을 Main에 주입`

목표:

`보조 추적 → 백스테이지 상태 유지 → 전달 가치가 있는 최소 신호만 Main에 projection`

또한 모든 NPC를 매 턴 보조 모델에서 전수 평가하는 현재 규칙은 NPC 수가 커질수록 보조 호출 비용이 증가하므로 attention scheduler 도입 대상이다.

## Work에서 먼저 읽을 참조

작업을 시작할 때 아래 순서로 실제 코드를 확인한다.

1. 이 `DECISIONS.md`
2. `npc-world-tracker-poc.js` v0.3.3 전체
3. 필요 시 `CHANGELOG.md`
4. 참조 구현으로 사용자가 제공한 KoCoEMon v1.15.14 코드

KoCoEMon은 설계 참조일 뿐 source of truth가 아니다. 코드를 복사하기 전에 필요한 개념을 현재 PoC 구조에 맞춰 최소 범위로 이식한다.

## 이어받을 다음 작업

### P0 — v0.4 설계 확정

코드를 바로 크게 수정하기 전에 다음 경계를 짧은 설계로 확정한다.

1. **Backstage state schema**
   - v0.3.3 필드 중 유지/삭제/추가할 것
   - 최소 후보: location, objective/goal, currentAction, pressure, constraints, nextDecisionWindow, wakeConditions, certainty

2. **Attention scheduler**
   - KoCoEMon의 Hot / Warm / Cold / Archived 개념을 참고하되 PoC에 맞게 단순화
   - Hot: 이번 턴 반드시 평가
   - Warm: 순환 평가
   - Cold: wake condition 전까지 보존
   - Archived: 종료/비활성

3. **Main projection contract**
   - 전체 NPC 상태와 lore 원문은 금지
   - 메인에게 전달 가능한 최소 정보의 종류와 수명 정의
   - 현재 유력 후보는 아래 두 층이지만 아직 세부 계약은 확정하지 않았다.
     - `soft`: 아직 발생하지 않은 서사적 가능성/접점. 정사가 아니며 메인이 활용하거나 무시할 수 있음.
     - `hard`: 백스테이지에서 실제로 성립했고 현재 장면에 도달한 사건/정보. 현재 전개가 알아야 하는 정사.

4. **Arrival semantics**
   - 사건 발생과 현재 장면 도달을 분리한다.
   - 예: NPC가 멀리서 행동 완료 → 내부 상태만 갱신; 그 결과가 메시지/방문/뉴스/물리적 흔적으로 현재 장면에 도달 → main 전달 가능.

5. **Hayaku boundary test**
   - tracker가 과거 기억·관계 역사·장기 회상을 다시 저장하거나 주입하지 않는지 확인한다.

### P1 — MVP 구현 후보

P0 확정 후 다음 순서가 가장 가깝다.

1. full-state `buildInjection()` 제거 또는 projection-only로 교체
2. event delivery 판정 계층 추가
3. 빈 projection이면 main prompt에 tracker message 자체를 넣지 않도록 변경
4. 기존 tracker prompt를 전수평가 방식에서 scheduler 대상 평가 방식으로 변경
5. NPC 상태에 `nextDecisionWindow` / `wakeConditions` 또는 동등한 최소 필드 추가
6. dashboard에 다음 정보 추가
   - attention tier
   - backstage action
   - main 전달 대기/전달 완료 신호
   - 최근 projection
   - 최근 main 추가 주입 문자 수

### P2 — 안정화

- reroll / branch
- 메시지 삭제·편집
- 보조 모델 실패와 retry
- 다음 main 요청이 tracking 완료보다 빨리 시작되는 race
- 대형 NPC roster에서 보조 호출량
- 기존 v0.3.3 상태 migration
- Hayaku 동시 사용 시 중복 주입 여부

## 설계 불변조건

Work 구현 중 아래 원칙을 깨지 않는다.

1. NPC lore를 추적한다는 이유만으로 해당 lore 전체를 메인에 상시 활성화하지 않는다.
2. 메인에게 NPC 전체 census를 주기적으로 보내지 않는다.
3. 장면 밖 사실과 사용자 캐릭터가 아는 사실을 동일시하지 않는다.
4. 백스테이지 시뮬레이션은 설정과 정사를 침범하는 큰 사건을 근거 없이 발명하지 않는다.
5. 메인 모델은 사건 통보만 받는 수동 반응기가 되어서는 안 된다. 전체 세계 원장을 노출하지 않으면서도 필요한 경우 미래 전개를 설계할 최소 신호를 받을 수 있어야 한다.
6. Hayaku가 맡는 장기 기억을 tracker가 별도 장기기억 시스템처럼 중복 구축하지 않는다.
7. KoCoEMon의 코드/구조는 선택적 참조 대상이며, 프로젝트 정본은 이 리포의 코드와 이 handoff다.
