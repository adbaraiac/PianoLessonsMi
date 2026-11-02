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

// The paid-conversion event. Only call this once an inquiry has actually
// reached us - either the server confirmed the booking, or the parent tapped
// the text/email fallback. Firing it on submit alone would count conversions
// we never received, and ad budget gets decided off these numbers.
function fireConversionTracking() {
  if (GOOGLE_ADS_SEND_TO && typeof gtag === 'function') {
    gtag('event', 'conversion', { send_to: GOOGLE_ADS_SEND_TO });
  }
  if (META_PIXEL_ID && typeof fbq === 'function') {
    fbq('track', 'Lead');
  }
}

// A completed form that the server refused or never received. Tracked
// separately so silent delivery failures are visible instead of being
// laundered into the conversion count.
function fireSubmitFailed() {
  if (GA4_MEASUREMENT_ID && typeof gtag === 'function') {
    gtag('event', 'booking_submit_failed');
  }
  if (META_PIXEL_ID && typeof fbq === 'function') {
    fbq('trackCustom', 'BookingSubmitFailed');
  }
}

// Call/Text/Email taps. These are the quiet half of the funnel: a parent who
// reads the whole page and then texts instead of filling the form has been
// showing up in our data as a wasted ad click. Tracked as their own events,
// deliberately NOT as the Lead conversion - tapping a tel: link only opens the
// dialer, it does not prove a message was ever sent. Once we can compare these
// counts against texts actually received, we can decide whether to promote them.
const CONTACT_EVENTS = {
  'tel:': { ga: 'clicked_call', meta: 'ClickedCall' },
  'sms:': { ga: 'clicked_text', meta: 'ClickedText' },
  'mailto:': { ga: 'clicked_email', meta: 'ClickedEmail' },
};

// These already report themselves: the booking fallback links count as the
// conversion, and the question link has its own event.
const SELF_TRACKED_LINKS = ['askQuestionLink', 'confirmSmsLink', 'confirmEmailLink'];

function initContactTapTracking() {
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="tel:"], a[href^="sms:"], a[href^="mailto:"]');
    if (!link || SELF_TRACKED_LINKS.includes(link.id)) return;

    const scheme = Object.keys(CONTACT_EVENTS).find((k) => link.getAttribute('href').startsWith(k));
    if (!scheme) return;
    const { ga, meta } = CONTACT_EVENTS[scheme];

    const where = link.closest('.contact-actions') ? 'contact_cards'
      : link.closest('footer, address, .nap') ? 'footer'
      : 'other';

    if (GA4_MEASUREMENT_ID && typeof gtag === 'function') gtag('event', ga, { where });
    if (META_PIXEL_ID && typeof fbq === 'function') fbq('trackCustom', meta, { where });
  });
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
  initContactTapTracking();
  initEnrollmentCountdown();
});

document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener('click', function (e) {
    const href = this.getAttribute('href');
    // Re-checked at click time, not just at bind time: the booking fallback
    // buttons start as href="#" and are rewritten to sms:/mailto: later, and
    // passing one of those to querySelector throws.
    if (!href || href === '#' || !href.startsWith('#')) return;
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


// Bookable availability. This is the only place to edit it: delete a time to
// take it off the board, add a day key to open a new one. A day with an empty
// times array shows as fully booked instead of disappearing.
// Bookable days. Edit this list to open or close a day - the checkboxes, the
// hint text and the confirmation all follow. The form asks which days work
// rather than locking a specific slot, because teacher availability shifts and
// a slot grid promises times we cannot actually verify.
const BOOKING_DAYS = [
  { value: 'Monday', label: 'Monday', note: 'after 4pm' },
  { value: 'Thursday', label: 'Thursday', note: 'after 4pm' },
  { value: 'Saturday', label: 'Saturday', note: 'all day' },
];

// Chosen when none of the listed days work, so a parent who would otherwise
// abandon the form still reaches us.
const NO_DAY_VALUE = 'None of these - contact me about alternatives';

function choiceInputId(prefix, value) {
  return `${prefix}-${value.replace(/[^a-z0-9]/gi, '').toLowerCase()}`;
}

function initBookingForm() {
  const form = document.getElementById('bookingForm');
  if (!form) return;

  const dayChoices = document.getElementById('dayChoices');
  const dayNote = document.getElementById('dayNote');

  // A checkbox group has no native "at least one" rule - `required` on a
  // checkbox only demands that box. So every box carries `required` until one
  // is ticked, which makes reportValidity() enforce the group correctly.
  function syncDayValidity() {
    const boxes = Array.from(form.querySelectorAll('input[name="day"]'));
    const anyChecked = boxes.some((b) => b.checked);
    boxes.forEach((b) => { b.required = !anyChecked; });

    const picked = boxes.filter((b) => b.checked).map((b) => b.value);
    if (!picked.length) dayNote.textContent = '';
    else if (picked.includes(NO_DAY_VALUE)) dayNote.textContent = "No problem - we'll text you about other options.";
    else dayNote.textContent = `✓ We'll text you to confirm a time on ${picked.join(' or ')}.`;
  }

  function addDayChoice(value, label, note) {
    const id = choiceInputId('day', value);
    const wrap = document.createElement('label');
    wrap.className = 'day-choice';
    wrap.setAttribute('for', id);

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = 'day';
    input.id = id;
    input.value = value;
    input.required = true;

    input.addEventListener('change', () => {
      // "None of these" contradicts picking a real day, so the two are
      // mutually exclusive rather than silently sending both.
      const boxes = Array.from(form.querySelectorAll('input[name="day"]'));
      if (input.checked) {
        if (value === NO_DAY_VALUE) boxes.forEach((b) => { if (b !== input) b.checked = false; });
        else boxes.forEach((b) => { if (b.value === NO_DAY_VALUE) b.checked = false; });
      }
      syncDayValidity();
    });

    const text = document.createElement('span');
    text.className = 'day-choice-label';
    text.textContent = label;
    if (note) {
      const small = document.createElement('span');
      small.className = 'day-choice-note';
      small.textContent = note;
      text.appendChild(small);
    }

    wrap.append(input, text);
    dayChoices.appendChild(wrap);
  }

  BOOKING_DAYS.forEach((d) => addDayChoice(d.value, d.label, d.note));
  addDayChoice(NO_DAY_VALUE, 'None of these', 'contact me about alternatives');
  syncDayValidity();

  const confirmPanel = document.getElementById('bookingConfirm');
  const confirmName = document.getElementById('confirmName');
  const confirmSummary = document.getElementById('confirmSummary');
  const confirmSmsLink = document.getElementById('confirmSmsLink');
  const confirmEmailLink = document.getElementById('confirmEmailLink');
  const confirmEditBtn = document.getElementById('confirmEditBtn');
  const sentPanel = document.getElementById('bookingSent');
  const sentSlot = document.getElementById('sentSlot');

  async function trySubmitToApi(data, dayLabel) {
    if (!LEADS_API_URL) return false;
    try {
      const res = await fetch(`${LEADS_API_URL}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentName: data.parentName,
          parentPhone: data.parentPhone,
          childAge: data.childAge,
          favoriteSong: data.favoriteSong || '',
          address: data.address || '',
          day: dayLabel,
          notes: data.notes || '',
          priceAcknowledged: data.priceAck === 'yes' ? 'yes' : 'no',
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // One conversion per inquiry, whichever path delivers it.
  let conversionFired = false;
  function fireConversionOnce() {
    if (conversionFired) return;
    conversionFired = true;
    fireConversionTracking();
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

    conversionFired = false;
    const fd = new FormData(form);
    const data = Object.fromEntries(fd.entries());
    // getAll, not get - a parent can tick more than one day.
    const pickedDays = fd.getAll('day');
    const dayLabel = pickedDays.join(', ');

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    const sentAutomatically = await trySubmitToApi(data, dayLabel);
    if (submitBtn) submitBtn.disabled = false;

    if (sentAutomatically) {
      // Confirmed received - this is a real inquiry, so count it.
      fireConversionOnce();
      sentSlot.textContent = pickedDays.includes(NO_DAY_VALUE)
        ? "We'll text you about times outside our usual days."
        : `You picked ${pickedDays.join(' or ')}`;
      form.hidden = true;
      sentPanel.hidden = false;
      sentPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    // Backend not configured (LEADS_API_URL empty) or the request failed -
    // fall back to letting the parent send the request themselves. No
    // conversion yet: it counts only if they actually send the message.
    fireSubmitFailed();
    const lines = [
      `Hi! I'd like to book a free trial piano lesson.`,
      `Parent: ${data.parentName} (${data.parentPhone})`,
      `Child age: ${data.childAge}`,
      data.favoriteSong ? `Favorite song: ${data.favoriteSong}` : null,
      data.address ? `Address: ${data.address}` : null,
      `Days that work: ${dayLabel}`,
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

  // Tapping one of these opens the parent's messaging app with the request
  // prefilled - that is the inquiry actually reaching us, so it counts here.
  [confirmSmsLink, confirmEmailLink].forEach((link) => {
    link?.addEventListener('click', fireConversionOnce);
  });

  // A question is a softer signal than a booking, so it is tracked on its own
  // rather than counted as a paid conversion.
  document.getElementById('askQuestionLink')?.addEventListener('click', () => {
    if (GA4_MEASUREMENT_ID && typeof gtag === 'function') gtag('event', 'asked_question');
    if (META_PIXEL_ID && typeof fbq === 'function') fbq('trackCustom', 'AskedQuestion');
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
