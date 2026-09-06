# v0.4 Backstage contract

Accepted by 태현 on 2026-09-06 after P0 review. Implementation extends v0.3.3; KoCoEMon v1.15.14 is a reference, not a dependency or source of truth.

## State and time

Keep storyTime/location/goal/activity/company/nextAction/status/certainty and lore bindings. Add pressure, constraints, nextDecisionWindow, wakeConditions and scheduling metadata. Notes describe only current actionable context, never cumulative memory. Unknown pressure/constraints are empty, not invented. Certainty never upgrades through repetition alone.

nextDecisionWindow contains reviewAfterTurns (1–50 accepted responses) and a storyCondition string. The local review clock schedules evaluation, never determines elapsed story time or completion. Natural-language conditions supply attention cues only; the model checks their meaning against evidence. Cold records with semantic conditions get a bounded review deadline so a paraphrased condition cannot sleep forever. New/changed lore requires reevaluation. Archived is an explicit user control, not inferred from a name mention or a model's lifecycle guess.

## Attention

Hot: uninitialized/changed lore, current mention, due review, matching wake cue, pending consequence review or manual evaluation. Evaluate all Hot records, in small batches if necessary. Warm: active goal/action/pressure, oldest review first, default four per response. Cold: no active work, preserve until wake/deadline. Archived: no automatic evaluation. A mention never proves presence or knowledge. An onstage NPC is reconciled from visible evidence only; do not simulate a second simultaneous offscreen action.

Only selected NPCs' details/lore enter the auxiliary request. Related unresolved events and compact identity references may accompany them; unselected identities cannot be patched. Coverage validation and repair apply to each selected batch, not the entire roster. No selected work means no model call. Multi-batch results apply atomically; failure does not partly advance the world.

## Projection and arrival

Occurrence (established/uncertain), arrival (pending/arrived/cancelled), and delivery (pending/delivered) are separate. Arrival includes route, evidence and exposure; knownBy identifies current knowers and may be empty. Rumor arrival does not prove the rumor true. Local keyword/turn/severity checks never promote an event to arrived.

Hard requires established occurrence plus supported arrival and a compact projection of only the local effect. Private backstage summary, lore and NPC census never serialize into the main block. A model can assess arrival only with a causal route and story evidence; it must not retroactively add arrivals to a finalized response. Uncertain future arrival remains pending and may motivate a soft hook.

Soft is a grounded, optional near-future contact/opportunity, not canon, not character knowledge. Default maximum two items, each at most 200 characters. A soft item references the NPC's evaluated state revision; a changed condition invalidates it. TTL is three accepted response ticks (not elapsed story time). Consume on successful main response, never on request creation; unchanged source cannot continually recreate a consumed/expired hook.

Hard takes priority under a 4000-character block budget. Whole records fit or remain queued; never truncate knowledge/arrival qualifiers mid-record. Hard has no TTL before successful delivery. Empty projection adds no system message. No periodic full-state injection, lastBrief bypass, severity-triggered bypass or manual census injection.

## Request, rollback and storage

Persist request identity, selected projections, output acknowledgment and the pre-response world snapshot. A failed/empty request leaves delivery pending; retry of identical input reuses the envelope. Successful response acknowledges only its exact event/projection revisions. Reroll restores the saved pre-response world and receipt. Keep at most five rollback snapshots, not long-term branch memory. Unknown edits outside recoverable history fail closed for projection and require explicit reset/reinitialization; do not silently use a different branch's facts.

Serialize state writes and reject stale revisions. A later main request can continue after the existing short wait; an auxiliary result from an older request epoch cannot commit. The next run reconciles from the latest bounded scene. Manual reanalysis reuses the same tick and pre-response world; it cannot consume signals or advance fictional time by itself.

## Hayaku and retention

No recall search, relationship chronology, embeddings, persistent narrative memory or Hayaku API assumptions. Keep current state, unresolved consequences, pending delivery, five recovery snapshots and bounded recent diagnostics. Delivered/cancelled events are bounded to 24 recent records. Pending consequences are never silently evicted: when the bounded queue (80) is full reject the auxiliary transaction with a visible error. Registration remains the existing 40-NPC PoC limit; separate world/faction registry is outside this MVP.

## Migration and verification

Preserve legacy lore and dynamic fields. Disable legacy pendingMajor/forceInjection/census counters; legacy events have uncertain occurrence and pending arrival until reevaluated. Legacy brief is never projected. Preserve original v3 storage as a one-time rollback backup before writing v4; use a separate v4 storage prefix so v0.3.3 cannot consume v4 state accidentally.

Required checks: no lore/census/brief in projection; remote major blocked/local minor eligible; empty block; soft TTL/revision; delivery acknowledgment/retry/reload; same-context reroll; stale auxiliary rejection; subset coverage; Hot batching/Warm fairness/Cold preservation; migration; queue overflow protection. Host RisuAI reroll/branch/edit timing, model quality and Hayaku coexistence require live acceptance testing and are not proven by mocks.
