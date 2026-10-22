import { appendFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
export const modelName = () => process.env.BOXAPI_MODEL || 'gpt-5-mini';
export function createModelClient({ fetchImpl = fetch, wait = delay, recordUsage = record } = {}) {
  return async function request(messages, tools, allowTools = true, { signal } = {}) {
    signal?.throwIfAborted();
    if (!process.env.BOXAPI_API_KEY) throw Error('کلید مدل تنظیم نشده است.');
    const url = `${(process.env.BOXAPI_BASE_URL || 'https://ai.boxapi.ir/ai/v1').replace(/\/$/, '')}/chat/completions`;
    const payload = JSON.stringify({
      model: modelName(),
      ...(modelName() === 'gpt-5-mini' ? { reasoning_effort: 'minimal' } : {}),
      messages,
      max_completion_tokens: 1000,
      response_format: { type: 'json_object' },
      ...(allowTools ? { tools, tool_choice: 'auto' } : {}),
    });
    let r;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        r = await fetchImpl(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.BOXAPI_API_KEY}`,
          },
          body: payload,
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(25000)])
            : AbortSignal.timeout(25000),
        });
      } catch (error) {
        signal?.throwIfAborted();
        if (
          attempt === 0 &&
          (error instanceof TypeError || ['TimeoutError', 'AbortError'].includes(error.name))
        ) {
          await wait(700, undefined, { signal });
          continue;
        }
        throw Error('ارتباط با BoxAPI برقرار نشد یا زمان پاسخ تمام شد؛ دوباره تلاش کن.');
      }
      if (r.ok) break;
      if (attempt === 0 && [429, 502, 503, 504].includes(r.status)) {
        await r.body?.cancel();
        const seconds = Number(r.headers.get('retry-after'));
        await wait(
          Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 2000) : 700,
          undefined,
          { signal },
        );
        continue;
      }
      if ([401, 403].includes(r.status))
        throw Error('BoxAPI کلید یا دسترسی این مدل را نپذیرفت؛ تنظیمات کلید باید بررسی شود.');
      if (r.status === 402) throw Error('اعتبار حساب BoxAPI کافی نیست؛ موجودی حساب را بررسی کن.');
      if (r.status === 429) throw Error('محدودیت درخواست BoxAPI فعال است؛ کمی بعد دوباره تلاش کن.');
      throw Error(
        `سرویس BoxAPI موقتاً پاسخ نداد (${r.status})؛ دوباره تلاش کن. جست‌وجوی مستقیم فعال است.`,
      );
    }
    const data = await r.json(),
      message = data.choices?.[0]?.message;
    if (!message) throw Error('پاسخ مدل قابل خواندن نبود.');
    const tokens = data.usage?.total_tokens || 0;
    await recordUsage(tokens);
    return { message, tokens };
  };
}
async function record(tokens) {
  await appendFile(
    'data/usage.jsonl',
    JSON.stringify({ time: new Date().toISOString(), model: modelName(), tokens }) + '\n',
  );
}
export const callModel = createModelClient();
