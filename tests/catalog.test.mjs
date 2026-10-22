import test from 'node:test';
import assert from 'node:assert/strict';
import { db, search, sellers, stats, distance, opening, normalize } from '../lib/catalog.mjs';
test('complete dataset and product/shop relationships', () => {
  assert.deepEqual(
    stats(),
    process.env.TEST_FIXTURE === '1'
      ? { products: 4, shops: 3, offers: 12 }
      : { products: 225903, shops: 6476, offers: 331506 },
  );
  assert.equal(
    db
      .prepare(
        'SELECT count(*) n FROM offers o LEFT JOIN products p ON o.product_id=p.product_id LEFT JOIN shops s ON o.shop_id=s.shop_id WHERE p.product_id IS NULL OR s.shop_id IS NULL',
      )
      .get().n,
    0,
  );
});
test('budget filter, parameter binding, and Persian normalization', () => {
  const products = search({ q: 'هدفون', maxPrice: 3000000 });
  assert.ok(products.length);
  assert.ok(products.every((p) => p.min_price > 0 && p.min_price <= 3000000));
  assert.equal(search({ q: "' OR 1=1 --" }).length, 0);
  assert.equal(normalize('كیف يک'), 'کیف یک');
});
test('installments require an explicitly in-person payment record', () => {
  const rows = search({ installments: true, limit: 5 });
  assert.ok(rows.length);
  for (const p of rows) {
    const shops = sellers(p.product_id, { installments: true });
    assert.ok(shops.length);
    assert.ok(shops.every((s) => s.payments.some((x) => x.channel === 'in_person')));
  }
  const budget = 3000000;
  for (const p of search({ installments: true, maxPrice: budget, limit: 30 }))
    assert.ok(
      sellers(p.product_id, { installments: true, maxPrice: budget }).length,
      'budget and installment conditions must match the same offer',
    );
});
test('unknown schedule stays unknown; Tehran time and split shifts work', () => {
  assert.equal(opening('{}').state, 'unknown');
  const schedule = JSON.stringify({
    thu: {
      status: 'declared',
      shifts: [
        { start_time: '10:00:00', end_time: '14:00:00' },
        { start_time: '17:00:00', end_time: '21:00:00' },
      ],
    },
  });
  assert.equal(opening(schedule, new Date('2026-10-22T08:00:00Z')).state, 'open');
  assert.equal(opening(schedule, new Date('2026-10-22T12:00:00Z')).state, 'closed');
  assert.equal(
    opening(JSON.stringify({ thu: { status: 'closed' } }), new Date('2026-10-22T08:00:00Z')).state,
    'closed',
  );
});
test('distance and seller ordering preserve unknown location', () => {
  assert.equal(distance(undefined, undefined, 35.7, 51.4), null);
  assert.equal(distance(35.7, 51.4, 35.7, 51.4), 0);
  const p = search({ q: 'هدفون' })[0];
  const rows = sellers(p.product_id, { sort: 'price' });
  assert.ok(rows.length);
  assert.ok(rows.every((r) => r.distance === null));
  const withLocation = sellers(p.product_id, { lat: 35.7, lon: 51.4, sort: 'distance' });
  assert.ok(withLocation.every((r, i) => !i || r.distance >= withLocation[i - 1].distance));
});
