import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVoiceScript, createVoiceEnvelope, listVoiceCandidates } from '../src/voice-pipeline.js';

test('buildVoiceScript: should compose concise script', () => {
  const script = buildVoiceScript({
    title: 'Open source AI release',
    summary: 'New multimodal model published with permissive license.',
    url: 'https://example.com/post'
  }, { intro: 'Morning update.' });

  assert.match(script, /Morning update/);
  assert.match(script, /标题：Open source AI release/);
  assert.match(script, /详情：https:\/\/example.com\/post/);
});

test('createVoiceEnvelope: should include channel and tts metadata', () => {
  const env = createVoiceEnvelope({ id: 'it-1', title: 'A' }, {
    id: 'v-1',
    channel: 'telegram',
    ttsProvider: 'system',
    voice: 'nova',
    nowIso: '2026-02-21T00:00:00.000Z'
  });

  assert.equal(env.id, 'v-1');
  assert.equal(env.channel, 'telegram');
  assert.equal(env.createdAt, '2026-02-21T00:00:00.000Z');
  assert.equal(env.tts.voice, 'nova');
  assert.equal(env.item.id, 'it-1');
});

test('listVoiceCandidates: should return ranked top items', () => {
  const items = listVoiceCandidates([
    { id: 'a', title: 'A', score: 0.9 },
    { id: 'b', title: 'B', score: 0.7 }
  ], 1);

  assert.equal(items.length, 1);
  assert.equal(items[0].rank, 1);
  assert.equal(items[0].id, 'a');
});
