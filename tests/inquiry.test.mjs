import test from 'node:test';
import assert from 'node:assert/strict';
import { inquireNearest, simulatedVerification } from '../lib/inquiry.mjs';
const offer = (id, distance, state = 'open') => ({
  offer_id: id,
  name: id,
  price: 100,
  distance,
  opening: { state },
});
const product = { title: 'Test product' };
test('automatic inquiry skips closed shops and falls back after no answer in distance order', async () => {
  const contacted = [];
  const r = await inquireNearest({
    offers: [offer('far', 3), offer('closed', 1, 'closed'), offer('silent', 2)],
    product,
    preferences: { location: { lat: 35.7, lon: 51.4 } },
    adapter: async (args) => {
      contacted.push(args.offer.offer_id);
      assert.equal(args.preferences.location, undefined);
      return simulatedVerification(
        args.offer,
        args.offer.offer_id === 'silent' ? 'no_answer' : 'confirmed',
        args.preferences,
        product,
      );
    },
  });
  assert.deepEqual(contacted, ['silent', 'far']);
  assert.equal(r.inquiry.recommendedOfferId, 'far');
  assert.equal(r.inquiry.attempts[0].contacted, false);
});
test('fresh inquiry is reused but variant changes require another inquiry', async () => {
  let calls = 0;
  const args = {
    offers: [offer('one', 1)],
    product,
    preferences: { color: 'black' },
    adapter: async (a) => {
      calls++;
      return simulatedVerification(a.offer, 'confirmed', a.preferences, product);
    },
  };
  const first = await inquireNearest(args);
  await inquireNearest({ ...args, verifications: first.verifications });
  assert.equal(calls, 1);
  await inquireNearest({
    ...args,
    preferences: { color: 'white' },
    verifications: first.verifications,
  });
  assert.equal(calls, 2);
});
test('changed price above budget falls back and source offer price stays intact', async () => {
  const offers = [offer('expensive', 1), offer('affordable', 2)];
  const r = await inquireNearest({
    offers,
    product,
    preferences: { maxPrice: 102 },
    adapter: async (a) =>
      simulatedVerification(
        a.offer,
        a.offer.offer_id === 'expensive' ? 'price_changed' : 'confirmed',
        a.preferences,
        product,
      ),
  });
  assert.equal(r.inquiry.recommendedOfferId, 'affordable');
  assert.equal(offers[0].price, 100);
});
test('timeouts are bounded and missing distances never produce a nearest recommendation', async () => {
  const r = await inquireNearest({
    offers: [offer('one', 1), offer('two', 2), offer('three', 3)],
    product,
    preferences: {},
    maxContacts: 2,
    timeoutMs: 5,
    adapter: () => new Promise(() => {}),
  });
  assert.equal(r.inquiry.contacts, 2);
  assert.equal(r.inquiry.status, 'no_match');
  const missing = await inquireNearest({
    offers: [offer('unknown', null)],
    product,
    preferences: {},
  });
  assert.equal(missing.inquiry.contacts, 0);
});
