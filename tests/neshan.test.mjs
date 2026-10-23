import test from 'node:test';
import assert from 'node:assert/strict';
import { drivingRoute } from '../lib/neshan.mjs';
import { decodePolyline } from '../public/p-info.js';
const origin = { lat: 35.7116, lon: 51.407 };
const destination = { lat: 35.695, lon: 51.411 };
test('driving route uses private header and validates distance/time from the provider', async () => {
  const route = await drivingRoute(origin, destination, {
    key: 'test-secret',
    fetchImpl: async (url, options) => {
      assert.equal(url.hostname, 'api.neshan.org');
      assert.equal(url.searchParams.get('type'), 'car');
      assert.equal(url.searchParams.get('origin'), '35.7116,51.407');
      assert.equal(options.headers['Api-Key'], 'test-secret');
      assert.ok(!url.toString().includes('test-secret'));
      return {
        ok: true,
        json: async () => ({
          routes: [
            {
              legs: [{ distance: { value: 3000 }, duration: { value: 600 } }],
              overview_polyline: { points: 'encoded' },
            },
          ],
        }),
      };
    },
  });
  assert.equal(route.distance, 3000);
  assert.equal(route.seconds, 600);
  assert.equal(route.polyline, 'encoded');
  assert.ok(!JSON.stringify(route).includes('test-secret'));
});
test('route failures never produce invented travel times', async () => {
  await assert.rejects(drivingRoute(origin, destination, { key: '' }));
  await assert.rejects(drivingRoute(null, destination, { key: 'test' }));
  await assert.rejects(
    drivingRoute(origin, destination, { key: 'test', fetchImpl: async () => ({ ok: false }) }),
  );
  await assert.rejects(
    drivingRoute(origin, destination, {
      key: 'test',
      fetchImpl: async () => ({ ok: true, json: async () => ({ routes: [] }) }),
    }),
  );
});
test('route geometry decodes to longitude/latitude for the map', () => {
  assert.deepEqual(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@'), [
    [-120.2, 38.5],
    [-120.95, 40.7],
    [-126.453, 43.252],
  ]);
  assert.throws(() => decodePolyline('_'));
});
