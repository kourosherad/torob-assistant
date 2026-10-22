import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteCheckpointer } from '../lib/checkpointer.mjs';
import { createWorkflow, present } from '../lib/workflow.mjs';
import { search, sellers } from '../lib/catalog.mjs';
const choice = search({ q: 'هدفون', limit: 30 }).find((p) => sellers(p.product_id).length >= 3);
const text = (content) => ({ message: { role: 'assistant', content }, tokens: 10 });
const call = (name, args, id = 'tool-1') => ({
  message: {
    role: 'assistant',
    content: null,
    tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }],
  },
  tokens: 20,
});
function setup(model = async () => text('چه کاربردی داری؟')) {
  const saver = new SqliteCheckpointer(':memory:');
  return { saver, w: createWorkflow({ checkpointer: saver, model }) };
}

test('SQLite checkpoints restore a complete purchase after reopening the database', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'torob-state-')),
    path = join(dir, 'workflow.db');
  let saver = new SqliteCheckpointer(path);
  try {
    let w = createWorkflow({ checkpointer: saver, model: async () => text('نیازت ذخیره شد.') });
    await w.run('one', { type: 'chat', message: 'برای رفت‌وآمد هدفون می‌خواهم' });
    await w.run('one', {
      type: 'preferences',
      preferences: { color: 'مشکی', useCase: 'رفت‌وآمد' },
    });
    let s = await w.run('one', { type: 'select', productId: choice.product_id });
    const offer = s.sellerOptions[0];
    await w.run('one', { type: 'verify', offerId: offer.offer_id, scenario: 'confirmed' });
    await w.run('one', { type: 'plan', offerId: offer.offer_id });
    saver.close();
    saver = new SqliteCheckpointer(path);
    w = createWorkflow({ checkpointer: saver });
    const restored = present(await w.state('one'));
    assert.equal(restored.phase, 'trip');
    assert.equal(restored.selected.product_id, choice.product_id);
    assert.equal(restored.preferences.color, 'مشکی');
    assert.equal(restored.trip.seller.offer_id, offer.offer_id);
    assert.equal(restored.trip.seller.verification.simulated, true);
    assert.equal(restored.messages.length, 2);
    assert.equal(present(await w.state('other')).selected, null);
  } finally {
    saver.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test('seller failure follows the alternatives branch and prevents a failed visit', async () => {
  const { saver, w } = setup(async () => {
    throw Error('Model must not run for deterministic actions');
  });
  try {
    let s = await w.run('fallback', { type: 'select', productId: choice.product_id });
    const failed = s.sellerOptions[0].offer_id;
    s = await w.run('fallback', { type: 'verify', offerId: failed, scenario: 'no_answer' });
    assert.notEqual(s.sellerOptions[0].offer_id, failed);
    assert.equal(s.sellerOptions.at(-1).offer_id, failed);
    assert.ok(s.trace.includes('پیشنهاد فروشندگان جایگزین'));
    await assert.rejects(w.run('fallback', { type: 'plan', offerId: failed }), /گزینه دیگری/);
    assert.equal(present(await w.state('fallback')).trip, null);
    const valid = s.sellerOptions.find((o) => o.offer_id !== failed);
    const recovered = await w.run('fallback', { type: 'plan', offerId: valid.offer_id });
    assert.equal(recovered.tripOfferId, valid.offer_id);
  } finally {
    saver.close();
  }
});
test('tool decisions preserve preferences, use real data and do not leak coordinates to the model', async () => {
  let step = 0;
  const { saver, w } = setup(async (messages) => {
    assert.ok(!JSON.stringify(messages).includes('35.7116'));
    step++;
    return step === 1
      ? call('update_preferences', { maxPrice: 3000000, color: 'مشکی', useCase: 'رفت‌وآمد' })
      : step === 2
        ? call('search_products', { q: 'هدفون' }, 'tool-2')
        : text('این گزینه‌ها را بررسی کن.');
  });
  try {
    await w.run('chat', {
      type: 'preferences',
      preferences: { location: { lat: 35.7116, lon: 51.407, label: 'ولیعصر' } },
    });
    const s = await w.run('chat', {
      type: 'chat',
      message: 'هدفون مشکی تا سه میلیون برای رفت‌وآمد',
    });
    assert.equal(step, 3);
    assert.equal(s.preferences.maxPrice, 3000000);
    assert.equal(s.preferences.color, 'مشکی');
    assert.ok(s.products.length);
    assert.ok(s.products.every((p) => p.min_price <= 3000000));
    assert.equal(s.messages.length, 2);
    assert.equal(s.totalTokens, 50);
    assert.equal(s.wire.length, 0);
    const changed = await w.run('chat', {
      type: 'preferences',
      preferences: { maxPrice: 2000000 },
    });
    assert.equal(changed.preferences.color, 'مشکی');
    assert.ok(changed.products.every((p) => p.min_price <= 2000000));
  } finally {
    saver.close();
  }
});
test('model outage preserves the purchase and permits a later successful turn', async () => {
  let fail = true;
  const { saver, w } = setup(async () => {
    if (fail) throw Error('مدل پاسخ نداد');
    return text('پاسخ بازیابی شد');
  });
  try {
    await w.run('retry', { type: 'preferences', preferences: { maxPrice: 5000000 } });
    const s = await w.run('retry', { type: 'chat', message: 'سلام' });
    assert.ok(s.error);
    assert.equal(s.messages.length, 0);
    assert.equal(s.preferences.maxPrice, 5000000);
    fail = false;
    const next = await w.run('retry', { type: 'chat', message: 'دوباره سلام' });
    assert.equal(next.error, null);
    assert.equal(next.messages.length, 2);
  } finally {
    saver.close();
  }
});
test('per-session lock blocks racing updates, while other sessions can proceed', async () => {
  let release;
  const waiting = new Promise((r) => (release = r));
  const { saver, w } = setup(async () => {
    await waiting;
    return text('تمام');
  });
  try {
    const pending = w.run('locked', { type: 'chat', message: 'سلام' });
    await assert.rejects(
      w.run('locked', { type: 'preferences', preferences: { maxPrice: 1 } }),
      /در حال پردازش/,
    );
    await w.run('free', { type: 'search', q: 'هدفون', preferences: {} });
    release();
    await pending;
  } finally {
    release();
    saver.close();
  }
});
test('invalid events and unknown tools cannot mutate arbitrary preferences', async () => {
  const { saver, w } = setup();
  try {
    await assert.rejects(w.run('invalid', { type: 'select', productId: 'missing' }), /پیدا نشد/);
    await assert.rejects(
      w.run('invalid', { type: 'preferences', preferences: { maxPrice: -1 } }),
      /معتبر نیست/,
    );
  } finally {
    saver.close();
  }
});

test('seller tool selects the product and exposes the same comparison to the UI', async () => {
  let turn = 0;
  const { saver, w } = setup(async () =>
    ++turn === 1
      ? call('find_sellers', { productId: choice.product_id, sort: 'price' })
      : text('فروشگاه‌ها برای بررسی آماده‌اند.'),
  );
  try {
    const result = present(
      await w.run('seller-tool', { type: 'chat', message: 'فروشندگان این مدل را مقایسه کن' }),
    );
    assert.equal(result.selected.product_id, choice.product_id);
    assert.equal(result.phase, 'sellers');
    assert.ok(result.sellers.length >= 3);
    assert.equal(result.preferences.sort, 'price');
  } finally {
    saver.close();
  }
});

test('simulated price changes respect the stored budget and invalidate a previous visit', async () => {
  const { saver, w } = setup();
  try {
    let s = await w.run('price', { type: 'select', productId: choice.product_id });
    const offer = s.sellerOptions[0];
    await w.run('price', { type: 'preferences', preferences: { maxPrice: offer.price } });
    await w.run('price', { type: 'plan', offerId: offer.offer_id });
    s = await w.run('price', {
      type: 'verify',
      offerId: offer.offer_id,
      scenario: 'price_changed',
    });
    assert.equal(s.tripOfferId, null);
    assert.ok(!s.sellerOptions.some((o) => o.offer_id === offer.offer_id));
    assert.equal(s.verifications[offer.offer_id].price, Math.round(offer.price * 1.05));
  } finally {
    saver.close();
  }
});
