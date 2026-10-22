import { createReadStream } from 'node:fs';
export async function* csv(file) {
  let field = '',
    row = [],
    quoted = false,
    pendingQuote = false,
    header;
  for await (const chunk of createReadStream(file, { encoding: 'utf8' })) {
    for (const c of chunk) {
      if (pendingQuote) {
        pendingQuote = false;
        if (c === '"') {
          field += '"';
          continue;
        }
        quoted = false;
      }
      if (quoted) {
        if (c === '"') pendingQuote = true;
        else field += c;
        continue;
      }
      if (c === '"') {
        quoted = true;
        continue;
      }
      if (c === ',') {
        row.push(field);
        field = '';
        continue;
      }
      if (c === '\n') {
        row.push(field.replace(/\r$/, ''));
        field = '';
        if (!header) header = row.map((x) => x.replace(/^\uFEFF/, ''));
        else yield Object.fromEntries(header.map((k, i) => [k, row[i] === 'null' ? null : row[i]]));
        row = [];
        continue;
      }
      field += c;
    }
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ''));
    if (header)
      yield Object.fromEntries(header.map((k, i) => [k, row[i] === 'null' ? null : row[i]]));
  }
}
