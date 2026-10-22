import { appendFile } from 'node:fs/promises';
export const modelName = () => process.env.BOXAPI_MODEL || 'gpt-5.4-mini';
export async function callModel(messages, tools, allowTools = true) {
  if (!process.env.BOXAPI_API_KEY) throw Error('کلید مدل تنظیم نشده است.');
  const r = await fetch(
    `${process.env.BOXAPI_BASE_URL || 'https://ai.boxapi.ir/ai/v1'}/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.BOXAPI_API_KEY}`,
      },
      body: JSON.stringify({
        model: modelName(),
        messages,
        max_completion_tokens: 1000,
        ...(allowTools ? { tools, tool_choice: 'auto' } : {}),
      }),
      signal: AbortSignal.timeout(45000),
    },
  );
  if (!r.ok)
    throw Error(`سرویس مدل پاسخ نداد (${r.status}). جست‌وجو و مقایسه همچنان در دسترس است.`);
  const data = await r.json(),
    message = data.choices?.[0]?.message;
  if (!message) throw Error('پاسخ مدل قابل خواندن نبود.');
  const tokens = data.usage?.total_tokens || 0;
  await appendFile(
    'data/usage.jsonl',
    JSON.stringify({ time: new Date().toISOString(), model: modelName(), tokens }) + '\n',
  );
  return { message, tokens };
}
