import { chatAction, priceRange } from './chat-controls.js';
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
  state.view = view;
  document.body.dataset.view = view;
  updateCompare();
  for (const v of ['discover', 'shops', 'trip']) $('#' + v + 'View').hidden = v !== view;
  $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  if (view === 'trip') renderTrip();
  window.scrollTo({ top: 0, behavior: 'smooth' });
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
        `<article class="product-card"><button class="product-image" data-detail="${p.product_id}" aria-label="مشخصات ${esc(p.title)}">${productPicture(p)}</button><span class="product-category">${esc(p.brand || p.category)}</span><h3>${esc(p.title)}</h3><div class="price-row"><span class="product-range">${esc(priceRange(p))}</span></div><p class="seller-count">در ${fa(p.seller_count || 0)} فروشگاه · قیمت ثبت‌شده</p><div class="card-actions"><label class="compare-check"><input type="checkbox" data-compare="${p.product_id}" ${state.compare.has(p.product_id) ? 'checked' : ''}>مقایسه</label><button data-select="${p.product_id}">فروشگاه‌ها ←</button></div></article>`,
    )
    .join('');
  root
    .querySelectorAll('[data-select]')
    .forEach((b) => (b.onclick = () => selectProduct(b.dataset.select)));
  root
    .querySelectorAll('[data-detail]')
    .forEach((b) => (b.onclick = () => showDetail(b.dataset.detail)));
  root.querySelectorAll('[data-compare]').forEach(
    (b) =>
      (b.onchange = () => {
        const p = items.find((p) => p.product_id === b.dataset.compare);
        if (b.checked) {
          if (state.compare.size === 3) {
            b.checked = false;
            return toast('حداکثر سه محصول را با هم مقایسه کن.');
          }
          state.compare.set(p.product_id, p);
        } else state.compare.delete(p.product_id);
        updateCompare();
      }),
  );
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
      'این محصولات را با ابزار compare_products مقایسه کن و بگو هرکدام مناسب چه استفاده‌ای است: ' +
        list.map((p) => p.product_id).join('، '),
    );
  };
  bindImageFallbacks($('#modal'));
};
async function showDetail(id) {
  try {
    const p =
      state.products.find((p) => p.product_id === id) || (await api('/api/product?id=' + id));
    modal(
      p.title,
      `${productPicture(p, 'modal-product-img')}<div class="table-scroll"><table class="spec-table">${p.specs.length ? p.specs.map((s) => `<tr><th>${esc(s.key)}</th><td>${esc(s.value)}</td></tr>`).join('') : '<tr><td>مشخصات ثبت نشده است.</td></tr>'}</table></div><div class="modal-actions"><button id="detailSelect" class="primary">پیدا کردن فروشگاه</button></div>`,
    );
    $('#detailSelect').onclick = () => {
      $('#modal').close();
      selectProduct(id);
    };
    bindImageFallbacks($('#modal'));
  } catch (e) {
    toast(e.message);
  }
}
async function selectProduct(id) {
  try {
    const data = await workflowEvent({ type: 'select', productId: id });
    renderSelected();
    setView('shops');
    state.sellers = data.sellers;
    renderSellers();
    if (data.needsLocation) openLocation();
  } catch (e) {
    toast(e.message);
  }
}
async function loadSellers() {
  if (!state.selected) return;
  $('#sellers').innerHTML = '<div class="loading">در حال مقایسه فروشگاه‌ها</div>';
  try {
    const data = await workflowEvent({
      type: 'preferences',
      preferences: {
        sort: $('#sortShops').value,
        installments: $('#shopInstallments').checked,
        open: $('#openShops').checked,
        radius: Number($('#shopRadius').value) || 0,
        location: state.location,
      },
    });
    state.sellers = data.sellers;
    renderSellers();
  } catch (e) {
    $('#sellers').innerHTML = '<div class="empty">' + esc(e.message) + '</div>';
  }
}
['sortShops', 'shopInstallments', 'openShops', 'shopRadius'].forEach(
  (id) => ($('#' + id).onchange = loadSellers),
);
const failed = (v) => v && ['closed', 'no_answer', 'unavailable'].includes(v.status);
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
    .join(' · ');
  return (
    '<div class="seller-contacts">' +
    links +
    (s.contacts || [])
      .map(
        (c) =>
          '<div>شماره نمایشی: <b dir="ltr">' +
          esc(c.display_number) +
          '</b><small>شماره دیتاست جعلی است؛ تماس واقعی فعال نیست.</small></div>',
      )
      .join('') +
    '</div>'
  );
}
function renderSellers() {
  const inquiry = state.workflow?.inquiry;
  const summary = $('#inquirySummary');
  summary.hidden = !state.location;
  summary.innerHTML = inquiry
    ? '<strong>پیگیری خودکار · نسخه آزمایشی</strong><p>' +
      esc(inquiry.note) +
      '</p><div class="inquiry-attempts">' +
      (inquiry.attempts || [])
        .map(
          (a) =>
            '<span>' +
            esc(a.shopName) +
            ': ' +
            esc(
              {
                closed: 'بسته',
                no_answer: 'بدون پاسخ',
                unavailable: 'ناموجود',
                confirmed: 'تأیید آزمایشی',
                price_changed: 'تغییر قیمت آزمایشی',
              }[a.status] || a.status,
            ) +
            '</span>',
        )
        .join('') +
      '</div><button class="text-button" id="retryInquiry">بررسی دوباره ←</button>'
    : '';
  if ($('#retryInquiry'))
    $('#retryInquiry').onclick = async (event) => {
      event.currentTarget.disabled = true;
      try {
        await workflowEvent({ type: 'inquire' });
        renderSellers();
      } catch (e) {
        toast(e.message);
        renderSellers();
      }
    };
  if (!state.location) {
    $('#distanceNote').textContent = 'مبدأ خرید هنوز انتخاب نشده است.';
    $('#sellers').innerHTML =
      '<div class="empty">برای پیدا کردن نزدیک‌ترین فروشگاه، مبدأ خریدت را انتخاب کن.<br><button class="primary" id="chooseStoreLocation">انتخاب موقعیت</button></div>';
    $('#chooseStoreLocation').onclick = openLocation;
    return;
  }

  const active = state.sellers.filter((s) => !failed(s.verification)),
    blocked = state.sellers.filter((s) => failed(s.verification));
  const ordered = [...active, ...blocked];
  $('#distanceNote').textContent = state.location
    ? `فاصله‌ها خط مستقیم از «${state.location.label}» هستند؛ زمان سفر محاسبه نشده است. پیگیری خودکار از نزدیک‌ترین فروشگاه آغاز می‌شود.`
    : 'برای مقایسه فاصله، محدوده‌ات را از بالای صفحه انتخاب کن. رتبه‌بندی فعلی براساس قیمت و ساعت کاری ثبت‌شده است.';
  if (!ordered.length) {
    $('#sellers').innerHTML =
      `<div class="empty">${icon('store')}فروشگاهی با این فیلترها پیدا نشد.<br>فیلتر ساعت، اقساط یا شعاع را تغییر بده.</div>`;
    return;
  }
  $('#sellers').innerHTML = ordered
    .map((s, i) => {
      const v = s.verification;
      return `<article class="seller-card"><div class="seller-head"><div class="seller-name"><span class="store-avatar">${icon('store')}</span><div><h3>${esc(s.name)}</h3><div class="badges">${s.offer_id === inquiry?.recommendedOfferId && !failed(v) ? '<span class="badge red">نزدیک‌ترین گزینه در دمو</span>' : ''}<span class="badge ${s.opening.state === 'open' ? 'green' : ''}">${esc(s.opening.label)}</span>${s.payments.map((p) => `<span class="badge">${esc(p.provider_name)} · ${p.channel === 'in_person' ? 'حضوری' : p.channel === 'online' ? 'آنلاین' : 'نحوه پذیرش نامشخص'}</span>`).join('')}</div></div></div><span class="price">${money(s.price)}</span></div><p class="seller-address">${icon('pin')} ${esc(s.address || 'آدرس ثبت نشده')}</p><div class="seller-meta"><span>${s.distance !== null ? fa(s.distance) + ' کیلومتر فاصله مستقیم' : 'فاصله مشخص نشده'}</span><span>آخرین تغییر قیمت: ${s.changed ? date(s.changed) : 'نامشخص'}</span><span>${s.payments.length ? 'شرایط اقساط نیازمند بررسی فروشنده' : 'اطلاعات اقساط ثبت نشده'}</span></div>${shopContacts(s)}${v ? `<div class="verification"><span class="badge ${failed(v) ? 'red' : 'green'}">استعلام شبیه‌سازی‌شده</span> ${esc(v.note)}${['confirmed', 'price_changed'].includes(v.status) ? `<p>قیمت در دمو: ${money(v.price)}</p><small>رنگ و سایز هنوز تأیید نشده‌اند.</small>` : ''}<small>زمان اجرای دمو: ${date(v.at)} · این نتیجه تأیید واقعی فروشنده نیست.</small>${failed(v) ? `<b>${active.length ? 'گزینه‌های جایگزین در بالای فهرست قرار گرفتند.' : 'فروشنده جایگزینی با این فیلترها نمانده؛ فیلترها یا محصول را تغییر بده.'}</b>` : ''}</div>` : ''}<div class="seller-actions"><select aria-label="سناریوی شبیه‌سازی فروشنده" data-scenario="${s.offer_id}"><option value="confirmed">دمو: تأیید فروشنده</option><option value="no_answer">دمو: عدم پاسخ</option><option value="closed">دمو: فروشگاه بسته</option><option value="unavailable">دمو: ناموجودی</option><option value="price_changed">دمو: تغییر قیمت</option></select><button class="primary" data-verify="${s.offer_id}">استعلام آزمایشی</button><button class="trip-button" data-trip="${s.offer_id}">راهنمای مراجعه ←</button></div></article>`;
    })
    .join('');
  $$('[data-verify]').forEach(
    (b) =>
      (b.onclick = async () => {
        b.disabled = true;
        b.textContent = 'در حال اجرای سناریو…';
        try {
          const scenario = $('[data-scenario="' + b.dataset.verify + '"]').value;
          const result = await api('/api/verify', { offerId: b.dataset.verify, scenario });
          applyWorkflow(result.workflow);
          renderSellers();
          toast(result.workflow.reply || 'نتیجه شبیه‌سازی و وضعیت خرید ذخیره شد.');
        } catch (e) {
          b.disabled = false;
          b.textContent = 'تلاش دوباره';
          toast(e.message);
        }
      }),
  );
  $$('[data-trip]').forEach(
    (b) =>
      (b.onclick = async () => {
        b.disabled = true;
        try {
          await workflowEvent({ type: 'plan', offerId: b.dataset.trip });
          setView('trip');
        } catch (e) {
          b.disabled = false;
          toast(e.message);
        }
      }),
  );
}
function loadGuide(id) {
  try {
    return JSON.parse(localStorage.getItem('torob_guide_' + id)) || null;
  } catch {
    return null;
  }
}
function renderTrip() {
  if (!state.trip) {
    $('#tripContent').innerHTML =
      `<div class="empty">${icon('route')}هنوز فروشگاهی برای مراجعه انتخاب نکردی.<br>از صفحه فروشگاه‌ها «راهنمای مراجعه» را انتخاب کن.</div>`;
    return;
  }
  const { seller: s, product: p } = state.trip;
  const guide = loadGuide(s.shop_id);
  const v = s.verification;
  const href =
    s.lat && s.lon
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.lat + ',' + s.lon)}`
      : null;
  $('#tripContent').innerHTML =
    `<div class="info-banner">${icon('info')}این یک برنامه مراجعه آزمایشی است. قیمت و موجودی واقعی تأیید نشده‌اند.</div><div class="trip-grid"><div class="trip-card"><h3>${esc(s.name)}</h3><p>${esc(p.title)}</p><div class="route-step"><b>۱. رسیدن به آدرس فروشگاه</b><p>${esc(s.address || 'آدرس ثبت نشده')}</p>${href ? `<a class="text-button" href="${href}" target="_blank" rel="noopener noreferrer">باز کردن موقعیت فروشگاه در نقشه ↗</a>` : ''}</div><div class="route-step"><b>۲. از ورودی تا خودِ مغازه</b><p>${guide ? esc(guide) : 'جزئیات تکمیلی مسیر داخلی ثبت نشده است. طبقه و واحد را از آدرس بالا بررسی کن؛ مسیر راهرو یا ورودی را نمی‌دانیم.'}</p><button class="text-button" id="editGuide">ثبت راهنمای مسیر در پنل آزمایشی فروشنده ←</button></div><div class="route-step"><b>۳. قبل از نهایی‌کردن خرید</b><p>مدل، رنگ، سایز، گارانتی و مبلغ نهایی را حضوری تطبیق بده.</p></div></div><div class="trip-card"><h3>چک‌لیست قبل از حرکت</h3><p>${esc(s.opening.label)} · طبق برنامه ثبت‌شده</p><p>قیمت ثبت‌شده: <span class="price">${money(s.price)}</span></p><p>${v ? 'آخرین استعلام: صرفاً شبیه‌سازی' : 'هنوز استعلامی اجرا نشده است.'}</p><p>${failed(v) ? 'در سناریوی دمو این فروشگاه مناسب مراجعه نیست؛ گزینه دیگری انتخاب کن.' : 'موجودی رنگ و سایز و امکان اقساط حضوری را جداگانه بررسی کن.'}</p><button class="primary" id="tripAlternatives">بررسی فروشگاه‌های جایگزین</button><p class="save-note">وضعیت این خرید در سرور محلی ذخیره می‌شود و با تازه‌کردن صفحه باقی می‌ماند.</p><button class="text-button" id="removeTrip">حذف برنامه مراجعه</button></div></div>`;
  $('#editGuide').onclick = () => {
    modal(
      'پنل آزمایشی فروشنده · راهنمای رسیدن',
      `<p class="modal-prose">این متن فقط در مرورگر ذخیره می‌شود و اطلاعات تأییدشده فروشنده نیست. ورودی، طبقه، واحد و نشانه مسیر را وارد کن.</p><label for="guideInput">راهنمای مسیر داخل مرکز خرید</label><textarea id="guideInput" rows="5" maxlength="1500" placeholder="مثلاً ورودی شمالی، طبقه دوم، راهروی سمت راست، واحد ۲۱۴">${esc(guide || '')}</textarea><button class="primary" id="saveGuide">ذخیره راهنمای آزمایشی</button>`,
    );
    $('#saveGuide').onclick = () => {
      const val = $('#guideInput').value.trim();
      localStorage.setItem('torob_guide_' + s.shop_id, JSON.stringify(val));
      $('#modal').close();
      renderTrip();
    };
  };
  $('#tripAlternatives').onclick = () => {
    selectProduct(p.product_id);
  };
  $('#removeTrip').onclick = async () => {
    try {
      await workflowEvent({ type: 'clear_trip' });
      localStorage.removeItem('torob_trip');
      renderTrip();
    } catch (e) {
      toast(e.message);
    }
  };
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
    state.location = location;
    localStorage.setItem('torob_location', JSON.stringify(location));
    updateLocation();
    $('#modal').close();
    try {
      await workflowEvent({ type: 'preferences', preferences: { location } });
      if (state.view === 'shops') renderSellers();
    } catch (e) {
      toast(e.message);
    }
  };
  $('#useCurrentLocation').onclick = () => {
    const message = $('#locationError');
    if (!navigator.geolocation) {
      message.textContent = 'موقعیت دستگاه در دسترس نیست؛ محدوده را انتخاب کن.';
      return;
    }
    message.textContent = 'در انتظار موقعیت دستگاه…';
    navigator.geolocation.getCurrentPosition(
      (p) => save({ label: 'موقعیت فعلی', lat: p.coords.latitude, lon: p.coords.longitude }),
      () => {
        message.textContent = 'موقعیت دریافت نشد؛ محدوده را دستی انتخاب کن.';
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  };
  $('[data-area]').forEach(
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
      if (state.view === 'shops') renderSellers();
    } catch (e) {
      toast(e.message);
    }
  };
}
$('#locationButton').onclick = openLocation;
function addBubble(role, text, ui) {
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
    if (ui.products?.length) {
      const cards = document.createElement('div');
      cards.className = 'product-grid chat-product-grid';
      div.append(cards);
      renderProducts(cards, ui.products);
    }
    for (const question of ui.questions || []) renderQuestion(div, question);
  }
  scrollChat();
  return div;
}
function scrollChat() {
  $('#chatMessages').scrollTop = $('#chatMessages').scrollHeight;
}
function renderQuestion(container, question) {
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
    section.querySelectorAll('button,input,textarea').forEach((e) => (e.disabled = true));
    sendChat(question.question + ' ' + value);
  };
  for (const option of question.options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = option;
    button.onclick = () => {
      if (['running', 'pausing'].includes(requestMode))
        return toast('برای تغییر درخواست، ابتدا آن را متوقف کن.');
      button.classList.add('selected');
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
    send.textContent = 'ارسال پاسخ';
    const back = document.createElement('button');
    back.type = 'button';
    back.textContent = 'بازگشت';
    back.onclick = () => {
      form.remove();
      options.hidden = false;
    };
    form.append(input, send, back);
    form.onsubmit = (e) => {
      e.preventDefault();
      const value = input.value.trim();
      if (value) answer(value);
    };
    section.append(form);
    input.focus();
  };
  options.append(other);
  container.append(section);
}
let requestMode = 'idle',
  requestEpoch = 0,
  pendingBubble = null,
  lastChatText = '',
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
async function sendChat(text) {
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
  activeUserBubble = addBubble('user', text);
  state.messages.push({ role: 'user', content: text });
  pendingBubble = addBubble('assistant pending', 'دارم نیازت و گزینه‌های واقعی را بررسی می‌کنم…');
  localPaused = false;
  return runChat({ message: text });
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
    addBubble('assistant', result.reply, result.ui);
    if (result.selected && result.phase === 'sellers') {
      renderSelected();
      renderSellers();
      const action = document.createElement('button');
      action.className = 'primary chat-seller-action';
      action.textContent = 'دیدن فروشگاه‌های این محصول ←';
      action.onclick = () => setView('shops');
      $('#chatMessages').append(action);
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
      sendChat(failedText);
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
    pendingBubble.className = 'bubble assistant pending';
    pendingBubble.textContent = 'در حال ادامه بررسی…';
  }
  const payload = localPaused ? { message: lastChatText } : { resume: true };
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
  if (state.view === 'trip') renderTrip();
  const prefs = data.preferences || {};
  if (prefs.q !== undefined) {
    state.query = prefs.q;
  }
  state.filters = { maxPrice: prefs.maxPrice || 0, installments: !!prefs.installments };
  state.location = prefs.location || null;
  $('#shopInstallments').checked = !!prefs.installments;
  $('#openShops').checked = !!prefs.open;
  $('#sortShops').value = prefs.sort || 'recommended';
  $('#shopRadius').value = prefs.radius ? String(prefs.radius) : '';
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
    for (const m of data.messages || []) addBubble(m.role, m.content, m.ui);
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
      renderSelected();
      renderSellers();
      const action = document.createElement('button');
      action.className = 'primary chat-seller-action';
      action.textContent = state.trip ? 'دیدن برنامه مراجعه ←' : 'ادامه بررسی فروشگاه‌ها ←';
      action.onclick = () => setView(state.trip ? 'trip' : 'shops');
      $('#chatMessages').append(action);
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
$('#closeChatMenu').onclick = () => $('#chatMenu').close();
$('#chatMenu').onclick = (e) => {
  if (e.target === $('#chatMenu') && e.offsetX < 0) $('#chatMenu').close();
};
$('#newChatButton').onclick = () => switchChat(crypto.randomUUID());
