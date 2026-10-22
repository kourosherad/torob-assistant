import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import http from 'node:http';
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
  let providerCalls = 0,
    providerReady;
  const providerStarted = new Promise((r) => (providerReady = r));
  const provider = http.createServer(async (req, res) => {
    for await (const _chunk of req) {
    }
    if (++providerCalls === 1) {
      providerReady();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        choices: [
          {
            message: {
              role: 'assistant',
              content: JSON.stringify({
                text: 'ادامه دادیم.',
                questions: [{ question: 'کدام کاربرد؟', options: ['موسیقی', 'مکالمه'] }],
              }),
            },
          },
        ],
        usage: { total_tokens: 10 },
      }),
    );
  });
  provider.listen(0, '127.0.0.1');
  await once(provider, 'listening');
  let child;
  const start = async () => {
    child = spawn(process.execPath, ['server.mjs'], {
      env: {
        ...process.env,
        PORT: String(port),
        WORKFLOW_DB_PATH: join(dir, 'state.db'),
        BOXAPI_API_KEY: 'synthetic-http-test-key',
        BOXAPI_BASE_URL: `http://127.0.0.1:${provider.address().port}`,
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
    const tabId = '10000000-0000-4000-8000-000000000001';
    const tabHeaders = { Cookie: cookie, 'X-Torob-Session': tabId };
    const freshTab = await (await fetch(base + '/api/session', { headers: tabHeaders })).json();
    assert.equal(freshTab.selected, null);
    assert.equal(freshTab.messages.length, 0);
    await fetch(base + '/api/workflow', {
      method: 'POST',
      headers: { ...tabHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'preferences', preferences: { color: 'قرمز' } }),
    });
    const sameTab = await (await fetch(base + '/api/session', { headers: tabHeaders })).json();
    assert.equal(sameTab.preferences.color, 'قرمز');
    const nextTab = await (
      await fetch(base + '/api/session', {
        headers: { ...tabHeaders, 'X-Torob-Session': '20000000-0000-4000-8000-000000000002' },
      })
    ).json();
    assert.equal(nextTab.preferences.color, undefined);
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
    const running = post('/api/chat', { message: 'برای خرید کمک می‌خواهم' });
    await providerStarted;
    assert.equal((await post('/api/chat/pause', {})).data.paused, true);
    assert.equal((await running).data.paused, true);
    const resumed = await post('/api/chat', { resume: true });
    assert.equal(resumed.response.status, 200);
    assert.equal(resumed.data.paused, false);
    assert.equal(resumed.data.messages.length, 2);
    assert.equal(resumed.data.ui.questions.length, 1);
    assert.equal(providerCalls, 2);
  } finally {
    await stop();
    provider.closeAllConnections();
    await new Promise((r) => provider.close(r));
    assert.ok(dir.startsWith(tmpdir()));
    rmSync(dir, { recursive: true, force: true });
  }
});
