/* PorchNote First Notes page.
   The First Notes app (separate project) owns the free lesson, checkout,
   accounts and progress. This page only links to it. */

const FIRST_NOTES = {
  // Where the app lives. Change this one line when it moves (e.g. to a subdomain).
  appUrl: 'https://porchnote-first-notes.vercel.app',
  // Flip to true once paid checkout and refunds are live in the app:
  // shows the $149 price with the guarantee, terms and refund contact.
  paidLaunched: false,
};

const GA4_MEASUREMENT_ID = 'G-GX7EZGC3CS';
const META_PIXEL_ID = '1089866153420965';
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

/**
 * Point every [data-app-link] at the app, carrying campaign tags. A family who
 * arrived from an ad keeps that ad's tags; everyone else is tagged as coming
 * from this page so the app can tell website traffic apart.
 */
function initAppLinks() {
  const here = new URLSearchParams(location.search);
  const fromAd = UTM_KEYS.some((k) => here.has(k));
  document.querySelectorAll('a[data-app-link]').forEach((link) => {
    const where = link.dataset.appLink;
    const url = new URL(link.getAttribute('href'), FIRST_NOTES.appUrl);
    if (fromAd) {
      UTM_KEYS.forEach((k) => { if (here.has(k)) url.searchParams.set(k, here.get(k)); });
    } else {
      url.searchParams.set('utm_source', 'porchnotemusic.com');
      url.searchParams.set('utm_medium', 'website');
      url.searchParams.set('utm_campaign', 'first_notes_page');
      url.searchParams.set('utm_content', where);
    }
    link.href = url.toString();
    // Separate from in-home lead events: never the Lead / Ads conversion.
    link.addEventListener('click', () => {
      if (typeof gtag === 'function') gtag('event', 'first_notes_app_click', { where, send_to: GA4_MEASUREMENT_ID });
      if (typeof fbq === 'function') fbq('trackCustom', 'FirstNotesAppClick', { where });
    });
  });
}

function initOffer() {
  const show = FIRST_NOTES.paidLaunched ? 'paid' : 'upcoming';
  document.querySelectorAll('[data-offer]').forEach((el) => {
    el.hidden = el.dataset.offer !== show;
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initAppLinks();
  initOffer();
});
