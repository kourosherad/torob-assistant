export function checkChallenge(offers, offerId, previous, random = Math.random) {
  const offer = offers.find((item) => item.offer_id === offerId);
  if (!offer) throw Error('فروشگاه با شرایط خرید فعلی پیدا نشد.');
  if (previous?.offerId === offerId && Date.now() - Date.parse(previous.at) < 900000)
    return previous;
  return {
    offerId,
    shopName: offer.name,
    price: offer.price,
    simulated: true,
    at: new Date().toISOString(),
    status:
      offer.opening.state === 'closed' ? 'closed' : random() < 0.65 ? 'confirmed' : 'no_answer',
    attempted: [...new Set([...(previous?.attempted || []), offerId])],
  };
}
export function challengeReply(inquiry) {
  const prefix = 'شبیه‌سازی چالش: ';
  if (inquiry.status === 'confirmed')
    return {
      text:
        prefix +
        'فروشنده پاسخ داد و قیمت ثبت‌شده را تأیید کرد؛ می‌توانی این گزینه را برای خرید انتخاب کنی.',
      questions: [],
    };
  if (inquiry.status === 'declined')
    return {
      text: 'باشه؛ فروشگاه دیگری بررسی نمی‌کنم. هر وقت خواستی بگو ادامه بدهیم.',
      questions: [],
    };
  if (inquiry.status === 'exhausted')
    return {
      text: 'فروشگاه دیگری مطابق شرایطت پیدا نشد؛ بودجه و شرط اقساطت را تغییر ندادم.',
      questions: [],
    };
  return {
    text:
      prefix +
      (inquiry.status === 'closed'
        ? 'طبق ساعت کاری ثبت‌شده، این فروشگاه الان بسته است.'
        : 'فروشنده پاسخ نداد و تأیید قیمت دریافت نشد.'),
    questions: [
      {
        question: 'می‌خواهی فروشگاه دیگری پیدا کنم؟',
        options: ['بله، فروشگاه دیگری پیدا کن', 'نه، فعلاً ادامه نده'],
      },
    ],
  };
}
export function answerChallenge(offers, previous, accepted, random = Math.random) {
  if (!previous || !['no_answer', 'closed'].includes(previous.status))
    throw Error('استعلامی منتظر پاسخ نیست.');
  if (!accepted) return { ...previous, status: 'declined' };
  const next = offers.find(
    (offer) => !previous.attempted.includes(offer.offer_id) && offer.opening.state !== 'closed',
  );
  return next
    ? checkChallenge(offers, next.offer_id, previous, random)
    : { ...previous, status: 'exhausted' };
}
