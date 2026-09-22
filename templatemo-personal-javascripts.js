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

// GA4 property for session/pageview + funnel reporting (separate from the
// AW- Google Ads conversion ID above - both run through the same gtag.js
// loader). Leave empty until a GA4 property exists; see index.html <head>
// for where its config call goes once set.
const GA4_MEASUREMENT_ID = 'G-GX7EZGC3CS';

function fireConversionTracking() {
  if (GOOGLE_ADS_SEND_TO && typeof gtag === 'function') {
    gtag('event', 'conversion', { send_to: GOOGLE_ADS_SEND_TO });
  }
  if (META_PIXEL_ID && typeof fbq === 'function') {
    fbq('track', 'Lead');
  }
}

// Funnel visibility: fires once per visit, the first time the booking form
// scrolls into view, so we can see clicks -> landing -> reached form -> lead.
function initBookingFormReachedTracking() {
  const form = document.getElementById('bookingForm');
  if (!form || typeof IntersectionObserver === 'undefined') return;

  let fired = false;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting && !fired) {
        fired = true;
        if (GA4_MEASUREMENT_ID && typeof gtag === 'function') {
          gtag('event', 'reached_booking_form');
        }
        if (META_PIXEL_ID && typeof fbq === 'function') {
          fbq('trackCustom', 'ReachedBookingForm');
        }
        observer.disconnect();
      }
    });
  }, { threshold: 0.3 });
  observer.observe(form);
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
  initBookingFormReachedTracking();
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

// Bookable availability. This is the only place to edit it: delete a time to
// take it off the board, add a day key to open a new one. A day with an empty
// times array shows as fully booked instead of disappearing.
const BOOKING_SLOTS = {
  saturday: {
    label: 'Saturday',
    times: [
      '9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
      '12:00 PM', '12:30 PM', '1:00 PM', '1:30 PM', '2:00 PM', '2:30 PM',
      '3:00 PM', '3:30 PM', '4:00 PM', '4:30 PM', '5:00 PM', '5:30 PM',
    ],
  },
};

function slotInputId(prefix, value) {
  return `${prefix}-${value.replace(/[^a-z0-9]/gi, '').toLowerCase()}`;
}

// Radios rather than a custom widget: native form validation, keyboard
// support and FormData all work without reimplementing them.
function renderChoice(container, { name, value, label, className, checked, onChange }) {
  const id = slotInputId(name, value);
  const input = document.createElement('input');
  input.type = 'radio';
  input.name = name;
  input.id = id;
  input.value = value;
  input.required = true;
  input.className = 'choice-input';
  input.checked = Boolean(checked);
  if (onChange) input.addEventListener('change', onChange);

  const labelEl = document.createElement('label');
  labelEl.className = className;
  labelEl.setAttribute('for', id);
  labelEl.textContent = label;

  container.append(input, labelEl);
  return input;
}

function initBookingForm() {
  const form = document.getElementById('bookingForm');
  if (!form) return;

  const areaSelect = document.getElementById('area');
  const areaNote = document.getElementById('areaNote');
  const dayPills = document.getElementById('dayPills');
  const slotGrid = document.getElementById('slotGrid');
  const slotNote = document.getElementById('slotNote');

  function renderSlots(dayKey) {
    const cfg = BOOKING_SLOTS[dayKey];
    slotGrid.innerHTML = '';
    if (!cfg || !cfg.times.length) {
      slotNote.textContent = cfg
        ? `${cfg.label} is fully booked right now—send a request below and we'll offer you the next opening.`
        : 'Pick a day to see open times.';
      return;
    }
    cfg.times.forEach((time) => {
      renderChoice(slotGrid, { name: 'time', value: time, label: time, className: 'slot' });
    });
    slotNote.textContent = `${cfg.times.length} open times this week. Lessons are 30 minutes.`;
  }

  const dayKeys = Object.keys(BOOKING_SLOTS);
  dayKeys.forEach((key, i) => {
    renderChoice(dayPills, {
      name: 'day',
      value: key,
      label: BOOKING_SLOTS[key].label,
      className: 'pill',
      // With one day open there is nothing to choose - preselect it so the
      // parent has one less tap between them and a booked lesson.
      checked: dayKeys.length === 1 && i === 0,
      onChange: () => renderSlots(key),
    });
  });
  renderSlots(dayKeys.length === 1 ? dayKeys[0] : null);

  areaSelect.addEventListener('change', () => {
    const label = AREA_LABELS[areaSelect.value];
    areaNote.textContent = label ? `✓ We come to you in ${label.replace(/ —.*/, '')}.` : '';
  });

  const confirmPanel = document.getElementById('bookingConfirm');
  const confirmName = document.getElementById('confirmName');
  const confirmSummary = document.getElementById('confirmSummary');
  const confirmSmsLink = document.getElementById('confirmSmsLink');
  const confirmEmailLink = document.getElementById('confirmEmailLink');
  const confirmEditBtn = document.getElementById('confirmEditBtn');
  const sentPanel = document.getElementById('bookingSent');
  const sentChildName = document.getElementById('sentChildName');
  const sentSlot = document.getElementById('sentSlot');

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
          address: data.address || '',
          day: dayLabel,
          time: data.time,
          notes: data.notes || '',
          priceAcknowledged: data.priceAck === 'yes' ? 'yes' : 'no',
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) {
      // The form is long enough that a failed field - especially the slot
      // grid, whose radios are visually hidden - can sit off-screen.
      const firstInvalid = Array.from(form.elements).find((el) => el.willValidate && !el.checkValidity());
      firstInvalid?.closest('.form-field, .form-block, .price-ack')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    // A validly completed booking form is the lead event ad platforms should
    // optimize toward, regardless of which notification path below succeeds.
    fireConversionTracking();

    const data = Object.fromEntries(new FormData(form).entries());
    const dayLabel = BOOKING_SLOTS[data.day]?.label || data.day;
    const areaLabel = AREA_LABELS[data.area] || data.area;

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    const sentAutomatically = await trySubmitToApi(data, areaLabel, dayLabel);
    if (submitBtn) submitBtn.disabled = false;

    if (sentAutomatically) {
      sentChildName.textContent = data.childName || 'there';
      sentSlot.textContent = `${dayLabel} at ${data.time}`;
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
      data.address ? `Address: ${data.address}` : null,
      `Requested: ${dayLabel} at ${data.time}`,
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
