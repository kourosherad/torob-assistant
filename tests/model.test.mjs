import test from 'node:test';
import assert from 'node:assert/strict';
import { createModelClient } from '../lib/model.mjs';

test('temporary provider failure retries the identical request once and records only successful usage', async () => {
  const previous = process.env.BOXAPI_API_KEY;
  process.env.BOXAPI_API_KEY = 'synthetic-test-key';
  try {
    const bodies = [],
      usage = [],
      waits = [];
    const client = createModelClient({
      fetchImpl: async (_url, options) => {
        bodies.push(options.body);
        return bodies.length === 1
          ? new Response('{}', { status: 503 })
          : Response.json({
              choices: [{ message: { role: 'assistant', content: 'سلام' } }],
              usage: { total_tokens: 17 },
            });
      },
      wait: async (ms) => waits.push(ms),
      recordUsage: async (n) => usage.push(n),
    });
    const result = await client([{ role: 'user', content: 'سلام' }], [], false);
    assert.equal(bodies.length, 2);
    assert.equal(bodies[0], bodies[1]);
    const payload = JSON.parse(bodies[0]);
    if (payload.model === 'gpt-5-mini') assert.equal(payload.reasoning_effort, 'minimal');
    assert.equal(waits.length, 1);
    assert.deepEqual(usage, [17]);
    assert.equal(result.message.content, 'سلام');
  } finally {
    if (previous === undefined) delete process.env.BOXAPI_API_KEY;
    else process.env.BOXAPI_API_KEY = previous;
  }
});

test('permanent errors do not retry and temporary failures have a strict attempt limit', async () => {
  const previous = process.env.BOXAPI_API_KEY;
  process.env.BOXAPI_API_KEY = 'synthetic-test-key';
  try {
    for (const status of [401, 402, 429, 503]) {
      let count = 0;
      const client = createModelClient({
        fetchImpl: async () => {
          count++;
          return new Response('{}', { status });
        },
        wait: async () => {},
        recordUsage: async () => assert.fail('failed request must not record successful usage'),
      });
      await assert.rejects(client([], [], false));
      assert.equal(count, [429, 503].includes(status) ? 2 : 1);
    }
  } finally {
    if (previous === undefined) delete process.env.BOXAPI_API_KEY;
    else process.env.BOXAPI_API_KEY = previous;
  }
});

test('a network interruption can recover without exposing provider details', async () => {
  const previous = process.env.BOXAPI_API_KEY;
  process.env.BOXAPI_API_KEY = 'synthetic-test-key';
  try {
    let count = 0;
    const client = createModelClient({
      fetchImpl: async () => {
        if (++count === 1) throw new TypeError('network failure');
        return Response.json({ choices: [{ message: { role: 'assistant', content: 'پاسخ' } }] });
      },
      wait: async () => {},
      recordUsage: async () => {},
    });
    assert.equal((await client([], [], false)).message.content, 'پاسخ');
    assert.equal(count, 2);
  } finally {
    if (previous === undefined) delete process.env.BOXAPI_API_KEY;
    else process.env.BOXAPI_API_KEY = previous;
  }
});
