import { chatAction, priceRange } from './chat-controls.js';
import { createProductInfo } from './p-info.js';
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const paths = {
  spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3z',
  pin: 'M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0z M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  store: 'M3 10v11h18V10 M2 10l2-7h16l2 7 M2 10q3 5 5 0 3 5 5 0 3 5 5 0 3 5 5 0 M9 21v-7h6v7',
  route:
    'M6 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0 M22 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0 M8 5h8a4 4 0 0 1 0 8H8a3 3 0 0 0 0 6h8',
  check: 'm5 12 4 4L19 6',
  search: 'M20 20l-5-5 M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
  sliders: 'M4 7h16 M4 17h16 M8 4v6 M16 14v6',
  arrow: 'M19 12H5 m7-7-7 7 7 7',
  chevron: 'm8 10 4 4 4-4',
  info: 'M12 11v6 M12 7h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  box: 'm3 7 9-4 9 4v10l-9 4-9-4V7z m0 0 9 4 9-4 M12 11v10',
  clock: 'M12 7v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
};
const icon = (n) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[n] || paths.box}"/></svg>`;
$$('[data-icon]').forEach((e) => (e.innerHTML = icon(e.dataset.icon)));
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const fa = (n) => Number(n).toLocaleString('fa-IR');
const money = (n) => (n > 0 ? `${fa(n)} <small>تومان</small>` : 'قیمت نامشخص');
const date = (s) => {
  try {
    return new Date(s).toLocaleDateString('fa-IR');
  } catch {
    return 'نامشخص';
  }
};
const safeImage = (s) => {
  try {
    const u = new URL(s);
    return u.protocol === 'https:' ? esc(s) : '';
  } catch {
    return '';
  }
};
let state = {
  products: [],
  compare: new Map(),
  messages: [],
  selected: null,
  sellers: [],
  trip: null,
  location: null,
  filters: {},
  query: 'هدفون',
  view: 'discover',
};
try {
  state.location = JSON.parse(localStorage.getItem('torob_location'));
} catch {}
const pInfo = createProductInfo({
  api,
  workflowEvent,
  getState: () => state,
  esc,
  money,
  fa,
  date,
  openLocation,
  checkShopChallenge,
  sendChoice: (text, display) => sendChat(text, display),
});
async function api(path, data) {
  let sessionId = sessionStorage.getItem('torob_session');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem('torob_session', sessionId);
    sessionStorage.removeItem('torob_chat_started');
  }
  const chats = readChats();
  if (!chats.some((chat) => chat.id === sessionId)) {
    chats.unshift({ id: sessionId, title: 'گفتگوی جدید' });
    sessionStorage.setItem('torob_chats', JSON.stringify(chats));
  }
  const r = await fetch(
    path,
    data
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Torob-Session': sessionId },
          body: JSON.stringify(data),
        }
      : { headers: { 'X-Torob-Session': sessionId } },
  );
  const result = await r.json();
  if (!r.ok) {
    const error = Error(result.error || 'درخواست انجام نشد.');
    error.workflow = result.workflow;
    throw error;
  }
  return result;
}
function toast(text) {
  $('#toast').textContent = text;
  $('#toast').hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($('#toast').hidden = true), 4500);
}
function modal(title, html) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = html;
  $('#modal').showModal();
}
$('#closeModal').onclick = () => $('#modal').close();
$('#modal').addEventListener('click', (e) => {
  if (e.target === $('#modal')) {
    const r = e.target.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
      e.target.close();
  }
});
function setView(view) {
  if (view === 'shops' && !state.selected) {
    toast('اول یک محصول انتخاب کن تا فروشنده‌هایش را ببینیم.');
    return;
  }
  state.view = 'discover';
  document.body.dataset.view = 'discover';
  $('#discoverView').hidden = false;
  updateCompare();
  if (view === 'shops' || view === 'trip') {
    if (view === 'trip') renderTrip();
    const panel = $('#' + view + 'View');
    let bubble = panel.closest('.inline-chat-panel');
    if (!bubble) {
      bubble = addBubble(
        'assistant',
        view === 'shops' ? 'فروشگاه‌های این محصول و شرایط خرید' : 'آدرس و اطلاعات مراجعه',
      );
      bubble.classList.add('inline-chat-panel');
      bubble.append(panel);
    } else $('#chatMessages').append(bubble);
    panel.hidden = false;
    document.body.classList.remove('chat-empty');
    bubble.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
$$('[data-view]').forEach((b) => (b.onclick = () => setView(b.dataset.view)));
function productPicture(p, cls = '') {
  const src = safeImage(p.images?.[0]);
  return src
    ? `<img class="${cls}" loading="lazy" src="${src}" alt="${esc(p.title)}" referrerpolicy="no-referrer">`
    : `<span class="image-placeholder">${icon('box')}</span>`;
}
function bindImageFallbacks(root = document) {
  root.querySelectorAll('img').forEach(
    (img) =>
      (img.onerror = () => {
        img.replaceWith(
          Object.assign(document.createElement('span'), {
            className: 'image-placeholder',
            innerHTML: icon('box'),
          }),
        );
      }),
  );
}
function renderProducts(root, items) {
  if (!items.length) {
    root.innerHTML = '';
    return;
  }
  root.innerHTML = items
    .map(
      (p) =>
        `<article class="product-card"><button class="product-image" data-detail="${p.product_id}" aria-label="مشخصات ${esc(p.title)}">${productPicture(p)}</button><span class="product-category">${esc(p.brand || p.category)}</span><h3>${esc(p.title)}</h3><div class="price-row"><span class="product-range">${esc(priceRange(p))}</span></div><p class="seller-count">در ${fa(p.seller_count || 0)} فروشگاه · قیمت ثبت‌شده</p><div class="card-actions"><button data-select="${p.product_id}">فروشگاه‌ها ←</button></div></article>`,
    )
    .join('');
  root
    .querySelectorAll('[data-select]')
    .forEach((b) => (b.onclick = () => pInfo.open(b.closest('.product-card'), b.dataset.select)));
  root
    .querySelectorAll('[data-detail]')
    .forEach((b) => (b.onclick = () => pInfo.open(b.closest('.product-card'), b.dataset.detail)));
  bindImageFallbacks(root);
}
function updateCompare() {
  $('#compareBar').hidden = state.compare.size === 0 || state.view !== 'discover';
  $('#compareCount').textContent = `${fa(state.compare.size)} محصول برای مقایسه`;
  $('#compareButton').disabled = state.compare.size < 2;
}
$('#clearCompare').onclick = () => {
  state.compare.clear();
  updateCompare();
  $$('[data-compare]').forEach((box) => (box.checked = false));
};
$('#compareButton').onclick = () => {
  const list = [...state.compare.values()];
  const keys = [...new Set(list.flatMap((p) => (p.specs || []).map((s) => s.key)))].slice(0, 20);
  modal(
    'مقایسه؛ کدام به کارت می‌آید؟',
    `<p class="modal-prose">مشخصات ثبت‌شده محصولات؛ اطلاعات خالی یعنی «ثبت نشده».</p><div class="table-scroll"><table class="spec-table"><thead><tr><th>ویژگی</th>${list.map((p) => `<th>${productPicture(p, 'modal-product-img')}${esc(p.title)}</th>`).join('')}</tr></thead><tbody><tr><th>شروع قیمت ثبت‌شده</th>${list.map((p) => `<td>${money(p.min_price)}</td>`).join('')}</tr>${keys.map((k) => `<tr><th>${esc(k)}</th>${list.map((p) => `<td>${esc(p.specs.find((s) => s.key === k)?.value || 'ثبت نشده')}</td>`).join('')}</tr>`).join('')}<tr><th>قدم بعد</th>${list.map((p) => `<td><button class="primary" data-modal-select="${p.product_id}">دیدن فروشگاه‌ها</button></td>`).join('')}</tr></tbody></table></div><button class="text-button" id="askComparison">از دستیار بخواه تفاوت این گزینه‌ها را توضیح دهد ←</button>`,
  );
  $$('[data-modal-select]').forEach(
    (b) =>
      (b.onclick = () => {
        $('#modal').close();
        selectProduct(b.dataset.modalSelect);
      }),
  );
  $('#askComparison').onclick = () => {
    $('#modal').close();
    setView('discover');
    sendChat(
      'این محصولات را با ابزار compare_products با توجه به بودجه و نیازهایی که گفته‌ام مقایسه کن؛ مزایا، محدودیت‌ها و تفاوت‌های کاربردی را بگو و در پایان یک گزینه برای من پیشنهاد بده و دلیلش را توضیح بده: ' +
        list.map((p) => p.product_id).join('، '),
      'این گزینه‌ها را مقایسه کن و بگو کدام برای من مناسب‌تر است: ' +
        list.map((p) => p.title).join('، '),
    );
  };
  bindImageFallbacks($('#modal'));
};
async function showDetail(id) {
  try {
    const p =
      state.products.find((p) => p.product_id === id) || (await api('/api/product?id=' + id));
    const bubble = addBubble('assistant', p.title);
    bubble.classList.add('inline-chat-panel');
    const details = document.createElement('div');
    details.innerHTML = `${productPicture(p, 'modal-product-img')}<div class="table-scroll"><table class="spec-table">${p.specs.length ? p.specs.map((s) => `<tr><th>${esc(s.key)}</th><td>${esc(s.value)}</td></tr>`).join('') : '<tr><td>مشخصات ثبت نشده است.</td></tr>'}</table></div><div class="modal-actions"><button class="primary">پیدا کردن فروشگاه</button></div>`;
    details.querySelector('button').onclick = () => selectProduct(id);
    bubble.append(details);
    bindImageFallbacks(bubble);
    bubble.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    toast(e.message);
  }
}
async function selectProduct(id) {
  try {
    let button = $$('[data-select]').findLast((button) => button.dataset.select === id);
    if (!button) {
      const product = await api('/api/product?id=' + encodeURIComponent(id));
      const bubble = addBubble('assistant', '', { products: [product] });
      button = bubble.querySelector('[data-select]');
    }
    await pInfo.open(button.closest('.product-card'), id);
  } catch (e) {
    toast(e.message);
  }
}
function shopContacts(s) {
  const links = [
    ['وب‌سایت', s.website],
    ['اینستاگرام', s.instagram],
  ]
    .map(([label, value]) => {
      try {
        const url = new URL(value);
        return ['https:', 'http:'].includes(url.protocol)
          ? '<a href="' +
              esc(url.href) +
              '" target="_blank" rel="noopener noreferrer">' +
              label +
              ' ↗</a>'
          : '';
      } catch {
        return '';
      }
    })
    .filter(Boolean)
    .join(' · ');
  return links ? '<div class="seller-contacts">' + links + '</div>' : '';
}
function renderSellers() {
  const ordered = state.sellers;
  $('#distanceNote').textContent = state.location
    ? 'فاصله‌ها خط مستقیم از «' +
      state.location.label +
      '» هستند؛ مسافت رانندگی و زمان رسیدن محاسبه نشده است.'
    : 'برای نمایش فاصله فروشگاه‌ها، موقعیت خودت را از تنظیمات یا انتخاب مبدأ ثبت کن.';
  if (!ordered.length) {
    $('#sellers').innerHTML =
      '<div class="empty">فروشگاهی با این فیلترها پیدا نشد؛ فیلترهای قیمت، ساعت، اقساط یا شعاع را تغییر بده.</div>';
    return;
  }
  $('#sellers').innerHTML = ordered
    .map((s) => {
      const payments = s.payments || [];
      const inPerson = payments.filter((payment) => payment.channel === 'in_person');
      const installmentText = inPerson.length
        ? 'اقساط حضوری ثبت شده: ' + inPerson.map((payment) => payment.provider_name).join('، ')
        : payments.length
          ? 'اقساط حضوری تأیید نشده؛ اطلاعات ثبت‌شده را ببین.'
          : 'اطلاعات اقساط ثبت نشده';
      const distanceText = !state.location
        ? 'برای نمایش فاصله، موقعیت را ثبت کن'
        : s.distance == null
          ? 'مختصات فروشگاه ثبت نشده'
          : s.distance === 0
            ? 'کمتر از ۱۰۰ متر فاصله مستقیم'
            : s.distance < 1
              ? fa(Math.round(s.distance * 1000)) + ' متر فاصله مستقیم'
              : fa(s.distance) + ' کیلومتر فاصله مستقیم';
      const paymentDetails = payments
        .map(
          (payment) =>
            '<span class="badge">' +
            esc(payment.provider_name) +
            ' · ' +
            (payment.channel === 'in_person'
              ? 'حضوری'
              : payment.channel === 'online'
                ? 'آنلاین'
                : 'نحوه پذیرش نامشخص') +
            '</span>',
        )
        .join('');
      return (
        '<article class="seller-card"><div class="seller-head"><div class="seller-name"><span class="store-avatar">' +
        icon('store') +
        '</span><div><h3>' +
        esc(s.name) +
        '</h3><span class="badge ' +
        (s.opening.state === 'open' ? 'green' : '') +
        '">' +
        esc(s.opening.label) +
        '</span></div></div><div class="seller-price"><small>قیمت ثبت‌شده</small><span class="price">' +
        money(s.price) +
        '</span></div></div><p class="seller-address">' +
        icon('pin') +
        esc(s.address || 'آدرس ثبت نشده') +
        '</p><dl class="seller-facts"><div><dt>آخرین تغییر قیمت</dt><dd>' +
        (s.changed ? date(s.changed) : 'تاریخ ثبت نشده') +
        '</dd></div><div><dt>فاصله از مبدأ شما</dt><dd>' +
        distanceText +
        '</dd></div><div><dt>خرید اقساطی</dt><dd>' +
        esc(installmentText) +
        '</dd></div></dl><div class="badges">' +
        paymentDetails +
        '</div><p class="seller-source-note">قیمت و شرایط از اطلاعات ثبت‌شده فروشگاه است؛ موجودی و مبلغ نهایی نیاز به تأیید فروشنده دارد.</p>' +
        shopContacts(s) +
        '<div class="seller-actions"><button class="trip-button" data-trip="' +
        s.offer_id +
        '">آدرس و راهنمای مراجعه ←</button></div></article>'
      );
    })
    .join('');
  $$('[data-trip]').forEach(
    (button) =>
      (button.onclick = async () => {
        button.disabled = true;
        try {
          await checkShopChallenge(button.dataset.trip);
          setView('trip');
        } catch (error) {
          toast(error.message);
        } finally {
          button.disabled = false;
        }
      }),
  );
}
function renderTrip() {
  if (!state.trip) {
    $('#tripContent').innerHTML =
      '<div class="empty">هنوز فروشگاهی برای مراجعه انتخاب نکردی.</div>';
    return;
  }
  const { seller, product } = state.trip;
  const map =
    seller.lat && seller.lon
      ? 'https://neshan.org/maps/share/' + Number(seller.lat) + ',' + Number(seller.lon)
      : '';
  $('#tripContent').innerHTML =
    '<div class="trip-grid"><div class="trip-card"><h3>' +
    esc(seller.name) +
    '</h3><p>' +
    esc(product.title) +
    '</p><p>' +
    esc(seller.address || 'آدرس ثبت نشده') +
    '</p>' +
    (map
      ? '<a class="text-button" href="' +
        map +
        '" target="_blank" rel="noopener noreferrer">باز کردن موقعیت فروشگاه در نشان ↗</a>'
      : '') +
    '</div><div class="trip-card"><h3>اطلاعات مراجعه</h3><p>قیمت ثبت‌شده: <span class="price">' +
    money(seller.price) +
    '</span></p><p>آخرین تغییر قیمت: ' +
    (seller.changed ? date(seller.changed) : 'ثبت نشده') +
    '</p><p>' +
    esc(seller.opening.label) +
    '</p><p class="challenge-status">' +
    esc(
      state.workflow?.challenge?.offerId === seller.offer_id
        ? {
            confirmed: 'شبیه‌سازی چالش · قیمت تأیید شد',
            no_answer: 'شبیه‌سازی چالش · فروشنده پاسخ نداد؛ قیمت تأیید نشده',
            closed: 'فروشگاه طبق برنامه ثبت‌شده بسته است',
            declined: 'بررسی فروشگاه جایگزین متوقف شد',
            exhausted: 'فروشگاه جایگزین مطابق شرایط پیدا نشد',
          }[state.workflow.challenge.status] || ''
        : 'قیمت ثبت‌شده فروشگاه',
    ) +
    '</p><div class="trip-actions"><button class="primary" id="tripAlternatives">دیدن فروشگاه‌های دیگر</button></div><div class="trip-cancel"><button class="text-button" id="removeTrip">لغو مراجعه به این فروشگاه</button></div></div></div>';
  $('#tripAlternatives').onclick = () => setView('shops');
  $('#removeTrip').onclick = async () => {
    try {
      await workflowEvent({ type: 'clear_trip' });
      renderTrip();
    } catch (error) {
      toast(error.message);
    }
  };
}
async function checkShopChallenge(offerId, { inline = false } = {}) {
  const previous = state.workflow?.challenge;
  const result = await workflowEvent({ type: 'challenge_check', offerId });
  if (
    !inline &&
    (!previous ||
      previous.offerId !== result.challenge.offerId ||
      previous.at !== result.challenge.at)
  ) {
    addBubble('assistant', result.reply, result.ui, true);
  }
  return result;
}
function updateLocation() {
  if (state.location) $('#locationLabel').textContent = state.location.label;
}
function openLocation() {
  const areas = [
    ['میدان ولیعصر', 35.7116, 51.407],
    ['میدان تجریش', 35.8044, 51.429],
    ['میدان انقلاب', 35.7008, 51.391],
    ['میدان صادقیه', 35.7215, 51.3355],
    ['میدان هفت‌تیر', 35.7158, 51.426],
    ['میدان جمهوری', 35.6912, 51.3896],
  ];
  modal(
    'از کدام محدوده خرید می‌کنی؟',
    `<p class="modal-prose">یک مبدأ تقریبی برای مقایسه فاصله انتخاب کن. موقعیتت به سرویس مدل ارسال نمی‌شود.</p><button class="primary" id="useCurrentLocation">استفاده از موقعیت فعلی</button><p id="locationError" role="status"></p><div class="location-options">${areas.map((a, i) => `<button data-area="${i}">${icon('pin')} ${a[0]}</button>`).join('')}</div><div class="coordinates"><label>عرض جغرافیایی<input id="customLat" type="number" step="any" placeholder="35.7"></label><label>طول جغرافیایی<input id="customLon" type="number" step="any" placeholder="51.4"></label><button class="primary" id="saveCoords">ثبت مبدأ دلخواه</button></div><button class="text-button" id="clearLocation">حذف مبدأ ذخیره‌شده</button>`,
  );
  const save = async (location) => {
    if (
      !Number.isFinite(location.lat) ||
      !Number.isFinite(location.lon) ||
      location.lat < 35.3 ||
      location.lat > 36 ||
      location.lon < 50.8 ||
      location.lon > 52
    ) {
      $('#locationError').textContent =
        'موقعیت باید در محدوده تهران باشد؛ محدوده دیگری را دستی انتخاب کن.';
      return;
    }
    try {
      await workflowEvent({ type: 'preferences', preferences: { location } });
      localStorage.setItem('torob_location', JSON.stringify(location));
      updateLocation();
      $('#modal').close();
      if (state.selected) {
        renderSellers();
        pInfo.refresh();
      }
      toast('موقعیت ثبت شد؛ فاصله مستقیم تا فروشگاه‌ها به‌روز شد.');
    } catch (e) {
      toast(e.message);
    }
  };
  $('#useCurrentLocation').onclick = () => {
    const message = $('#locationError');
    const button = $('#useCurrentLocation');
    if (!navigator.geolocation) {
      message.textContent = 'موقعیت دستگاه در دسترس نیست؛ محدوده را انتخاب کن.';
      return;
    }
    message.textContent = 'در انتظار موقعیت دستگاه…';
    button.disabled = true;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        button.disabled = false;
        if (!message.isConnected || !$('#modal').open) return;
        save({ label: 'موقعیت فعلی من', lat: p.coords.latitude, lon: p.coords.longitude });
      },
      (error) => {
        button.disabled = false;
        message.textContent =
          error.code === 1
            ? 'اجازه دسترسی به موقعیت داده نشد؛ از تنظیمات مرورگر فعالش کن یا محدوده را دستی انتخاب کن.'
            : error.code === 3
              ? 'دریافت موقعیت طول کشید؛ دوباره تلاش کن یا محدوده را دستی انتخاب کن.'
              : 'موقعیت دستگاه در دسترس نیست؛ GPS را روشن کن یا محدوده را دستی انتخاب کن.';
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  };
  $$('[data-area]').forEach(
    (b) =>
      (b.onclick = () => {
        const [label, lat, lon] = areas[b.dataset.area];
        save({ label, lat, lon });
      }),
  );
  $('#saveCoords').onclick = () => {
    const lat = Number($('#customLat').value),
      lon = Number($('#customLon').value);
    if (lat < 35.3 || lat > 36 || lon < 50.8 || lon > 52)
      return toast('برای این دیتاست مبدأیی در محدوده تهران وارد کن.');
    save({ label: 'مبدأ دلخواه', lat, lon });
  };
  $('#clearLocation').onclick = async () => {
    state.location = null;
    localStorage.removeItem('torob_location');
    $('#locationLabel').textContent = 'تهران، محدوده دلخواه';
    $('#modal').close();
    try {
      await workflowEvent({ type: 'preferences', preferences: { location: null } });
      if (state.selected) {
        renderSellers();
        pInfo.refresh();
      }
    } catch (e) {
      toast(e.message);
    }
  };
}
$('#locationButton').onclick = openLocation;
$('#chatLocationButton').onclick = () => {
  $('#settingsMenu').close();
  openLocation();
};
$('#settingsButton').onclick = () => $('#settingsMenu').showModal();
$('#settingsMenu').addEventListener('click', (event) => {
  if (event.target !== $('#settingsMenu')) return;
  const rect = event.target.getBoundingClientRect();
  if (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  )
    event.target.close();
});
function animateReply(bubble, content) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  const segments = [];
  let node;
  while ((node = walker.nextNode())) segments.push({ node, chars: Array.from(node.textContent) });
  const total = segments.reduce((sum, segment) => sum + segment.chars.length, 0);
  const duration = Math.min(total * 9, 4500);
  const height = content.getBoundingClientRect().height;
  if (total) content.style.minHeight = height + 'px';
  for (const segment of segments) segment.node.textContent = '';
  let start;
  const frame = (time) => {
    if (!bubble.isConnected) return;
    start ??= time;
    const progress = duration ? Math.min(1, (time - start) / duration) : 1;
    let remaining = Math.floor(total * progress);
    for (const segment of segments) {
      const visible = Math.min(segment.chars.length, remaining);
      segment.node.textContent = segment.chars.slice(0, visible).join('');
      remaining -= visible;
    }
    if (progress < 1) requestAnimationFrame(frame);
    else content.style.removeProperty('min-height');
  };
  if (total) requestAnimationFrame(frame);
  bubble.querySelectorAll('.product-card').forEach((card, index) => {
    card.style.setProperty('--reveal-delay', duration + index * 100 + 'ms');
    card.classList.add('card-reveal');
  });
}
function addBubble(role, text, ui, animate = false) {
  document.body.classList.remove('chat-empty');
  const div = document.createElement('div');
  div.className = 'bubble ' + role;
  const content = document.createElement('div');
  content.className = 'message-text';
  // Only bold emphasis is supported; provider text is never inserted as HTML.
  const pieces = String(text || '').split(/(\*\*[^*]+\*\*)/g);
  for (const piece of pieces) {
    if (piece.startsWith('**') && piece.endsWith('**')) {
      const strong = document.createElement('strong');
      strong.textContent = piece.slice(2, -2);
      content.append(strong);
    } else content.append(document.createTextNode(piece));
  }
  if (text) div.append(content);
  $('#chatMessages').append(div);
  if (role === 'assistant' && ui) {
    if (ui.notice) {
      const notice = document.createElement('p');
      notice.className = 'info-banner';
      notice.textContent = ui.notice;
      div.append(notice);
    }
    if (ui.products?.length) {
      const cards = document.createElement('div');
      cards.className = 'product-grid chat-product-grid';
      div.append(cards);
      renderProducts(cards, ui.products);
    }
    const questions = ui.questions || [];
    if (questions.length > 1) {
      const group = document.createElement('div');
      const answers = new Map();
      const submit = document.createElement('button');
      submit.type = 'button';
      submit.className = 'primary question-submit';
      submit.textContent = 'ثبت پاسخ‌ها';
      submit.disabled = true;
      for (const [index, question] of questions.entries()) {
        renderQuestion(group, question, (value) => {
          if (value) answers.set(index, value);
          else answers.delete(index);
          submit.disabled = answers.size !== questions.length;
        });
      }
      submit.onclick = () => {
        if (['running', 'pausing'].includes(requestMode))
          return toast('برای تغییر درخواست، ابتدا آن را متوقف کن.');
        if (answers.size !== questions.length) return;
        group.querySelectorAll('button,input,textarea').forEach((el) => (el.disabled = true));
        sendChat(
          questions
            .map((question, index) => question.question + ' ' + answers.get(index))
            .join('\n'),
          questions.map((_, index) => answers.get(index)).join('، '),
        );
      };
      group.append(submit);
      div.append(group);
    } else {
      for (const question of questions) renderQuestion(div, question);
    }
  }
  if (animate && role === 'assistant') animateReply(div, content);
  scrollChat();
  return div;
}
function scrollChat() {
  $('#chatMessages').scrollTop = $('#chatMessages').scrollHeight;
}
function renderQuestion(container, question, onSelect) {
  const section = document.createElement('section');
  section.className = 'question-card';
  const title = document.createElement('p');
  title.textContent = question.question;
  section.append(title);
  const options = document.createElement('div');
  options.className = 'question-options';
  section.append(options);
  const answer = (value) => {
    if (['running', 'pausing'].includes(requestMode)) {
      toast('برای تغییر درخواست، ابتدا آن را متوقف کن.');
      return;
    }
    if (onSelect) {
      onSelect(value);
      return;
    }
    section.querySelectorAll('button,input,textarea').forEach((e) => (e.disabled = true));
    sendChat(question.question + ' ' + value, value);
  };
  for (const option of question.options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = option;
    button.onclick = () => {
      if (['running', 'pausing'].includes(requestMode))
        return toast('برای تغییر درخواست، ابتدا آن را متوقف کن.');
      options.querySelectorAll('button').forEach((el) => {
        el.classList.toggle('selected', el === button);
        el.setAttribute('aria-pressed', String(el === button));
      });
      answer(option);
    };
    options.append(button);
  }
  const other = document.createElement('button');
  other.type = 'button';
  other.className = 'other-option';
  other.textContent = 'سایر';
  other.onclick = () => {
    if (['running', 'pausing'].includes(requestMode))
      return toast('برای تغییر درخواست، ابتدا آن را متوقف کن.');
    if (onSelect) onSelect('');
    options.querySelectorAll('button').forEach((el) => {
      el.classList.toggle('selected', el === other);
      el.setAttribute('aria-pressed', String(el === other));
    });
    options.hidden = true;
    const form = document.createElement('form');
    form.className = 'other-answer';
    const input = document.createElement('textarea');
    input.rows = 2;
    input.maxLength = 1000;
    input.setAttribute('aria-label', 'پاسخ دلخواه به ' + question.question);
    const send = document.createElement('button');
    send.type = 'submit';
    send.className = 'primary';
    send.textContent = onSelect ? 'ثبت پاسخ دلخواه' : 'ارسال پاسخ';
    if (onSelect) {
      send.hidden = true;
      input.oninput = () => onSelect(input.value.trim());
    }
    const back = document.createElement('button');
    back.type = 'button';
    back.textContent = 'بازگشت';
    back.onclick = () => {
      form.remove();
      options.hidden = false;
      if (onSelect) onSelect('');
      other.classList.remove('selected');
      other.setAttribute('aria-pressed', 'false');
    };
    form.append(input, send, back);
    form.onsubmit = (e) => {
      e.preventDefault();
      const value = input.value.trim();
      if (value) answer(value);
    };
    section.append(form);
    input.focus({ preventScroll: true });
  };
  options.append(other);
  container.append(section);
}
let requestMode = 'idle',
  requestEpoch = 0,
  pendingBubble = null,
  lastChatText = '',
  lastChatDisplay = '',
  activeUserBubble = null,
  submissionSent = false,
  localPaused = false;
const initialPlaceholder = $('#chatInput').getAttribute('placeholder') || '';
function syncChatButton() {
  const action = chatAction(requestMode, $('#chatInput').value);
  const icons = {
    send: 'M19 12H5 m7-7-7 7 7 7',
    pause: 'M8 5v14 M16 5v14',
    resume: 'm8 4 12 8-12 8V4z',
    wait: 'M12 3v3 M12 18v3 M3 12h3 M18 12h3',
  };
  const labels = {
    send: 'ارسال به دستیار',
    pause: 'توقف درخواست',
    resume: 'ادامه درخواست',
    wait: 'در حال توقف',
  };
  $('#sendButton').innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + icons[action] + '"/></svg>';
  $('#sendButton').setAttribute('aria-label', labels[action]);
  $('#sendButton').title = labels[action];
  $('#sendButton').disabled = action === 'wait';
  $('#sendButton').dataset.action = action;
}
function clearChatPlaceholder() {
  sessionStorage.setItem('torob_chat_started', '1');
  $('#chatInput').placeholder = '';
}
function markPaused() {
  requestMode = 'paused';
  if (pendingBubble) {
    pendingBubble.className = 'bubble assistant paused';
    pendingBubble.textContent = 'درخواست متوقف شد؛ می‌تونی ادامه بدی یا پیام جدید بفرستی.';
  }
  syncChatButton();
}
function showThinking(bubble) {
  bubble.className = 'bubble assistant pending';
  bubble.setAttribute('role', 'status');
  bubble.setAttribute('aria-label', 'در حال بررسی');
  bubble.replaceChildren();
  const label = document.createElement('span');
  label.className = 'thinking-label';
  label.textContent = 'در حال بررسی';
  const dots = document.createElement('span');
  dots.className = 'thinking-dots';
  dots.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 3; i++) dots.append(document.createElement('i'));
  bubble.append(label, dots);
}
async function sendChat(text, displayContent = text) {
  if (!text.trim() || ['running', 'pausing'].includes(requestMode)) return;
  const chats = readChats();
  const currentChat = chats.find((chat) => chat.id === sessionStorage.getItem('torob_session'));
  if (currentChat && currentChat.title === 'گفتگوی جدید') {
    currentChat.title = text.trim().slice(0, 60);
    sessionStorage.setItem('torob_chats', JSON.stringify(chats));
  }
  if (requestMode === 'paused') pendingBubble?.remove();
  clearChatPlaceholder();
  $('#chatInput').value = '';
  lastChatText = text;
  lastChatDisplay = displayContent;
  activeUserBubble = addBubble('user', displayContent);
  state.messages.push({ role: 'user', content: text });
  pendingBubble = addBubble('assistant pending', '');
  showThinking(pendingBubble);
  localPaused = false;
  return runChat({ message: text, displayContent });
}
async function runChat(payload) {
  const epoch = ++requestEpoch;
  requestMode = 'running';
  submissionSent = false;
  syncChatButton();
  try {
    await workflowQueue;
    if (epoch !== requestEpoch) return;
    if (requestMode === 'pausing') {
      localPaused = true;
      markPaused();
      return;
    }
    submissionSent = true;
    const result = await api('/api/chat', payload);
    if (epoch !== requestEpoch) return;
    applyWorkflow(result.workflow);
    if (result.paused) {
      markPaused();
      return;
    }
    pendingBubble?.remove();
    pendingBubble = null;
    requestMode = 'idle';
    state.products = result.products || [];
    addBubble('assistant', result.reply, result.ui, true);
    if (result.selected && result.phase === 'sellers') {
      if (pInfo.active?.productId === result.selected.product_id) pInfo.refresh();
      else await selectProduct(result.selected.product_id);
    }
  } catch (e) {
    if (epoch !== requestEpoch) return;
    pendingBubble?.remove();
    pendingBubble = null;
    requestMode = 'idle';
    if (e.workflow) applyWorkflow(e.workflow);
    const failure = addBubble('error', e.message);
    if (e.workflow?.ui?.products?.length)
      addBubble('assistant', 'این گزینه‌ها پیش از خطا پیدا شدند.', {
        products: e.workflow.ui.products,
      });
    const retry = document.createElement('button');
    const failedText = lastChatText,
      failedUserBubble = activeUserBubble;
    retry.className = 'primary';
    retry.textContent = 'تلاش دوباره';
    retry.onclick = () => {
      if (['running', 'pausing'].includes(requestMode)) return;
      failure.remove();
      failedUserBubble?.remove();
      sendChat(failedText, lastChatDisplay);
    };
    failure.append(document.createElement('br'), retry);
  } finally {
    if (epoch === requestEpoch) syncChatButton();
    scrollChat();
  }
}
async function pauseChat() {
  if (requestMode !== 'running') return;
  const epoch = requestEpoch;
  requestMode = 'pausing';
  syncChatButton();
  if (!submissionSent) return;
  try {
    const result = await api('/api/chat/pause', {});
    if (epoch !== requestEpoch) return;
    if (result.paused) {
      applyWorkflow(result);
      markPaused();
    }
  } catch (e) {
    if (epoch === requestEpoch && requestMode === 'pausing') {
      requestMode = 'running';
      syncChatButton();
      toast(e.message);
    }
  }
}
function resumeChat() {
  if (requestMode !== 'paused') return;
  if (pendingBubble) {
    showThinking(pendingBubble);
  }
  const payload = localPaused
    ? { message: lastChatText, displayContent: lastChatDisplay }
    : { resume: true };
  localPaused = false;
  return runChat(payload);
}
$('#chatForm').onsubmit = (e) => {
  e.preventDefault();
  setView('discover');
  const action = chatAction(requestMode, $('#chatInput').value);
  if (action === 'pause') pauseChat();
  else if (action === 'resume') resumeChat();
  else if (action === 'send') sendChat($('#chatInput').value.trim());
};
$('#chatInput').oninput = syncChatButton;
$('#chatInput').onkeydown = (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (['idle', 'paused'].includes(requestMode)) $('#chatForm').requestSubmit();
  }
};
document.body.append($('#chatForm'));
syncChatButton();
queueMicrotask(initializeWorkflow);
let workflowQueue = Promise.resolve();
function applyWorkflow(data) {
  state.workflow = data;
  state.messages = data.messages || [];
  state.selected = data.selected || null;
  state.sellers = data.sellers || [];
  state.trip = data.trip || null;
  if ($('#tripView').closest('.inline-chat-panel')) renderTrip();
  const prefs = data.preferences || {};
  if (prefs.q !== undefined) {
    state.query = prefs.q;
  }
  state.filters = { maxPrice: prefs.maxPrice || 0, installments: !!prefs.installments };
  state.location = prefs.location || null;
  $('#locationLabel').textContent = state.location?.label || 'تهران، محدوده دلخواه';
}
function workflowEvent(event) {
  const operation = workflowQueue
    .catch(() => {})
    .then(() => api('/api/workflow', event))
    .then((data) => {
      applyWorkflow(data);
      return data;
    });
  workflowQueue = operation.catch(() => {});
  return operation;
}
function renderSelected() {
  if (!state.selected) return;
  $('#selectedProduct').innerHTML =
    '<div class="selected-summary">' +
    productPicture(state.selected) +
    '<div><h3>' +
    esc(state.selected.title) +
    '</h3><p>فروشنده‌های همین محصول؛ موجودی هنوز تأیید نشده است.</p></div><button id="changeProduct">تغییر محصول</button></div>';
  $('#changeProduct').onclick = () => setView('discover');
  bindImageFallbacks($('#selectedProduct'));
}
async function initializeWorkflow() {
  try {
    const previousLocation = state.location;
    const data = await api('/api/session');
    applyWorkflow(data);
    if (!Object.keys(data.preferences).length && previousLocation)
      await workflowEvent({ type: 'preferences', preferences: { location: previousLocation } });
    for (const m of data.messages || []) addBubble(m.role, m.displayContent ?? m.content, m.ui);
    if (
      data.messages?.some((m) => m.role === 'user') ||
      sessionStorage.getItem('torob_chat_started')
    )
      clearChatPlaceholder();
    else $('#chatInput').placeholder = initialPlaceholder;
    if (data.paused) {
      lastChatText = data.messages.filter((m) => m.role === 'user').at(-1)?.content || '';
      pendingBubble = addBubble('assistant paused', '');
      markPaused();
    }
    state.products = data.products || [];
    // The initial view is conversation-only; cards appear after an explicit assistant search.

    if (state.selected) {
      let button = $$('[data-select]').findLast(
        (button) => button.dataset.select === state.selected.product_id,
      );
      if (!button)
        button = addBubble('assistant', '', { products: [state.selected] }).querySelector(
          '[data-select]',
        );
      await pInfo.open(button.closest('.product-card'), state.selected.product_id, {
        restore: true,
      });
    }
  } catch (e) {
    toast('ادامه خرید بازیابی نشد: ' + e.message);
  }
}
function readChats() {
  try {
    const chats = JSON.parse(sessionStorage.getItem('torob_chats') || '[]');
    return Array.isArray(chats)
      ? chats.filter((c) => typeof c.id === 'string' && typeof c.title === 'string')
      : [];
  } catch {
    return [];
  }
}
function switchChat(id) {
  if (['running', 'pausing'].includes(requestMode)) {
    toast('اول درخواست در حال اجرا را متوقف کن.');
    return;
  }
  sessionStorage.setItem('torob_session', id);
  sessionStorage.removeItem('torob_chat_started');
  window.location.reload();
}
$('#chatMenuButton').onclick = () => {
  const list = $('#chatList');
  list.replaceChildren();
  for (const chat of readChats()) {
    const button = document.createElement('button');
    button.className = 'chat-list-item';
    button.textContent = chat.title;
    if (chat.id === sessionStorage.getItem('torob_session'))
      button.setAttribute('aria-current', 'page');
    button.onclick = () => switchChat(chat.id);
    list.append(button);
  }
  $('#chatMenu').showModal();
};
$('#chatMenu').onclick = (e) => {
  if (e.target !== $('#chatMenu')) return;
  const rect = e.target.getBoundingClientRect();
  if (
    e.clientX < rect.left ||
    e.clientX > rect.right ||
    e.clientY < rect.top ||
    e.clientY > rect.bottom
  )
    e.target.close();
};
$('#newChatButton').onclick = () => switchChat(crypto.randomUUID());
async function refreshShopHours() {
  if (document.hidden || !state.selected || ['running', 'pausing'].includes(requestMode)) return;
  try {
    const data = await api('/api/session');
    if (data.selected?.product_id !== state.selected?.product_id) return;
    applyWorkflow(data);
    renderSellers();
    pInfo.refresh();
  } catch {
    /* Keep the last known information during a temporary connection failure. */
  }
}
setInterval(refreshShopHours, 60000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshShopHours();
});
