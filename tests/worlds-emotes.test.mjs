// Unit tests for chat-emote parsing + the applyEmote field-setter, extracted
// from the real engine/world/47-worlds-room.js. Run with: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildEngineFns } from './helpers/extract-fn.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOM = join(__dirname, '..', 'engine', 'world', '47-worlds-room.js');

// EMOTES is a closure const, not a function declaration, so stub it in the
// preamble with the same shape the real table uses.
const PREAMBLE = `const EMOTES = {
  wave:   { state: 'wave',   ms: 1600, hold: false },
  dance:  { state: 'dance',  ms: 3000, hold: true  },
  jump:   { state: 'jump',   ms: 460,  hold: false },
  sit:    { state: 'sit',    ms: 4000, hold: true  },
  crouch: { state: 'crouch', ms: 2500, hold: true  },
  attack: { state: 'attack', ms: 460,  hold: false },
};`;
const { resolveChatInput, applyEmote } = buildEngineFns(
  ROOM, ['resolveChatInput', 'applyEmote'], PREAMBLE
);

test('slash emote command is recognized', () => {
  assert.deepEqual(resolveChatInput('/wave'), { kind: 'emote', cmd: 'wave' });
  assert.deepEqual(resolveChatInput('  /Sit  '), { kind: 'emote', cmd: 'sit' });
});
test('unknown slash command is flagged, not chatted', () => {
  assert.deepEqual(resolveChatInput('/explode'), { kind: 'unknown', cmd: 'explode' });
});
test('plain text is chat (trimmed)', () => {
  assert.deepEqual(resolveChatInput('  hello world '), { kind: 'chat', text: 'hello world' });
});
test('applyEmote sets the emote field for a hold pose', () => {
  const ent = {};
  applyEmote(ent, 'sit');
  assert.equal(ent.emote.state, 'sit');
  assert.equal(ent.emote.hold, true);
  assert.equal(ent._emoteFresh, true);
  assert.ok(ent.emote.until > 0);
});
test('applyEmote ignores unknown cmd and null ent', () => {
  const ent = {};
  applyEmote(ent, 'explode');
  assert.equal(ent.emote, undefined);
  assert.doesNotThrow(() => applyEmote(null, 'wave'));
});
