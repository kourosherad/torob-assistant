export async function drivingRoute(
  origin,
  destination,
  { fetchImpl = fetch, key = process.env.NESHAN_API_KEY } = {},
) {
  if (!key) throw Error('سرویس مسیریابی فعلاً در دسترس نیست.');
  for (const point of [origin, destination]) {
    if (
      !point ||
      !Number.isFinite(point.lat) ||
      !Number.isFinite(point.lon) ||
      Math.abs(point.lat) > 90 ||
      Math.abs(point.lon) > 180
    )
      throw Error('موقعیت معتبر برای محاسبه مسیر لازم است.');
  }
  const url = new URL('https://api.neshan.org/v4/direction');
  url.searchParams.set('type', 'car');
  url.searchParams.set('origin', origin.lat + ',' + origin.lon);
  url.searchParams.set('destination', destination.lat + ',' + destination.lon);
  url.searchParams.set('alternative', 'false');
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { 'Api-Key': key },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw Error('ارتباط با نشان برقرار نشد؛ کمی بعد دوباره تلاش کن.');
  }
  if (!response.ok) throw Error('نشان فعلاً امکان محاسبه این مسیر را ندارد.');
  const data = await response.json();
  const route = data.routes?.[0];
  if (!route?.legs?.length) throw Error('مسیر رانندگی برای این مقصد پیدا نشد.');
  const distance = route.legs.reduce((sum, leg) => sum + Number(leg.distance?.value || 0), 0);
  const seconds = route.legs.reduce((sum, leg) => sum + Number(leg.duration?.value || 0), 0);
  if (!(distance > 0) || !(seconds > 0)) throw Error('اطلاعات زمان یا فاصله مسیر کامل نیست.');
  return {
    distance,
    seconds,
    polyline: route.overview_polyline?.points || route.overview_polyline || null,
    at: new Date().toISOString(),
  };
}
