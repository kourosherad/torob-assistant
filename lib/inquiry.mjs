// No phone calls or messages leave this adapter. Challenge phone numbers are synthetic.
export async function simulateInquiry({ offer, product, preferences }) {
  return simulatedVerification(offer, 'confirmed', preferences, product);
}

export function simulatedVerification(offer, status, preferences = {}, product = null) {
  const price = status === 'price_changed' ? Math.round(offer.price * 1.05) : offer.price;
  const answered = ['confirmed', 'price_changed', 'unavailable'].includes(status);
  return {
    status,
    simulated: true,
    source: 'demo',
    at: new Date().toISOString(),
    price,
    stock: answered ? status !== 'unavailable' : null,
    productTitle: product?.title || offer.title,
    modelConfirmed: answered && status !== 'unavailable',
    requested: { color: preferences.color || null, size: preferences.size || null },
    variantConfirmed: false,
    note: {
      confirmed:
        'پاسخ آزمایشی فروشنده: مدل، قیمت و موجودی تأیید شد؛ رنگ و سایز نیاز به بررسی جداگانه دارند.',
      closed: 'فروشگاه طبق برنامه ثبت‌شده بسته است؛ گزینه بعدی بررسی می‌شود.',
      no_answer: 'در سناریوی دمو فروشنده پاسخ نداد؛ گزینه بعدی بررسی می‌شود.',
      unavailable: 'در سناریوی دمو کالا ناموجود است؛ گزینه بعدی بررسی می‌شود.',
      price_changed: 'در سناریوی دمو قیمت ۵٪ افزایش پیدا کرد.',
    }[status],
  };
}

export async function inquireNearest({
  offers,
  product,
  preferences,
  verifications = {},
  adapter = simulateInquiry,
  maxContacts = 3,
  timeoutMs = 3000,
  now = Date.now(),
}) {
  const records = { ...verifications },
    attempts = [];
  let contacts = 0,
    recommendedOfferId = null;
  const nearest = [...offers].sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
  for (const offer of nearest) {
    if (offer.distance === null) continue;
    let v = records[offer.offer_id];
    const fresh =
      v &&
      Number.isFinite(Date.parse(v.at)) &&
      now - Date.parse(v.at) < 15 * 60 * 1000 &&
      now >= Date.parse(v.at) &&
      JSON.stringify(v.requested || {}) ===
        JSON.stringify({ color: preferences.color || null, size: preferences.size || null });
    if (offer.opening.state === 'closed') {
      v = simulatedVerification(offer, 'closed', preferences, product);
      v.source = 'schedule';
      records[offer.offer_id] = v;
      attempts.push({
        offerId: offer.offer_id,
        shopName: offer.name,
        status: 'closed',
        contacted: false,
        cached: false,
      });
      continue;
    }
    if (!fresh) {
      if (contacts >= maxContacts) break;
      contacts++;
      let timer;
      const controller = new AbortController();
      try {
        const timedOut = new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(Error('Seller timeout'));
          }, timeoutMs);
        });
        v = await Promise.race([
          adapter(
            {
              offer,
              product,
              preferences: { color: preferences.color || null, size: preferences.size || null },
            },
            { signal: controller.signal },
          ),
          timedOut,
        ]);
      } catch {
        v = simulatedVerification(offer, 'no_answer', preferences, product);
      } finally {
        clearTimeout(timer);
      }
      // The current adapter contract is deliberately restricted to simulation results.
      if (
        !v?.simulated ||
        !['confirmed', 'price_changed', 'unavailable', 'no_answer', 'closed'].includes(v.status) ||
        !Number.isFinite(v.price) ||
        v.price <= 0
      )
        v = simulatedVerification(offer, 'no_answer', preferences, product);
      records[offer.offer_id] = v;
    }
    attempts.push({
      offerId: offer.offer_id,
      shopName: offer.name,
      status: v.status,
      contacted: !fresh,
      cached: !!fresh,
    });
    if (
      ['confirmed', 'price_changed'].includes(v.status) &&
      (!preferences.maxPrice || v.price <= preferences.maxPrice)
    ) {
      recommendedOfferId = offer.offer_id;
      break;
    }
  }
  return {
    verifications: records,
    inquiry: {
      status: recommendedOfferId ? 'completed' : 'no_match',
      simulated: true,
      at: new Date(now).toISOString(),
      attempts,
      contacts,
      recommendedOfferId,
      note: recommendedOfferId
        ? 'نزدیک‌ترین گزینه قابل بررسی پیدا شد و استعلام آزمایشی آن انجام شد.'
        : 'با شرایط فعلی فروشنده قابل مراجعه پیدا نشد؛ محدوده، زمان مراجعه یا فیلترها را تغییر بده.',
    },
  };
}
