export function chatAction(mode, text = '') {
  if (mode === 'pausing') return 'wait';
  if (mode === 'running') return 'pause';
  if (mode === 'paused' && !text.trim()) return 'resume';
  return 'send';
}

export function priceRange(product, format = (n) => Number(n).toLocaleString('fa-IR')) {
  if (!(product.min_price > 0)) return 'قیمت ثبت نشده';
  const min = format(product.min_price),
    max = format(product.max_price);
  return product.max_price > product.min_price ? `${min} تا ${max} تومان` : `${min} تومان`;
}
