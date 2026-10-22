import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { once } from 'node:events';

test('HTTP session survives a server restart and separates inquiry results', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'torob-http-'));
  const reservation = net.createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise((r) => reservation.close(r));
  const base = `http://127.0.0.1:${port}`;
  let child;
  const start = async () => {
    child = spawn(process.execPath, ['server.mjs'], {
      env: {
        ...process.env,
        PORT: String(port),
        WORKFLOW_DB_PATH: join(dir, 'state.db'),
        BOXAPI_API_KEY: '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stderr.on('data', (b) => (output += b));
    for (let i = 0; i < 80; i++) {
      if (child.exitCode !== null) throw Error(output);
      try {
        const r = await fetch(base + '/api/stats');
        if (r.ok) return;
      } catch {}
      await delay(50);
    }
    throw Error('Server startup timeout: ' + output);
  };
  const stop = async () => {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
  };
  try {
    await start();
    const initial = await fetch(base + '/api/session');
    const cookie = initial.headers.get('set-cookie').split(';')[0];
    assert.match(initial.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    const post = async (path, event) => {
      const response = await fetch(base + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify(event),
      });
      const data = await response.json();
      return { response, data };
    };
    const search = await post('/api/workflow', {
      type: 'search',
      q: 'هدفون',
      preferences: { maxPrice: 3000000 },
    });
    assert.equal(search.response.status, 200);
    assert.ok(search.data.products.length);
    const id = search.data.products[0].product_id;
    const selected = await post('/api/workflow', { type: 'select', productId: id });
    const offer = selected.data.sellers[0].offer_id;
    const verification = await post('/api/verify', { offerId: offer, scenario: 'confirmed' });
    assert.equal(verification.data.simulated, true);
    assert.equal(
      (await post('/api/workflow', { type: 'plan', offerId: offer })).data.phase,
      'trip',
    );
    await stop();
    await start();
    const restored = await (
      await fetch(base + '/api/session', { headers: { Cookie: cookie } })
    ).json();
    assert.equal(restored.trip.seller.offer_id, offer);
    assert.equal(restored.preferences.maxPrice, 3000000);
    assert.equal(restored.trip.seller.verification.status, 'confirmed');
    const other = await (await fetch(base + '/api/session')).json();
    assert.equal(other.selected, null);
    assert.equal(other.trip, null);
    const csrf = await fetch(base + '/api/workflow', {
      method: 'POST',
      headers: {
        Origin: 'https://example.com',
        'Content-Type': 'application/json',
        Cookie: cookie,
      },
      body: '{}',
    });
    assert.equal(csrf.status, 403);
    assert.equal(
      (await post('/api/workflow', { type: 'chat', message: 'bypass' })).response.status,
      400,
    );
    assert.equal(
      (await fetch(base + '/api/workflow', { method: 'POST', body: 'invalid' })).status,
      400,
    );
    assert.equal((await fetch(base + '/.env')).status, 404);
    const reset = await post('/api/session/reset', {});
    assert.equal(reset.data.selected, null);
    assert.equal(reset.data.messages.length, 0);
  } finally {
    await stop();
    rmSync(dir, { recursive: true, force: true });
  }
});
