# NPC World Tracker PoC — Handoff

Last reviewed: 2026-09-06

> **현재 재개 지점 — 2026-09-06:** 태현의 P0 승인 후 v0.4 P1 구현과 모의 회귀 검증 23개를 마쳤다. [PR #1](https://github.com/amamirugi/npc-world-tracker-poc/pull/1)의 [최신 handoff](https://github.com/amamirugi/npc-world-tracker-poc/blob/work/v0.4-backstage/DECISIONS.md)를 읽고 **실제 RisuAI + Hayaku 인수 검증(P2)**부터 이어간다. 아래 본문은 재개 당시 v0.3.3 기준 기록이며, P0/P1을 반복하지 않는다. main의 플러그인 JS는 아직 v0.3.3이고 v0.4 업데이트 배포·실환경 설치는 수행하지 않았다.

This is the project handoff document for `amamirugi/npc-world-tracker-poc`. It is written for an AI instance that has no access to the conversation that produced these decisions.

## 확정된 결정

### 1. 프로젝트를 기존 PoC에서 재개한다

- 구현 베이스는 새 플러그인을 처음부터 만드는 것이 아니라 현재 리포의 `npc-world-tracker-poc.js`다.
- 재개 기준은 `0.3.3`이며, 승인된 P0 설계에 따라 v0.4 구현을 별도 검토 브랜치에서 진행한다.
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

### 5. P0 — v0.4 계약 승인 (2026-09-06)

태현이 다섯 계약을 검토한 뒤 구현 진행을 승인했다. 구체 계약은 [v0.4 설계](docs/V0_4_DESIGN.md)가 소유한다. 기존 필드 유지, Hot 전부 + Warm 순환, soft/hard projection, occurrence/arrival/delivery 분리, Hayaku 장기기억 비중복을 확정했다.

### 6. RisuAI 보조모델 연결 (2026-09-07)

태현의 요청으로 RisuAI에 설정된 보조모델을 지원한다. 구현 기본값은 `modelSource: risu`이며, 첨부 KoCoEMon v1.15.14에서 확인한 `runLLMModel({ messages, mode: "submodel", allowPlugins: true })` 호출 경로를 사용한다. 기존 endpoint/model/key는 보존하고 `직접 설정 API` 선택 시 사용한다. RisuAI 연결은 별도 키를 읽지 않으며 생성 파라미터는 host 설정을 따른다. tracker의 maxTokens 값은 이 모드에서 배치 예산으로만 사용한다. 실패 시 다른 제공자로 자동 전환하지 않는다. 실제 host 및 다른 플러그인의 submodel hook 상호작용은 P2에서 확인한다.

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

- 기준 main commit: `4f247f3725ecf27c5842b2a8a47a82da5322b5c7`; JS baseline blob: `04f77dbaba83a1321c843f50f9a1161f52f70556`.
- 이 브랜치의 `npc-world-tracker-poc.js`는 v0.4.0 구현이다. main 업데이트 배포와 실제 RisuAI 설치는 수행하지 않았다.
- 기존 lore 연결, UI/설정, 보조 호출, coverage repair, 진단 로그 기반을 유지했다. 전수평가·full-state periodic injection은 scheduler와 projection으로 교체했다.
- 미해결 사건을 최대 8개씩 batch owner에게 재평가시키며, hard에는 발생 성립·도달 경로·근거·노출 범위·local projection을 요구한다. severity만으로 전달하지 않는다.
- request envelope와 pre-response snapshot, 성공 응답 ack, request epoch와 storage revision을 추가했다. 실패/동일 입력 retry/reload/reroll 및 같은 작중 시점의 수동 재분석을 모의 검증했다.
- v3 원본 키를 보존하고 v4 키를 별도로 쓴다. 기존 이벤트는 uncertain/pending으로 이전하고 legacy brief는 주입하지 않는다.
- UI에 attention, pressure/constraints/wake, 전달 대기/완료, 최근 projection과 문자 수를 추가했다. 전체 상태 강제 주입을 제거하고 NPC 비활성/재개를 추가했다.
- 자동 검증: Node syntax 및 `tests/tracker.test.cjs` 27개 PASS. 상세 검증 방법과 한계는 [검증·조작 문서](docs/V0_4_VALIDATION.md)를 따른다.
- KoCoEMon v1.15.14는 제공된 코드에서 attention과 offscreen/arrival 분리를 확인하는 데 사용했다. 코드·의존성을 이식하거나 메인 world-state injection을 복제하지 않았다.

## 이어받을 다음 작업

### P0 / P1

P0 승인 및 P1 MVP 구현·모의 회귀 검증을 마쳤다. 동일 설계를 다시 토론하거나 v0.3.3 기반 기능을 재구현하지 않는다.

### P2 — 실제 RisuAI + Hayaku 인수 검증

가장 가까운 실행 항목은 복제 테스트 채팅에서 [인수 항목](docs/V0_4_VALIDATION.md)을 실행하는 것이다. 현재 실환경 접근·실제 보조 모델 요청은 수행하지 않았다. 우선 arrival 의미 정확도와 soft 유용성, hook 시점/재생성/분기/편집, 동시 요청·채팅 전환, 대형 roster 비용, Hayaku 중복을 확인한다. 검증 후 main 병합·업데이트 배포 여부를 결정한다.

- 최근 5개 밖의 자동 branch reconstruction과 분산 저장 잠금은 구현하지 않았다.
- host 변환으로 raw user 매칭이 불가능하면 오래된 편집 감지는 제한된다.
- hard의 구조 검증은 보조 모델의 의미 판단 정확도를 보장하지 않는다.
- world/faction 전용 registry, 장기기억 검색 및 Hayaku 내부 API 연동은 이번 MVP 범위 밖이다.

## 설계 불변조건

Work 구현 중 아래 원칙을 깨지 않는다.

1. NPC lore를 추적한다는 이유만으로 해당 lore 전체를 메인에 상시 활성화하지 않는다.
2. 메인에게 NPC 전체 census를 주기적으로 보내지 않는다.
3. 장면 밖 사실과 사용자 캐릭터가 아는 사실을 동일시하지 않는다.
4. 백스테이지 시뮬레이션은 설정과 정사를 침범하는 큰 사건을 근거 없이 발명하지 않는다.
5. 메인 모델은 사건 통보만 받는 수동 반응기가 되어서는 안 된다. 전체 세계 원장을 노출하지 않으면서도 필요한 경우 미래 전개를 설계할 최소 신호를 받을 수 있어야 한다.
6. Hayaku가 맡는 장기 기억을 tracker가 별도 장기기억 시스템처럼 중복 구축하지 않는다.
7. KoCoEMon의 코드/구조는 선택적 참조 대상이며, 프로젝트 정본은 이 리포의 코드와 이 handoff다.
