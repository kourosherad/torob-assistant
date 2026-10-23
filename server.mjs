import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { db, search, product, sellers, stats } from './lib/catalog.mjs';
import { SqliteCheckpointer } from './lib/checkpointer.mjs';
import { createWorkflow, present } from './lib/workflow.mjs';
import { modelName } from './lib/model.mjs';
import { drivingRoute } from './lib/neshan.mjs';

const PORT = Number(process.env.PORT) || 3210;
const checkpointer = new SqliteCheckpointer(process.env.WORKFLOW_DB_PATH || 'data/workflow.db');
const workflow = createWorkflow({ checkpointer, sellerSimulation: false });
const send = (res, status, data) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
};
async function body(req) {
  let b = '';
  for await (const chunk of req) {
    b += chunk;
    if (Buffer.byteLength(b) > 40000)
      throw Object.assign(Error('درخواست بیش از حد طولانی است.'), { status: 413 });
  }
  try {
    return JSON.parse(b || '{}');
  } catch {
    throw Object.assign(Error('ساختار درخواست معتبر نیست.'), { status: 400 });
  }
}
function session(req, res) {
  const candidate =
    req.headers['x-torob-session'] ||
    req.headers.cookie
      ?.split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith('torob_session='))
      ?.slice(14);
  if (
    candidate &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
  )
    return candidate;
  const id = randomUUID();
  res.setHeader('Set-Cookie', `torob_session=${id}; HttpOnly; SameSite=Strict; Path=/`);
  return id;
}
const lastCalls = new Map();
const routeCache = new Map();
let activeModels = 0;
const server = http.createServer(async (req, res) => {
  try {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const url = new URL(req.url, 'http://localhost');
    const p = Object.fromEntries(url.searchParams);
    const mapAssets = {
      '/vendor/neshan-map.js': ['neshan-maplibre-sdk.js', 'text/javascript; charset=utf-8'],
      '/vendor/neshan-map.css': ['neshan-maplibre-sdk.css', 'text/css; charset=utf-8'],
    };
    if (mapAssets[url.pathname]) {
      const [name, type] = mapAssets[url.pathname];
      const content = await readFile(
        resolve('node_modules/@neshan-maps-platform/maplibre-sdk/dist', name),
      );
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=3600' });
      return res.end(content);
    }
    if (
      req.method === 'POST' &&
      req.headers.origin &&
      !['http://localhost:' + PORT, 'http://127.0.0.1:' + PORT].includes(req.headers.origin)
    )
      return send(res, 403, { error: 'مبدأ درخواست مجاز نیست.' });
    if (url.pathname === '/api/stats')
      return send(res, 200, {
        ...stats(),
        model: modelName(),
        configured: Boolean(process.env.BOXAPI_API_KEY),
        engine: 'langgraph',
      });
    if (url.pathname === '/api/search') return send(res, 200, { products: search(p) });
    if (url.pathname === '/api/categories')
      return send(
        res,
        200,
        db
          .prepare(
            'SELECT category,count(*) count FROM products GROUP BY category ORDER BY count DESC LIMIT 100',
          )
          .all(),
      );
    if (url.pathname === '/api/product') return send(res, 200, product(p.id));
    if (url.pathname.startsWith('/api/')) {
      const id = session(req, res);
      if (url.pathname === '/api/p-info/config')
        return send(res, 200, { mapKey: process.env.NESHAN_MAP_KEY || '' });
      if (url.pathname === '/api/p-info/route' && req.method === 'POST') {
        const input = await body(req);
        const current = present(await workflow.state(id));
        const offer = current.sellers.find((item) => item.offer_id === input.offerId);
        const origin = current.preferences.location;
        if (!offer || !origin)
          return send(res, 400, { error: 'برای محاسبه مسیر، موقعیت خودت و فروشگاه را انتخاب کن.' });
        const cacheKey = [id, offer.offer_id, origin.lat, origin.lon].join(':');
        const cached = routeCache.get(cacheKey);
        if (cached && Date.now() - cached.time < 120000) return send(res, 200, cached.route);
        const route = await drivingRoute(origin, { lat: offer.lat, lon: offer.lon });
        if (routeCache.size >= 100) routeCache.delete(routeCache.keys().next().value);
        routeCache.set(cacheKey, { time: Date.now(), route });
        return send(res, 200, route);
      }
      if (url.pathname === '/api/session' && req.method === 'GET')
        return send(res, 200, present(await workflow.state(id)));
      if (url.pathname === '/api/workflow' && req.method === 'POST') {
        const event = await body(req);
        if (['chat', 'resume'].includes(event.type))
          return send(res, 400, { error: 'برای گفت‌وگو از مسیر دستیار استفاده کن.' });
        return send(res, 200, present(await workflow.run(id, event)));
      }
      if (url.pathname === '/api/session/reset' && req.method === 'POST') {
        await workflow.reset(id);
        return send(res, 200, present());
      }
      if (url.pathname === '/api/sellers') {
        const state = await workflow.state(id);
        return send(
          res,
          200,
          state.selectedId === p.id
            ? { sellers: present(state).sellers }
            : { sellers: sellers(p.id, p) },
        );
      }
      if (url.pathname === '/api/verify' && req.method === 'POST') {
        const input = await body(req);
        const result = await workflow.run(id, {
          type: 'verify',
          offerId: input.offerId,
          scenario: input.scenario || 'confirmed',
        });
        return send(res, 200, {
          ...result.verifications[input.offerId],
          workflow: present(result),
        });
      }
      if (url.pathname === '/api/chat' && req.method === 'POST') {
        const input = await body(req);
        if (activeModels >= 2 || (!input.resume && Date.now() - (lastCalls.get(id) || 0) < 1500))
          return send(res, 429, { error: 'کمی صبر کن؛ درخواست دیگری در حال پردازش است.' });
        const message =
          input.message || input.messages?.filter((m) => m.role === 'user').at(-1)?.content;
        activeModels++;
        lastCalls.set(id, Date.now());
        try {
          const result = present(
            await workflow.run(
              id,
              input.resume
                ? { type: 'resume' }
                : { type: 'chat', message, displayContent: input.displayContent },
            ),
          );
          return send(res, result.error ? 502 : 200, { ...result, workflow: result });
        } finally {
          activeModels--;
        }
      }
      if (url.pathname === '/api/chat/pause' && req.method === 'POST')
        return send(res, 200, present(await workflow.pause(id)));
      return send(res, 404, { error: 'مسیر پیدا نشد.' });
    }
    const name = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const file = resolve('public', name);
    if (!file.startsWith(resolve('public') + sep))
      return send(res, 403, { error: 'دسترسی مجاز نیست.' });
    try {
      const content = await readFile(file);
      res.writeHead(200, {
        'Content-Type':
          {
            '.html': 'text/html; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
            '.js': 'text/javascript; charset=utf-8',
            '.svg': 'image/svg+xml',
            '.woff2': 'font/woff2',
          }[extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(content);
    } catch {
      send(res, 404, { error: 'فایل پیدا نشد.' });
    }
  } catch (e) {
    console.error(e.message);
    send(res, e.status || 400, { error: e.message || 'خطایی رخ داد.' });
  }
});
server.listen(PORT, '127.0.0.1', () =>
  console.log(`Torob assistant (LangGraph): http://localhost:${PORT}`),
);
for (const sig of ['SIGTERM', 'SIGINT'])
  process.on(sig, () =>
    server.close(() => {
      checkpointer.close();
      process.exit(0);
    }),
  );
