import test from 'node:test';
import assert from 'node:assert/strict';
import { SqliteCheckpointer } from '../lib/checkpointer.mjs';
import { createWorkflow, present } from '../lib/workflow.mjs';
import { search, sellers } from '../lib/catalog.mjs';
import { cleanQuestions } from '../lib/chat-ui.mjs';
import { chatAction, priceRange } from '../public/chat-controls.js';
import { createModelClient } from '../lib/model.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const choice = search({ q: 'هدفون', limit: 30 }).find((p) => sellers(p.product_id).length >= 3);
const text = (content) => ({ message: { role: 'assistant', content }, tokens: 10 });
const toolCalls = (calls) => ({
  message: {
    role: 'assistant',
    content: null,
    tool_calls: calls.map(([name, args], i) => ({
      id: 'call_' + i,
      type: 'function',
      function: { name, arguments: JSON.stringify(args) },
    })),
  },
  tokens: 20,
});
function deferred() {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}
function untilAborted(signal) {
  return new Promise((_, reject) => {
    signal.throwIfAborted();
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
}

test('pause aborts inference; resume continues after completed tools without duplicating the user turn', async () => {
  const saver = new SqliteCheckpointer(':memory:');
  const waiting = deferred();
  let count = 0;
  const w = createWorkflow({
    checkpointer: saver,
    model: async (_m, _t, _allow, { signal }) => {
      count++;
      if (count === 1) return toolCalls([['search_products', { q: 'هدفون' }]]);
      if (count === 2) {
        waiting.resolve();
        return untilAborted(signal);
      }
      return text('گزینه‌ها آماده‌اند.');
    },
  });
  try {
    const running = w.run('pause', { type: 'chat', message: 'هدفون می‌خواهم' });
    await waiting.promise;
    const paused = await w.pause('pause');
    assert.equal((await running).paused, true);
    assert.equal(paused.rounds, 1);
    assert.ok(paused.ui.productIds.length);
    assert.equal(paused.wire.at(-1).role, 'tool');
    const resumed = await w.run('pause', { type: 'resume' });
    assert.equal(resumed.paused, false);
    assert.equal(count, 3);
    assert.equal(resumed.messages.length, 2);
    assert.equal(resumed.totalTokens, 30);
    assert.equal(resumed.reply, 'گزینه‌ها آماده‌اند.');
  } finally {
    saver.close();
  }
});

test('a new message replaces the paused run and preserves both user requirements as context', async () => {
  const saver = new SqliteCheckpointer(':memory:');
  const waiting = deferred();
  let count = 0;
  const w = createWorkflow({
    checkpointer: saver,
    model: async (messages, _t, _a, { signal }) => {
      if (++count === 1) {
        waiting.resolve();
        return untilAborted(signal);
      }
      assert.deepEqual(
        messages.filter((m) => m.role === 'user').map((m) => m.content),
        ['هدفون می‌خواهم', 'بودجه تا سه میلیون'],
      );
      return text('بودجه جدید را در نظر می‌گیرم.');
    },
  });
  try {
    const running = w.run('new', { type: 'chat', message: 'هدفون می‌خواهم' });
    await waiting.promise;
    await w.pause('new');
    await running;
    const result = await w.run('new', { type: 'chat', message: 'بودجه تا سه میلیون' });
    assert.equal(result.paused, false);
    assert.equal(result.messages.length, 3);
    await assert.rejects(w.run('new', { type: 'resume' }), /متوقف‌شده‌ای/);
  } finally {
    saver.close();
  }
});

test('a paused conversation can resume after the SQLite connection is reopened', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'torob-pause-')),
    path = join(dir, 'state.db');
  let saver = new SqliteCheckpointer(path);
  const waiting = deferred();
  try {
    let w = createWorkflow({
      checkpointer: saver,
      model: async (_m, _t, _a, { signal }) => {
        waiting.resolve();
        return untilAborted(signal);
      },
    });
    const running = w.run('restart', { type: 'chat', message: 'کمکم کن انتخاب کنم' });
    await waiting.promise;
    await w.pause('restart');
    await running;
    saver.close();
    saver = new SqliteCheckpointer(path);
    w = createWorkflow({ checkpointer: saver, model: async () => text('ادامه می‌دهیم.') });
    assert.equal((await w.state('restart')).paused, true);
    assert.equal((await w.run('restart', { type: 'resume' })).messages.length, 2);
  } finally {
    saver.close();
    assert.ok(dir.startsWith(tmpdir()));
    rmSync(dir, { recursive: true, force: true });
  }
});

test('structured responses persist product cards with SQL price ranges and explicit questions', async () => {
  const saver = new SqliteCheckpointer(':memory:');
  let count = 0;
  const w = createWorkflow({
    checkpointer: saver,
    model: async () =>
      ++count === 1
        ? toolCalls([
            ['search_products', { q: 'هدفون' }],
            [
              'present_choices',
              {
                questions: [
                  { question: 'برای چه کاری می‌خواهی؟', options: ['رفت‌وآمد', 'موسیقی', 'سایر'] },
                ],
              },
            ],
          ])
        : text('کاربردت را انتخاب کن.'),
  });
  try {
    const result = present(await w.run('ui', { type: 'chat', message: 'هدفون می‌خواهم' }));
    assert.ok(result.ui.products.length);
    const p = result.ui.products[0],
      offers = sellers(p.product_id).filter((o) => o.price > 0);
    assert.equal(p.min_price, Math.min(...offers.map((o) => o.price)));
    assert.equal(p.max_price, Math.max(...offers.map((o) => o.price)));
    assert.deepEqual(result.ui.questions[0].options, ['رفت‌وآمد', 'موسیقی']);
    assert.deepEqual(result.messages.at(-1).ui, result.ui);
    const restored = present(await w.state('ui'));
    assert.deepEqual(restored.messages.at(-1).ui, result.ui);
  } finally {
    saver.close();
  }
});

test('button behavior distinguishes pause, resume and a new message', () => {
  assert.equal(chatAction('running', 'new text'), 'pause');
  assert.equal(chatAction('pausing', ''), 'wait');
  assert.equal(chatAction('paused', ''), 'resume');
  assert.equal(chatAction('paused', 'اطلاعات جدید'), 'send');
  assert.equal(chatAction('idle', ''), 'send');
  assert.equal(priceRange({ min_price: 100, max_price: 300 }, String), '100 تا 300 تومان');
  assert.equal(priceRange({ min_price: 100, max_price: 100 }, String), '100 تومان');
  assert.equal(priceRange({ min_price: null }, String), 'قیمت ثبت نشده');
  assert.throws(() => cleanQuestions([{ question: 'نامعتبر', options: ['یک گزینه'] }]));
});

test('final JSON can supply choice questions after the last allowed tool round', async () => {
  const saver = new SqliteCheckpointer(':memory:');
  let count = 0;
  const w = createWorkflow({
    checkpointer: saver,
    model: async () =>
      ++count === 1
        ? toolCalls([['update_preferences', { maxPrice: 3000000 }]])
        : count === 2
          ? toolCalls([['search_products', { q: 'هدفون' }]])
          : text(
              JSON.stringify({
                text: 'کاربردت را انتخاب کن.',
                questions: [
                  { question: 'بیشتر برای چه کاری؟', options: ['مکالمه', 'موسیقی', 'هر دو'] },
                ],
              }),
            ),
  });
  try {
    const result = present(await w.run('final-json', { type: 'chat', message: 'هدفون می‌خواهم' }));
    assert.equal(count, 3);
    assert.equal(result.reply, 'کاربردت را انتخاب کن.');
    assert.equal(result.ui.questions[0].options.length, 3);
    assert.ok(result.ui.products.length);
    assert.equal(result.messages.at(-1).content, result.reply);
  } finally {
    saver.close();
  }
});

test('explicit cancellation reaches the provider request without a retry', async () => {
  const previous = process.env.BOXAPI_API_KEY;
  process.env.BOXAPI_API_KEY = 'synthetic-test-key';
  const controller = new AbortController();
  const started = deferred();
  let calls = 0;
  try {
    const client = createModelClient({
      fetchImpl: async (_u, { signal }) => {
        calls++;
        started.resolve();
        return untilAborted(signal);
      },
      wait: async () => assert.fail('pause must not retry'),
      recordUsage: async () => assert.fail('no completed provider response'),
    });
    const pending = client([], [], false, { signal: controller.signal });
    await started.promise;
    controller.abort(new DOMException('Paused', 'AbortError'));
    await assert.rejects(pending, /Paused/);
    assert.equal(calls, 1);
  } finally {
    if (previous === undefined) delete process.env.BOXAPI_API_KEY;
    else process.env.BOXAPI_API_KEY = previous;
  }
});
