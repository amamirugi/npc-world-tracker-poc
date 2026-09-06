const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../npc-world-tracker-poc.js'), 'utf8');

async function harness(shared) {
  const store = shared || new Map();
  const local = new Map();
  const storage = (map) => ({ getItem: async (k) => map.get(k) || null,
    setItem: async (k, v) => { map.set(k, v); }, removeItem: async (k) => { map.delete(k); } });
  const chat = { id: 'chat', name: 'Test', message: [] };
  const character = { chaId: 'character', name: 'Test', chatPage: 0, chats: [chat] };
  const calls = [];
  const ui = { html: '', nodes: new Map() };
  const document = { documentElement: { style: {} }, body: { set innerHTML(value) {
    ui.html = value; ui.nodes = new Map([...value.matchAll(/id="([^"]+)"/g)].map((match) => [match[1], { open: false }]));
  } }, getElementById: (id) => ui.nodes.get(id) || null, querySelectorAll: () => [] };
  let respond = (input) => ({ npc_updates: input.CURRENT_STATE.npcs.map((npc) => patch(npc.id)), events: [], soft_signals: [] });
  const Risuai = { pluginStorage: storage(store), safeLocalStorage: storage(local), getCharacter: async () => character,
    getCurrentLorebookEntries: async () => [], registerButton: async (part) => ({ id: part.id }), unregisterUIPart: async () => {},
    nativeFetch: async (url, options) => {
      const body = JSON.parse(options.body); calls.push(body);
      const input = JSON.parse(body.messages[1].content);
      const result = await respond(input, body);
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(result) } }] }) };
    } };
  const names = [...source.matchAll(/^  (?:async )?function (\w+)\(/gm)].map((match) => match[1]);
  const injected = source.slice(0, source.indexOf('  try {\n    beforeRequestReplacer =')) +
    `globalThis.api = {${names.join(',')}, trackingQueues, pendingRequests};\n})();`;
  const sandbox = { Risuai, console, document, navigator: {}, URL, Date, TextDecoder, setTimeout, clearTimeout };
  vm.createContext(sandbox);
  await vm.runInContext(injected, sandbox);
  const api = sandbox.api;
  const context = await api.getCurrentContext();
  const config = api.normalizeConfig({ endpoint: 'https://example.invalid/v1/chat/completions', model: 'test', maxTokens: 4000, warmBatchSize: 4, debugLogging: false });
  await api.saveConfig(config);
  return { api, context, config, store, chat, calls, ui, setResponder: (fn) => { respond = fn; },
    settle: async () => { const q = api.trackingQueues.get(context.scopeId); if (q) await q; } };
}
function npc(id = 'n1', overrides = {}) {
  return { id, name: id, loreRef: { content: 'SECRET_LORE_' + id, contentHash: 'lore', query: id },
    storyTime: 'Ten minutes after the bell', location: 'Archive reading room', goal: 'Check the delivery address',
    activity: 'Checks the address on an envelope.', company: 'Alone at the desk', nextAction: 'Seal the envelope',
    status: 'Tired after reading', certainty: 'inferred', needsEvaluation: false, lastEvaluatedTick: 0,
    nextReviewTick: 30, stateRevision: 1, ...overrides };
}
function patch(id = 'n1', overrides = {}) {
  return { id, decision: 'held', story_time: 'Ten minutes after the bell', location: 'Archive reading room',
    goal: 'Check the delivery address', activity: 'Checks the address on an envelope.', company: 'Alone at the desk',
    next_action: 'Seal the envelope', status: 'Tired after reading', certainty: 'inferred', notes: '',
    reason: 'The short scene has not advanced enough time to finish.', pressure: '', constraints: [],
    next_decision_window: { review_after_turns: 4, story_condition: '' }, wake_conditions: [], attention_mode: 'active', ...overrides };
}
function event(id = 'e1', overrides = {}) {
  return { id, summary: 'PRIVATE_BACKSTAGE', severity: 1, npcIds: ['n1'], occurrence: 'established',
    arrival: { status: 'arrived', route: 'Phone notification', evidence: 'A notification appears in the current scene', exposure: 'Message delivered; not read' },
    projection: 'A message notification is available on the phone.', knownBy: [], revision: 1, ...overrides };
}
function state(h, npcs = [npc()], events = []) {
  return h.api.normalizeState({ version: 4, npcs, events, lastBrief: 'PRIVATE_BRIEF', tracker: { tick: 1 } }, h.context);
}
function snapshot(overrides = {}) { return { contextHash: 'ctx', sourceTurnHash: 'source', transcript: [], output: 'The bell rings.', ...overrides }; }
function result(h, updates, events = [], soft = []) {
  return h.api.normalizeTrackerResult({ npc_updates: updates, events, soft_signals: soft });
}

test('projection contains only local effects; empty result adds no message', async () => {
  const h = await harness(); const s = state(h, [npc()], [event()]);
  const block = h.api.buildInjection(s);
  assert.match(block, /HARD/); assert.match(block, /not read/);
  for (const value of ['SECRET_LORE', 'PRIVATE_BACKSTAGE', 'PRIVATE_BRIEF', 'Check the delivery address']) assert.ok(!block.includes(value));
  assert.equal(h.api.buildInjection(state(h)), '');
  const messages = [{ role: 'user', content: 'hello' }];
  assert.equal(h.api.insertSystemMessage(messages, ''), messages);
});
test('remote major is not deliverable while arrived minor is', async () => {
  const h = await harness(); const s = state(h, [npc()], [event('far', { severity: 5, arrival: { status: 'pending' } }), event('near')]);
  assert.deepEqual(Array.from(h.api.selectProjection(s).items, (x) => x.id), ['near']);
});
test('arrival needs all evidence fields and cannot be promoted by severity or tick', async () => {
  const h = await harness();
  for (const field of ['route', 'evidence', 'exposure']) {
    const e = event(); e.arrival[field] = '';
    assert.equal(h.api.hardIsEligible(h.api.normalizeEvent(e)), false);
    assert.throws(() => h.api.validateEventResults(result(h, [patch()], [e]), state(h)), /도달/);
  }
});
test('soft signals expire, depend on state revision, and are limited to two', async () => {
  const h = await harness(); const s = state(h, [npc('a'), npc('b'), npc('c')]);
  s.softSignals = ['a', 'b', 'c'].map((id) => ({ id, npcId: id, stateRevision: 1, expiresTick: 4, text: 'A possible contact.' }));
  assert.equal(h.api.selectProjection(s).items.length, 2);
  s.npcs[0].stateRevision = 2;
  assert.equal(h.api.softIsValid(s.softSignals[0], s), false);
  s.tracker.tick = 4; assert.equal(h.api.buildInjection(s), '');
});
test('budget never slices a record and retains overflow hard events', async () => {
  const h = await harness(); const s = state(h, [npc()], Array.from({ length: 10 }, (_, i) => event('e'+i, { projection: 'x'.repeat(700) })));
  const p = h.api.selectProjection(s); assert.ok(p.injection.length <= 4000); assert.ok(p.items.length < 10);
  for (const line of p.injection.split('\n').filter((x) => x.startsWith('HARD '))) assert.doesNotThrow(() => JSON.parse(line.slice(5)));
  assert.equal(s.events.length, 10);
});
test('delivery acknowledges only exact revisions', async () => {
  const h = await harness(); const s = state(h, [npc()], [event()]);
  const p = h.api.selectProjection(s); s.events[0].revision += 1;
  h.api.acknowledgeProjection(s, { ...p, contextHash: 'ctx' }); assert.equal(s.events[0].delivery, 'pending');
  h.api.acknowledgeProjection(s, { ...h.api.selectProjection(s), contextHash: 'ctx' }); assert.equal(s.events[0].delivery, 'delivered');
});
test('all Hot included, Warm oldest first, Cold and Archived preserved', async () => {
  const h = await harness(); const roster = Array.from({ length: 8 }, (_, i) => npc('hot'+i, { needsEvaluation: true }));
  roster.push(...Array.from({ length: 6 }, (_, i) => npc('warm'+i, { lastEvaluatedTick: i })));
  roster.push(npc('cold', { attentionMode: 'waiting', nextReviewTick: 0 }), npc('archived', { archived: true, needsEvaluation: true }));
  const s = state(h, roster); const selected = h.api.selectAttention(s, snapshot(), h.config);
  assert.equal(selected.length, 12); assert.ok(selected.every((x) => !['cold', 'archived'].includes(x.id)));
  assert.deepEqual(Array.from(selected.slice(8), (x) => x.id), ['warm0','warm1','warm2','warm3']);
});
test('a wake cue triggers evaluation, not presence or hard arrival', async () => {
  const h = await harness(); const s = state(h, [npc('n1', { attentionMode: 'waiting', wakeConditions: ['doorbell'] })]);
  const selected = h.api.selectAttention(s, snapshot({ output: 'A doorbell may be repaired tomorrow.' }), h.config);
  assert.equal(selected.length, 1); assert.equal(h.api.buildInjection(s), ''); assert.equal(s.npcs[0].location, 'Archive reading room');
});
test('only selected NPC state is updated and unchanged soft is not reissued', async () => {
  const h = await harness(); const s = state(h, [npc(), npc('n2')]); const before = JSON.stringify(s.npcs[1]);
  const r = result(h, [patch()], [], [{ npc_id: 'n1', text: 'A contact could follow.' }]);
  h.api.applyTrackerResult(s, r, snapshot());
  assert.equal(JSON.stringify(s.npcs[1]), before); assert.equal(s.softSignals.length, 1);
  h.api.acknowledgeProjection(s, { ...h.api.selectProjection(s), contextHash: 'ctx' });
  h.api.applyTrackerResult(s, r, snapshot()); assert.equal(h.api.buildInjection(s), '');
});
test('coverage validates selected batch and requires scheduling fields', async () => {
  const h = await harness(); const s = state(h);
  assert.equal(h.api.hasTrackerCoverageIssues(h.api.trackerCoverageIssues(result(h, [patch()]), s)), false);
  const p = patch(); delete p.next_decision_window;
  assert.equal(h.api.hasTrackerCoverageIssues(h.api.trackerCoverageIssues(result(h, [p]), s)), true);
  assert.equal(h.api.hasTrackerCoverageIssues(h.api.trackerCoverageIssues(result(h, [patch('n2')]), s)), true);
});
test('v3 migration keeps original storage and never upgrades legacy events', async () => {
  const h = await harness(); const legacyKey = 'npc_world_tracker_poc_state_v2_' + h.context.scopeId;
  const raw = JSON.stringify({ version: 3, npcs: [npc()], events: [{ id: 'old', summary: 'Old major event', severity: 5 }], lastBrief: 'legacy brief', tracker: { pendingMajor: true, forceInjection: true } });
  h.store.set(legacyKey, raw); let s = await h.api.loadState(h.context);
  assert.equal(s.version, 4); assert.equal(h.api.buildInjection(s), ''); assert.equal(s.npcs[0].loreRef.content, 'SECRET_LORE_n1');
  await h.api.saveState(h.context, s); assert.equal(h.store.get(legacyKey), raw);
});
test('stale concurrent save is rejected', async () => {
  const h = await harness(); const a = await h.api.loadState(h.context), b = await h.api.loadState(h.context);
  const writes = await Promise.allSettled([h.api.saveState(h.context, a), h.api.saveState(h.context, b)]);
  assert.equal(writes.filter((x) => x.status === 'fulfilled').length, 1);
});
test('pending queue overflow rejects transaction without deleting an event', async () => {
  const h = await harness(); const s = state(h, [npc()], Array.from({ length: 80 }, (_, i) => event('e'+i)));
  await h.api.saveState(h.context, s); const persisted = await h.api.loadState(h.context);
  persisted.events.push(h.api.normalizeEvent(event('overflow')));
  await assert.rejects(h.api.saveState(h.context, persisted), /80/);
  assert.equal((await h.api.loadState(h.context)).events.length, 80);
});
test('failed request survives reload; successful output consumes; reroll restores', async () => {
  let h = await harness(); await h.api.saveState(h.context, state(h, [npc()], [event()]));
  const messages = [{ role: 'user', content: 'Begin.' }];
  const first = await h.api.handleBeforeRequest(messages, 'model');
  await h.api.handleAfterRequest('', 'model'); assert.equal((await h.api.loadState(h.context)).events[0].delivery, 'pending');
  h = await harness(h.store);
  const retry = await h.api.handleBeforeRequest(messages, 'model'); assert.equal(JSON.stringify(retry), JSON.stringify(first));
  await h.api.handleAfterRequest('The protagonist waits.', 'model'); await h.settle();
  assert.equal((await h.api.loadState(h.context)).events[0].delivery, 'delivered');
  const reroll = await h.api.handleBeforeRequest(messages, 'model');
  assert.equal(JSON.stringify(reroll), JSON.stringify(first));
  assert.equal((await h.api.loadState(h.context)).events[0].delivery, 'pending');
});
test('Hot roster uses bounded calls, only selected lore, atomic failure', async () => {
  const h = await harness(); const s = state(h, [...Array.from({ length: 5 }, (_, i) => npc('h'+i, { needsEvaluation: true })), npc('cold', { attentionMode: 'waiting' })]);
  await h.api.saveState(h.context, s);
  await h.api.runTracking(h.context, snapshot(), false);
  assert.equal(h.calls.length, 2);
  assert.ok(h.calls.every((body) => !JSON.stringify(body).includes('SECRET_LORE_cold')));
  assert.equal((await h.api.loadState(h.context)).npcs.filter((n) => n.lastSourceTurnHash === 'source').length, 5);
  const h2 = await harness(); await h2.api.saveState(h2.context, state(h2, Array.from({ length: 5 }, (_, i) => npc('h'+i, { needsEvaluation: true }))));
  let n = 0; h2.setResponder((input) => { if (++n === 2) throw new Error('provider failed'); return { npc_updates: input.CURRENT_STATE.npcs.map((row) => patch(row.id)), events: [], soft_signals: [] }; });
  await h2.api.runTracking(h2.context, snapshot(), false);
  assert.ok((await h2.api.loadState(h2.context)).npcs.every((row) => !row.lastSourceTurnHash));
});
test('late auxiliary result cannot commit across a newer request epoch', async () => {
  const h = await harness(); await h.api.saveState(h.context, state(h));
  let release, started; const began = new Promise((resolve) => { started = resolve; });
  h.setResponder(async (input) => { started(); await new Promise((resolve) => { release = resolve; }); return { npc_updates: [patch()], events: [], soft_signals: [] }; });
  const running = h.api.runTracking(h.context, snapshot(), false); await began;
  let s = await h.api.loadState(h.context); s.tracker.requestEpoch += 1; await h.api.saveState(h.context, s);
  release(); await running;
  assert.equal((await h.api.loadState(h.context)).npcs[0].lastSourceTurnHash, '');
});
test('unrecoverable edit suppresses projection and remains blocked on retry', async () => {
  const h = await harness(); await h.api.saveState(h.context, state(h, [npc()], [event()]));
  await h.api.handleBeforeRequest([{ role: 'user', content: 'Begin.' }], 'model');
  await h.api.handleAfterRequest('Original scene.', 'model'); await h.settle();
  const edited = [{ role: 'assistant', content: 'Edited scene.' }, { role: 'user', content: 'Continue.' }];
  assert.equal((await h.api.handleBeforeRequest(edited, 'model')).length, 2);
  assert.equal((await h.api.handleBeforeRequest(edited, 'model')).length, 2);
  assert.equal((await h.api.loadState(h.context)).tracker.branchStale, true);
});
test('raw lineage detects earlier edits even if recent context still matches', async () => {
  const h = await harness(); h.chat.message = [{ role: 'user', data: 'Old premise' }, { role: 'char', data: 'Old answer' }, { role: 'user', data: 'Begin.' }];
  const transcript = [{ role: 'user', content: 'Begin.' }];
  const lineage = h.api.requestLineage(h.context, transcript);
  assert.equal(h.api.lineageMatches(lineage, h.context), true);
  h.chat.message[0].data = 'Changed premise'; assert.equal(h.api.lineageMatches(lineage, h.context), false);
});
test('disabled tracker adds no injection and schedules no call', async () => {
  const h = await harness(); await h.api.saveConfig({ ...h.config, enabled: false });
  await h.api.saveState(h.context, state(h, [npc()], [event()]));
  const messages = [{ role: 'user', content: 'Begin.' }];
  assert.equal(await h.api.handleBeforeRequest(messages, 'model'), messages);
  await h.api.handleAfterRequest('Response.', 'model'); assert.equal(h.calls.length, 0);
});
test('dashboard renders projection, attention and scheduling controls', async () => {
  const h = await harness(); await h.api.saveState(h.context, state(h, [npc()], [event()]));
  await h.api.renderUi();
  assert.match(h.ui.html, /최근 메인 projection/); assert.match(h.ui.html, /Warm 순환 평가 수/);
  assert.ok(!h.ui.html.includes('cfg-interval')); assert.ok(!h.ui.html.includes('force-inject'));
  assert.ok(h.ui.nodes.get('save-config').onclick);
});

test('pending occurrence is reevaluated by its owner and becomes hard only after arrival evidence', async () => {
  const h = await harness();
  await h.api.saveState(h.context, state(h, [npc()], [event('e1', { arrival: { status: 'pending' }, projection: '' })]));
  h.setResponder((input) => {
    assert.equal(input.CURRENT_STATE.recent_events[0].id, 'e1');
    return { npc_updates: [patch()], events: [event('e1')], soft_signals: [] };
  });
  await h.api.runTracking(h.context, snapshot(), false);
  const s = await h.api.loadState(h.context);
  assert.equal(s.events.length, 1); assert.equal(h.api.selectProjection(s).items[0].id, 'e1');
});

test('manual reanalysis keeps the response tick and existing delivery acknowledgment', async () => {
  const h = await harness(); await h.api.saveState(h.context, state(h, [npc()], [event()]));
  await h.api.handleBeforeRequest([{ role: 'user', content: 'Begin.' }], 'model');
  await h.api.handleAfterRequest('Original scene.', 'model'); await h.settle();
  const before = await h.api.loadState(h.context);
  await h.api.runTracking(h.context, snapshot({ output: 'Original scene.', requestEpoch: before.tracker.requestEpoch }), true, true);
  const after = await h.api.loadState(h.context);
  assert.equal(after.tracker.tick, before.tracker.tick); assert.equal(after.events[0].delivery, 'delivered');
});

test('oversized exposure is rejected instead of silently truncated', async () => {
  const h = await harness(); const e = event(); e.arrival.exposure = 'x'.repeat(401);
  assert.throws(() => result(h, [patch()], [e]), /길이/);
});
