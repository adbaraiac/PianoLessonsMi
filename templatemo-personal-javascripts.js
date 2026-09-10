/* Baraiac Piano Lessons — interactions */

// Deployed backend (see backend/README.md) - automatically emails/texts
// Aiden on submission. If this API is ever unreachable, the form falls back
// to the tap-to-text/email flow below - it never breaks either way.
const LEADS_API_URL = 'https://8qzuq3rfrk.execute-api.us-east-1.amazonaws.com';

// Ad platform conversion tracking - fired only on a real successful booking
// submission (see trySubmitToApi's success branch below). Leave a value
// empty to skip firing that platform's event.
const GOOGLE_ADS_SEND_TO = 'AW-17704442079/_AnmCKDUqPMcEN-xkfpB';
const META_PIXEL_ID = '1089866153420965';

function fireConversionTracking() {
  if (GOOGLE_ADS_SEND_TO && typeof gtag === 'function') {
    gtag('event', 'conversion', { send_to: GOOGLE_ADS_SEND_TO });
  }
  if (META_PIXEL_ID && typeof fbq === 'function') {
    fbq('track', 'Lead');
  }
}

const mobileMenuToggle = document.getElementById('mobileMenuToggle');
const mobileMenu = document.getElementById('mobileMenu');
const mobileNavLinks = document.querySelectorAll('.mobile-nav-links a');

function closeMobileMenu() {
  if (!mobileMenuToggle || !mobileMenu) return;
  mobileMenuToggle.classList.remove('active');
  mobileMenu.classList.remove('active');
  mobileMenuToggle.setAttribute('aria-expanded', 'false');
  mobileMenu.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

if (mobileMenuToggle && mobileMenu) {
  const toggleMenu = () => {
    const isOpen = mobileMenu.classList.contains('active');
    mobileMenuToggle.classList.toggle('active', !isOpen);
    mobileMenu.classList.toggle('active', !isOpen);
    mobileMenuToggle.setAttribute('aria-expanded', (!isOpen).toString());
    mobileMenu.setAttribute('aria-hidden', isOpen.toString());
    document.body.style.overflow = isOpen ? 'hidden' : '';
  };

  mobileMenuToggle.addEventListener('click', toggleMenu);
  mobileNavLinks.forEach((link) => link.addEventListener('click', closeMobileMenu));
}

function initStickyMobileCta() {
  const sticky = document.getElementById('mobileStickyCta');
  const hero = document.getElementById('home');
  const contact = document.getElementById('contact');
  if (!sticky || !hero) return;

  const mq = window.matchMedia('(max-width: 768px)');

  const update = () => {
    if (!mq.matches) {
      sticky.classList.remove('is-visible');
      document.body.classList.remove('mobile-cta-active');
      sticky.setAttribute('aria-hidden', 'true');
      return;
    }

    const contactTop = contact ? contact.getBoundingClientRect().top : Infinity;
    const show = contactTop > window.innerHeight * 0.35;

    sticky.classList.toggle('is-visible', show);
    document.body.classList.toggle('mobile-cta-active', show);
    sticky.setAttribute('aria-hidden', (!show).toString());
  };

  window.addEventListener('scroll', update, { passive: true });
  mq.addEventListener('change', update);
  update();
}

window.addEventListener('scroll', () => {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;
  navbar.classList.toggle('scrolled', window.scrollY > 24);
}, { passive: true });

const fadeObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('animate');
      fadeObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.fade-in, .stagger-children').forEach((el) => fadeObserver.observe(el));
  initTestimonialCarousel();
  initStickyMobileCta();
  initBookingForm();
  initEnrollmentCountdown();
});

document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener('click', function (e) {
    const href = this.getAttribute('href');
    if (!href || href === '#') return;
    const target = document.querySelector(href);
    if (!target) return;
    e.preventDefault();
    const navOffset = document.getElementById('navbar')?.offsetHeight || 72;
    const announceOffset = document.querySelector('.announcement-bar')?.offsetHeight || 0;
    const y = target.getBoundingClientRect().top + window.pageYOffset - navOffset - announceOffset;
    window.scrollTo({ top: y, behavior: 'smooth' });
    closeMobileMenu();
  });
});

/* ===== Enrollment countdown ===== */
function initEnrollmentCountdown() {
  const el = document.getElementById('enrollmentCountdown');
  if (!el || !el.dataset.deadline) return;
  const deadline = new Date(el.dataset.deadline);
  if (Number.isNaN(deadline.getTime())) return;

  function update() {
    const diffMs = deadline.getTime() - Date.now();
    if (diffMs <= 0) {
      // Reminder: update data-deadline in index.html for the next enrollment
      // cycle once this one closes.
      el.textContent = 'Enrollment is closed for this season—check back soon.';
      return;
    }
    const days = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    el.innerHTML = `Enrollment closes in <strong>${days} day${days === 1 ? '' : 's'}</strong>`;
  }

  update();
  setInterval(update, 1000 * 60 * 30);
}

/* ===== Booking form ===== */
const BOOKING_PHONE = '+12486071916';
const BOOKING_EMAIL = 'adbaraiac04@gmail.com';

const TROY_NORTH_ZONE = 'troy-north';

const AREA_LABELS = {
  'troy-north': 'Troy — near Long Lake / John R / Rochester Rd',
  'troy-other': 'Troy — other area',
  'rochester-hills': 'Rochester Hills',
  'rochester': 'Rochester',
  'birmingham': 'Birmingham',
  'royal-oak': 'Royal Oak',
  'bloomfield-hills': 'Bloomfield Hills',
  'other': 'Other / not listed',
};

const DAY_OPTIONS = {
  saturday: { label: 'Saturday', zones: 'all', times: ['Morning (9am–12pm)', 'Midday (12–3pm)', 'Afternoon (3–6pm)', 'Evening (6–8pm)'] },
  thursday: { label: 'Thursday (after 1pm)', zones: [TROY_NORTH_ZONE], times: ['1–3pm', '3–5pm', '5–7pm'] },
  friday: { label: 'Friday (after 1pm)', zones: [TROY_NORTH_ZONE], times: ['1–3pm', '3–5pm', '5–7pm'] },
};

function availableDaysForArea(area) {
  return Object.entries(DAY_OPTIONS)
    .filter(([, cfg]) => cfg.zones === 'all' || cfg.zones.includes(area))
    .map(([key, cfg]) => ({ key, label: cfg.label }));
}

function initBookingForm() {
  const form = document.getElementById('bookingForm');
  if (!form) return;

  const areaSelect = document.getElementById('area');
  const areaNote = document.getElementById('areaNote');
  const daySelect = document.getElementById('day');
  const timeSelect = document.getElementById('time');

  function setSelectOptions(select, options, placeholder) {
    select.innerHTML = '';
    const ph = document.createElement('option');
    ph.value = '';
    ph.disabled = true;
    ph.selected = true;
    ph.textContent = placeholder;
    select.appendChild(ph);
    options.forEach((opt) => {
      const el = document.createElement('option');
      el.value = opt.value;
      el.textContent = opt.label;
      select.appendChild(el);
    });
    select.disabled = options.length === 0;
  }

  function updateDays() {
    const area = areaSelect.value;
    if (!area) {
      setSelectOptions(daySelect, [], 'Select your area first');
      setSelectOptions(timeSelect, [], 'Select a day first');
      areaNote.textContent = '';
      return;
    }

    const days = availableDaysForArea(area);
    setSelectOptions(daySelect, days.map((d) => ({ value: d.key, label: d.label })), 'Select a day');
    setSelectOptions(timeSelect, [], 'Select a day first');

    areaNote.textContent = area === TROY_NORTH_ZONE
      ? '✓ Great news—your area has Saturday, Thursday & Friday (after 1pm) availability.'
      : 'Saturdays (all day) are available in your area. Thursday & Friday afternoons are currently reserved for the Long Lake / John R / Rochester Rd zone in Troy.';
  }

  function updateTimes() {
    const day = daySelect.value;
    const cfg = DAY_OPTIONS[day];
    if (!cfg) {
      setSelectOptions(timeSelect, [], 'Select a day first');
      return;
    }
    setSelectOptions(timeSelect, cfg.times.map((t) => ({ value: t, label: t })), 'Select a time');
  }

  areaSelect.addEventListener('change', updateDays);
  daySelect.addEventListener('change', updateTimes);

  const confirmPanel = document.getElementById('bookingConfirm');
  const confirmName = document.getElementById('confirmName');
  const confirmSummary = document.getElementById('confirmSummary');
  const confirmSmsLink = document.getElementById('confirmSmsLink');
  const confirmEmailLink = document.getElementById('confirmEmailLink');
  const confirmEditBtn = document.getElementById('confirmEditBtn');
  const sentPanel = document.getElementById('bookingSent');
  const sentChildName = document.getElementById('sentChildName');

  async function trySubmitToApi(data, areaLabel, dayLabel) {
    if (!LEADS_API_URL) return false;
    try {
      const res = await fetch(`${LEADS_API_URL}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentName: data.parentName,
          parentPhone: data.parentPhone,
          childName: data.childName,
          childAge: data.childAge,
          favoriteSong: data.favoriteSong || '',
          area: areaLabel,
          day: dayLabel,
          time: data.time,
          notes: data.notes || '',
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;

    // A validly completed booking form is the lead event ad platforms should
    // optimize toward, regardless of which notification path below succeeds.
    fireConversionTracking();

    const data = Object.fromEntries(new FormData(form).entries());
    const dayLabel = DAY_OPTIONS[data.day]?.label || data.day;
    const areaLabel = AREA_LABELS[data.area] || data.area;

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    const sentAutomatically = await trySubmitToApi(data, areaLabel, dayLabel);
    if (submitBtn) submitBtn.disabled = false;

    if (sentAutomatically) {
      sentChildName.textContent = data.childName || 'there';
      form.hidden = true;
      sentPanel.hidden = false;
      sentPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    // Backend not configured (LEADS_API_URL empty) or the request failed -
    // fall back to letting the parent send the request themselves.
    const lines = [
      `Hi! I'd like to book a free trial piano lesson.`,
      `Parent: ${data.parentName} (${data.parentPhone})`,
      `Child: ${data.childName}, age ${data.childAge}`,
      data.favoriteSong ? `Favorite song: ${data.favoriteSong}` : null,
      `Area: ${areaLabel}`,
      `Preferred: ${dayLabel} — ${data.time}`,
      data.notes ? `Notes: ${data.notes}` : null,
    ].filter(Boolean);

    const message = lines.join('\n');

    confirmName.textContent = data.childName || 'there';
    confirmSummary.innerHTML = lines.map((l) => `<p>${l.replace(/</g, '&lt;')}</p>`).join('');
    confirmSmsLink.href = `sms:${BOOKING_PHONE}?body=${encodeURIComponent(message)}`;
    confirmEmailLink.href = `mailto:${BOOKING_EMAIL}?subject=${encodeURIComponent('New free trial lesson request')}&body=${encodeURIComponent(message)}`;

    form.hidden = true;
    confirmPanel.hidden = false;
    confirmPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  confirmEditBtn?.addEventListener('click', () => {
    confirmPanel.hidden = true;
    form.hidden = false;
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function initTestimonialCarousel() {
  const carousel = document.getElementById('testimonialCarousel');
  if (!carousel) return;

  const slides = carousel.querySelectorAll('.testimonial-slide');
  const dotsContainer = carousel.querySelector('.carousel-dots');
  const prevBtn = carousel.querySelector('.carousel-prev');
  const nextBtn = carousel.querySelector('.carousel-next');
  let current = 0;
  let autoplayId;

  slides.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'carousel-dot' + (i === 0 ? ' is-active' : '');
    dot.setAttribute('aria-label', `Review ${i + 1}`);
    dot.setAttribute('role', 'tab');
    dot.addEventListener('click', () => goTo(i));
    dotsContainer.appendChild(dot);
  });

  const dots = dotsContainer.querySelectorAll('.carousel-dot');

  function goTo(index) {
    slides[current].classList.remove('is-active');
    dots[current].classList.remove('is-active');
    current = (index + slides.length) % slides.length;
    slides[current].classList.add('is-active');
    dots[current].classList.add('is-active');
    resetAutoplay();
  }

  function resetAutoplay() {
    clearInterval(autoplayId);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    autoplayId = setInterval(() => goTo(current + 1), 6000);
  }

  prevBtn?.addEventListener('click', () => goTo(current - 1));
  nextBtn?.addEventListener('click', () => goTo(current + 1));
  resetAutoplay();
}
