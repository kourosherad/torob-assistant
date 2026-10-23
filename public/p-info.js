export function createProductInfo({
  api,
  workflowEvent,
  getState,
  esc,
  money,
  fa,
  date,
  openLocation,
  checkShopChallenge,
  sendChoice,
}) {
  let active = null,
    epoch = 0,
    map = null;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  function disposeMap() {
    map?.remove();
    map = null;
  }
  function moveAnimation(before) {
    if (reduced()) return;
    for (const [element, rect] of before) {
      if (!element.isConnected) continue;
      const after = element.getBoundingClientRect();
      element.animate(
        [
          { transform: `translate(${rect.left - after.left}px, ${rect.top - after.top}px)` },
          { transform: 'translate(0,0)' },
        ],
        { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)' },
      );
    }
  }
  function close() {
    if (!active) return;
    epoch++;
    disposeMap();
    const { card, marker, trigger } = active;
    const before = new Map(
      [...card.parentElement.children]
        .filter((e) => e.nodeType === 1)
        .map((e) => [e, e.getBoundingClientRect()]),
    );
    card.querySelector('.p-info')?.remove();
    card.classList.remove('p-expanded');
    trigger?.setAttribute('aria-expanded', 'false');
    marker.replaceWith(card);
    active = null;
    moveAnimation(before);
    if (!reduced()) {
      card.animate(
        [
          { height: before.get(card).height + 'px', overflow: 'hidden' },
          { height: card.getBoundingClientRect().height + 'px', overflow: 'hidden' },
        ],
        { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)' },
      );
    }
    trigger?.focus({ preventScroll: true });
    card.scrollIntoView({ behavior: reduced() ? 'instant' : 'smooth', block: 'nearest' });
  }
  async function open(card, productId, { restore = false } = {}) {
    if (active?.card === card) {
      close();
      return;
    }
    close();
    const current = ++epoch;
    const trigger = card.querySelector('[data-select]');
    const before = new Map(
      [...card.parentElement.children].map((e) => [e, e.getBoundingClientRect()]),
    );
    const marker = document.createComment('p-info original position');
    card.before(marker);
    card.parentElement.append(card);
    card.classList.add('p-expanded');
    card.classList.remove('card-reveal');
    trigger?.setAttribute('aria-expanded', 'true');
    const panel = document.createElement('section');
    panel.className = 'p-info';
    panel.setAttribute('aria-label', 'اطلاعات محصول و فروشگاه‌ها');
    panel.innerHTML =
      '<div class="p-info-top"><div><span class="p-eyebrow">انتخاب فروشگاه</span><h3>شرایط خرید، یک‌جا</h3></div><button class="p-back" type="button">بازگشت به محصولات ↑</button></div><div class="p-content" aria-live="polite">در حال دریافت فروشگاه‌ها…</div>';
    card.append(panel);
    panel.querySelector('.p-back').onclick = close;
    active = { card, panel, marker, trigger, productId, selectedOfferId: null };
    moveAnimation(before);
    if (!reduced())
      card.animate(
        [
          { height: before.get(card).height + 'px', overflow: 'hidden' },
          { height: card.getBoundingClientRect().height + 'px', overflow: 'hidden' },
        ],
        { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)' },
      );
    panel.animate?.(
      [
        { opacity: 0, transform: 'translateY(12px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: reduced() ? 0 : 400 },
    );
    card.scrollIntoView({ behavior: reduced() ? 'instant' : 'smooth', block: 'start' });
    try {
      if (!restore) await workflowEvent({ type: 'select', productId });
      if (current !== epoch) return;
      if (restore)
        active.selectedOfferId =
          getState().trip?.seller?.offer_id || getState().workflow?.challenge?.offerId || null;
      render();
    } catch (error) {
      if (current === epoch) panel.querySelector('.p-content').textContent = error.message;
    }
  }
  function installments(offer) {
    const inPerson = (offer.payments || []).filter((payment) => payment.channel === 'in_person');
    return inPerson.length
      ? '<span class="p-tag p-tag-green">اقساط حضوری · ' +
          esc(inPerson.map((p) => p.provider_name).join('، ')) +
          '</span>'
      : '<span class="p-tag">' +
          ((offer.payments || []).length ? 'اقساط حضوری تأیید نشده' : 'اطلاعات اقساط ثبت نشده') +
          '</span>';
  }
  function render() {
    if (!active) return;
    const state = getState();
    if (state.selected?.product_id !== active.productId) return;
    disposeMap();
    const offers = [...state.sellers].sort(
      (a, b) =>
        (a.price > 0 ? a.price : Infinity) - (b.price > 0 ? b.price : Infinity) ||
        String(a.offer_id).localeCompare(String(b.offer_id)),
    );
    const selected = offers.find((offer) => offer.offer_id === active.selectedOfferId);
    const product = state.selected;
    active.panel.querySelector('.p-content').innerHTML =
      '<p class="p-caption">پیشنهادهای ثبت‌شده فروشگاه‌ها · از کمترین قیمت · موجودی لحظه‌ای تأیید نشده</p><div class="p-shop-list">' +
      (offers.length
        ? offers
            .map(
              (offer) =>
                '<button type="button" class="p-shop ' +
                (selected?.offer_id === offer.offer_id ? 'is-selected' : '') +
                '" data-offer="' +
                esc(offer.offer_id) +
                '" aria-pressed="' +
                (selected?.offer_id === offer.offer_id) +
                '"><span class="p-shop-title">' +
                esc(offer.name) +
                '<small>' +
                esc(offer.opening.label) +
                '</small></span><span class="p-shop-price">' +
                money(offer.price) +
                installments(offer) +
                '</span></button>',
            )
            .join('')
        : '<p class="p-empty">فروشگاهی مطابق شرایط گفته‌شده پیدا نشد.</p>') +
      '</div><div class="p-details">' +
      (selected
        ? detailHtml(selected, product, state)
        : '<div class="p-empty">یک فروشگاه را انتخاب کن تا مسیر، ساعت کاری و جزئیات خرید را ببینی.</div>') +
      '</div>';
    active.panel.querySelectorAll('[data-offer]').forEach(
      (button) =>
        (button.onclick = async () => {
          const owner = active;
          const offerId = button.dataset.offer;
          owner.selectedOfferId = offerId;
          render();
          try {
            await checkShopChallenge(offerId, { inline: true });
            if (active === owner && owner.selectedOfferId === offerId) render();
          } catch (error) {
            if (active === owner)
              owner.panel.querySelector('.p-check-status').textContent = error.message;
          }
        }),
    );
    active.panel.querySelector('[data-set-location]')?.addEventListener('click', openLocation);
    active.panel.querySelectorAll('[data-challenge-choice]').forEach(
      (button) =>
        (button.onclick = async () => {
          const controls = [...active.panel.querySelectorAll('[data-challenge-choice]')];
          controls.forEach((control) => (control.disabled = true));
          try {
            await sendChoice(
              'پاسخ به بررسی فروشگاه جایگزین: ' + button.textContent,
              button.textContent,
            );
          } finally {
            controls.forEach((control) => (control.disabled = false));
          }
        }),
    );
    if (selected) loadMapAndRoute(selected, state, epoch);
  }
  function detailHtml(offer, product, state) {
    const point = Number.isFinite(offer.lat) && Number.isFinite(offer.lon);
    const link = point ? `https://neshan.org/maps/share/${offer.lat},${offer.lon}` : '';
    const inquiry =
      state.workflow?.challenge?.offerId === offer.offer_id ? state.workflow.challenge : null;
    const status = inquiry
      ? {
          confirmed: 'شبیه‌سازی چالش · قیمت تأیید شد',
          no_answer: 'شبیه‌سازی چالش · فروشنده پاسخ نداد',
          closed: 'طبق ساعت کاری ثبت‌شده، فروشگاه بسته است',
          declined: 'بررسی جایگزین متوقف شد',
          exhausted: 'فروشگاه جایگزین مطابق شرایط پیدا نشد',
        }[inquiry.status] || ''
      : 'در حال بررسی قیمت در شبیه‌سازی چالش…';
    let schedule = {};
    try {
      schedule = JSON.parse(offer.hours || '{}');
    } catch {
      /* No fabricated hours. */
    }
    const days = [
      ['sat', 'شنبه'],
      ['sun', 'یکشنبه'],
      ['mon', 'دوشنبه'],
      ['tue', 'سه‌شنبه'],
      ['wed', 'چهارشنبه'],
      ['thu', 'پنجشنبه'],
      ['fri', 'جمعه'],
    ];
    return (
      '<div class="p-detail-heading"><h3>' +
      esc(offer.name) +
      '</h3>' +
      installments(offer) +
      '</div><p class="p-check-status" role="status">' +
      esc(status) +
      '</p>' +
      (inquiry && ['no_answer', 'closed'].includes(inquiry.status)
        ? '<div class="p-challenge-actions"><span>فروشگاه دیگری پیدا کنم؟</span><button type="button" class="p-back" data-challenge-choice>بله، فروشگاه دیگری پیدا کن</button><button type="button" class="p-back" data-challenge-choice>نه، فعلاً ادامه نده</button></div>'
        : '') +
      '<div class="p-detail-grid"><section class="p-module p-map-module"><div class="p-module-head"><h4>مسیر رسیدن · نشان</h4><span class="p-tag">خودرو</span></div><div class="p-map" role="region" aria-label="نقشه موقعیت فروشگاه"><p class="p-map-fallback">' +
      (point ? 'در حال آماده‌سازی نقشه…' : 'مختصات فروشگاه ثبت نشده') +
      '</p></div><div class="p-route-stats" aria-live="polite">' +
      (state.location
        ? 'در حال محاسبه مسیر رانندگی…'
        : 'برای فاصله رانندگی و زمان رسیدن، موقعیتت را ثبت کن.') +
      '</div>' +
      (!state.location
        ? '<button type="button" class="text-button" data-set-location>ثبت موقعیت من</button>'
        : '') +
      '<p class="p-address">' +
      esc(offer.address || 'آدرس ثبت نشده') +
      '</p>' +
      (link
        ? '<a href="' +
          link +
          '" target="_blank" rel="noopener noreferrer" class="text-button">باز کردن در نشان ↗</a>'
        : '') +
      '</section><section class="p-module"><div class="p-module-head"><h4>قیمت و شرایط پرداخت</h4></div><div class="p-big-price">' +
      money(offer.price) +
      '</div><p class="p-caption">آخرین تغییر قیمت: ' +
      (offer.changed ? date(offer.changed) : 'ثبت نشده') +
      '</p>' +
      installments(offer) +
      '<div class="p-history-empty"><span>تاریخچه قیمت</span><p>داده تاریخی برای رسم نمودار این فروشگاه ثبت نشده است.</p></div></section><section class="p-module"><div class="p-module-head"><h4>ساعت کاری</h4><span class="p-tag ' +
      (offer.opening.state === 'open' ? 'p-tag-green' : '') +
      '">' +
      esc(offer.opening.label) +
      '</span></div><p class="p-caption">براساس زمان جاری تهران و برنامه ثبت‌شده</p><dl class="p-hours">' +
      days
        .map(([key, label]) => {
          const day = schedule[key];
          return (
            '<div><dt>' +
            label +
            '</dt><dd>' +
            (day?.status === 'closed'
              ? 'تعطیل'
              : day?.status === 'declared'
                ? esc(
                    (day.shifts || [])
                      .map(
                        (shift) =>
                          shift.start_time.slice(0, 5) + ' تا ' + shift.end_time.slice(0, 5),
                      )
                      .join('، ') || 'ثبت نشده',
                  )
                : 'ثبت نشده') +
            '</dd></div>'
          );
        })
        .join('') +
      '</dl></section><section class="p-module"><h4>اطلاعات محصول</h4><p>' +
      esc(product.title) +
      '</p><dl class="p-specs">' +
      (product.specs || [])
        .slice(0, 12)
        .map(
          (spec) =>
            '<div><dt>' +
            esc(spec.key) +
            '</dt><dd>' +
            esc(typeof spec.value === 'object' ? JSON.stringify(spec.value) : spec.value) +
            '</dd></div>',
        )
        .join('') +
      '</dl>' +
      (!(product.specs || []).length
        ? '<p class="p-caption">مشخصات تکمیلی ثبت نشده است.</p>'
        : '') +
      '</section></div>'
    );
  }
  async function loadMapAndRoute(offer, state, version) {
    const owner = active;
    const valid = () =>
      active === owner &&
      epoch === version &&
      owner.selectedOfferId === offer.offer_id &&
      container.isConnected;
    const container = owner.panel.querySelector('.p-map');
    const stats = owner.panel.querySelector('.p-route-stats');
    let sdkMap;
    try {
      if (!Number.isFinite(offer.lat) || !Number.isFinite(offer.lon))
        throw Error('مختصات فروشگاه ثبت نشده است.');
      const config = await api('/api/p-info/config');
      if (!valid()) return;
      if (config.mapKey) {
        if (!document.querySelector('#neshan-map-style')) {
          const css = document.createElement('link');
          css.id = 'neshan-map-style';
          css.rel = 'stylesheet';
          css.href = '/vendor/neshan-map.css';
          document.head.append(css);
        }
        const { default: sdk } = await import('/vendor/neshan-map.js');
        if (!valid() || !container.isConnected) return;
        container.replaceChildren();
        sdkMap = new sdk.Map({
          container,
          style: 'https://static.neshan.org/sdk/maplibre/styles/light.json',
          center: [offer.lon, offer.lat],
          zoom: 14,
          apiKey: config.mapKey,
        });
        map = sdkMap;
        new sdk.Marker({ color: '#d70040' }).setLngLat([offer.lon, offer.lat]).addTo(sdkMap);
        if (state.location)
          new sdk.Marker({ color: '#24243b' })
            .setLngLat([state.location.lon, state.location.lat])
            .addTo(sdkMap);
      } else
        container.querySelector('p').textContent =
          'نقشه داخل برنامه فعلاً در دسترس نیست؛ موقعیت را در نشان باز کن.';
    } catch (error) {
      if (valid()) container.textContent = error.message;
    }
    if (!state.location || !valid()) return;
    try {
      const route = await api('/api/p-info/route', { offerId: offer.offer_id });
      if (!valid()) return;
      const arrival = new Date(Date.now() + route.seconds * 1000).toLocaleTimeString('fa-IR', {
        timeZone: 'Asia/Tehran',
        hour: '2-digit',
        minute: '2-digit',
      });
      stats.innerHTML =
        '<div><strong>' +
        fa(Math.max(1, Math.ceil(route.seconds / 60))) +
        ' دقیقه</strong><small>زمان تقریبی رانندگی</small></div><div><strong>' +
        fa(Math.round(route.distance / 100) / 10) +
        ' کیلومتر</strong><small>مسافت مسیر</small></div><div><strong>' +
        arrival +
        '</strong><small>رسیدن حدود ساعت</small></div>';
      if (sdkMap && typeof route.polyline === 'string') {
        const coordinates = decodePolyline(route.polyline);
        const draw = () => {
          if (!valid() || !coordinates.length) return;
          sdkMap.addSource('route', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates },
            },
          });
          sdkMap.addLayer({
            id: 'route',
            type: 'line',
            source: 'route',
            paint: { 'line-color': '#d70040', 'line-width': 5 },
          });
          const lngs = coordinates.map((p) => p[0]),
            lats = coordinates.map((p) => p[1]);
          sdkMap.fitBounds(
            [
              [Math.min(...lngs), Math.min(...lats)],
              [Math.max(...lngs), Math.max(...lats)],
            ],
            { padding: 35, maxZoom: 15 },
          );
        };
        if (sdkMap.loaded()) draw();
        else sdkMap.once('load', draw);
      }
    } catch (error) {
      if (valid())
        stats.textContent =
          error.message +
          (offer.distance != null ? ' فاصله مستقیم: ' + fa(offer.distance) + ' کیلومتر.' : '');
    }
  }
  function refresh() {
    if (active && active.selectedOfferId) {
      const inquiry = getState().workflow?.challenge;
      if (
        inquiry?.attempted?.includes(active.selectedOfferId) &&
        inquiry.offerId !== active.selectedOfferId
      )
        active.selectedOfferId = inquiry.offerId;
      render();
    }
  }
  return {
    open,
    close,
    refresh,
    get active() {
      return active;
    },
  };
}
export function decodePolyline(encoded) {
  let index = 0,
    lat = 0,
    lng = 0;
  const coordinates = [];
  const read = () => {
    let result = 0,
      shift = 0,
      byte;
    do {
      if (index >= encoded.length || shift > 30) throw Error('مسیر قابل نمایش نیست.');
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 31) << shift;
      shift += 5;
    } while (byte >= 32);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    lat += read();
    lng += read();
    coordinates.push([lng / 1e5, lat / 1e5]);
  }
  return coordinates;
}
