/* Teacher application page.
 *
 * The video is the whole point of this form, and it is also the only part that
 * can plausibly fail: phone clips are large, and a silent 90-second wait reads
 * as a broken page. So the upload runs as soon as a file is chosen, shows real
 * progress, and never blocks the rest of the form - if it fails, the applicant
 * can still submit and paste a link instead.
 */
const API_URL = 'https://8qzuq3rfrk.execute-api.us-east-1.amazonaws.com';

// Mirrors SERVICE_AREAS in backend/src/lib/config.js. Deliberately wider than
// the cities we teach in today: an applicant in a city with no students yet is
// the reason we can say yes the first time a parent there asks.
const AREAS = [
  'Troy', 'Rochester Hills', 'Birmingham', 'Bloomfield Hills', 'Royal Oak',
  'Farmington Hills', 'West Bloomfield', 'Novi', 'Auburn Hills', 'Clawson',
  'Berkley', 'Ferndale', 'Madison Heights', 'Southfield', 'Sterling Heights',
  'Shelby Township', 'Utica', 'Warren',
];

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const ATTRIBUTION_KEY = 'pn_source';

function sourceForApplication() {
  const q = new URLSearchParams(location.search);
  const utm = q.get('utm_source');
  if (utm) return `${utm} / ${q.get('utm_medium') || 'unknown'}`;
  try {
    const stored = JSON.parse(localStorage.getItem(ATTRIBUTION_KEY) || 'null');
    if (stored && stored.source) return stored.source;
  } catch { /* private mode */ }
  if (document.referrer) {
    try {
      const h = new URL(document.referrer).hostname.replace(/^www\./, '');
      if (h && h !== location.hostname) return `${h} / referral`;
    } catch { /* malformed referrer */ }
  }
  return 'direct';
}

function chip(name, value) {
  const label = document.createElement('label');
  label.className = 'chip';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.name = name;
  input.value = value;
  const span = document.createElement('span');
  span.textContent = value;
  label.append(input, span);
  return label;
}

function fillChips(containerId, name, values) {
  const host = document.getElementById(containerId);
  if (!host) return;
  values.forEach((v) => host.appendChild(chip(name, v)));
}

function mb(bytes) {
  return (bytes / 1048576).toFixed(0);
}

document.addEventListener('DOMContentLoaded', () => {
  fillChips('areaChoices', 'areas', AREAS);
  fillChips('dayChoices', 'availability', DAYS);

  const form = document.getElementById('applicationForm');
  if (!form) return;

  const phoneInput = document.getElementById('phone');
  const emailInput = document.getElementById('email');
  const CONTACT_PROMPT = 'Add a mobile number or an email so we can reply.';

  // No native "at least one of these two" rule, so each stays required only
  // while the other is empty. Same pattern as the parent booking form.
  function syncContactRequired() {
    const hasOne = [phoneInput, emailInput].some((el) => el && el.value.trim() !== '');
    [phoneInput, emailInput].forEach((el) => {
      if (!el) return;
      el.required = !hasOne;
      el.setCustomValidity(hasOne ? '' : CONTACT_PROMPT);
    });
    if (hasOne && emailInput && emailInput.value.trim() !== '') emailInput.setCustomValidity('');
  }
  [phoneInput, emailInput].forEach((el) => el && el.addEventListener('input', syncContactRequired));
  syncContactRequired();

  /* ===== Video upload ===== */
  const fileInput = document.getElementById('videoFile');
  const drop = document.getElementById('videoDrop');
  const dropText = document.getElementById('videoDropText');
  const dropHint = document.getElementById('videoDropHint');
  const progress = document.getElementById('uploadProgress');
  const barFill = document.getElementById('uploadBarFill');
  const statusEl = document.getElementById('uploadStatus');

  let uploadedKey = '';
  let uploading = false;

  function setDropState(cls, text, hint) {
    drop.classList.remove('is-ready', 'is-error');
    if (cls) drop.classList.add(cls);
    if (text) dropText.textContent = text;
    if (hint !== undefined) dropHint.textContent = hint;
  }

  async function uploadVideo(file) {
    uploadedKey = '';
    uploading = true;
    progress.hidden = false;
    barFill.style.width = '0%';
    statusEl.textContent = 'Getting ready...';
    setDropState(null, file.name, `${mb(file.size)}MB`);

    let ticket;
    try {
      const res = await fetch(
        `${API_URL}/applications/upload-url?contentType=${encodeURIComponent(file.type)}&size=${file.size}`
      );
      ticket = await res.json();
      if (!res.ok) throw new Error(ticket.error || 'Upload could not start');
    } catch (err) {
      uploading = false;
      progress.hidden = true;
      setDropState('is-error', 'Couldn’t start the upload', 'Tap to try again, or paste a link below instead.');
      return;
    }

    const body = new FormData();
    Object.entries(ticket.fields).forEach(([k, v]) => body.append(k, v));
    body.append('file', file);

    // XHR rather than fetch: fetch still cannot report upload progress, and on
    // a 150MB phone video that progress bar is the difference between waiting
    // and giving up.
    await new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', ticket.url, true);
      xhr.upload.addEventListener('progress', (e) => {
        if (!e.lengthComputable) return;
        const pct = Math.round((e.loaded / e.total) * 100);
        barFill.style.width = pct + '%';
        statusEl.textContent = `Uploading... ${pct}%`;
      });
      xhr.addEventListener('load', () => {
        uploading = false;
        if (xhr.status >= 200 && xhr.status < 300) {
          uploadedKey = ticket.key;
          barFill.style.width = '100%';
          statusEl.textContent = 'Uploaded ✓';
          setDropState('is-ready', file.name, 'Video attached. Tap to pick a different one.');
        } else {
          setDropState('is-error', 'That upload didn’t go through', 'Tap to try again, or paste a link below instead.');
          statusEl.textContent = '';
          progress.hidden = true;
        }
        resolve();
      });
      xhr.addEventListener('error', () => {
        uploading = false;
        setDropState('is-error', 'That upload didn’t go through', 'Tap to try again, or paste a link below instead.');
        statusEl.textContent = '';
        progress.hidden = true;
        resolve();
      });
      xhr.send(body);
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      // Checked here as well as in the signed policy, so an oversized file is
      // refused instantly rather than after a long upload S3 would reject.
      if (file.size > 180 * 1024 * 1024) {
        setDropState('is-error', 'That video is too big', `${mb(file.size)}MB — the limit is 180MB. A shorter clip, or paste a link below.`);
        fileInput.value = '';
        return;
      }
      uploadVideo(file);
    });
  }

  /* ===== Submit ===== */
  const sentPanel = document.getElementById('applicationSent');
  const submitBtn = document.getElementById('applySubmit');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) {
      const firstInvalid = Array.from(form.elements).find((el) => el.willValidate && !el.checkValidity());
      firstInvalid?.closest('.form-field, .form-block, .price-ack, .contact-choice')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    if (uploading) {
      statusEl.textContent = 'Hang on—your video is still uploading.';
      progress.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const fd = new FormData(form);
    const payload = {
      fullName: fd.get('fullName') || '',
      phone: fd.get('phone') || '',
      email: fd.get('email') || '',
      homeCity: fd.get('homeCity') || '',
      areas: fd.getAll('areas').join(', '),
      travelRadius: fd.get('travelRadius') || '',
      pianoYears: fd.get('pianoYears') || '',
      teachingExperience: fd.get('teachingExperience') || '',
      availability: fd.getAll('availability').join(', '),
      videoKey: uploadedKey,
      videoLink: fd.get('videoLink') || '',
      hasCar: fd.get('hasCar') || '',
      backgroundCheckOk: fd.get('backgroundCheckOk') === 'yes' ? 'yes' : '',
      notes: fd.get('notes') || '',
      source: sourceForApplication(),
      website: fd.get('website') || '',
    };

    if (submitBtn) submitBtn.disabled = true;
    let ok = false;
    try {
      const res = await fetch(`${API_URL}/applications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      ok = res.ok;
    } catch {
      ok = false;
    }
    if (submitBtn) submitBtn.disabled = false;

    if (ok) {
      form.hidden = true;
      sentPanel.hidden = false;
      sentPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    // Never strand a finished application: fall back to email with everything
    // they typed already in the body.
    const lines = [
      `Teacher application - ${payload.fullName}`,
      payload.phone ? `Phone: ${payload.phone}` : null,
      payload.email ? `Email: ${payload.email}` : null,
      `Lives in: ${payload.homeCity}`,
      payload.areas ? `Can teach: ${payload.areas}` : null,
      payload.travelRadius ? `Will travel: ${payload.travelRadius}` : null,
      payload.availability ? `Available: ${payload.availability}` : null,
      payload.pianoYears ? `Playing for: ${payload.pianoYears}` : null,
      payload.teachingExperience ? `Experience: ${payload.teachingExperience}` : null,
      payload.videoLink ? `Video: ${payload.videoLink}` : null,
      payload.notes ? `Notes: ${payload.notes}` : null,
    ].filter(Boolean).join('\n');
    window.location.href = `mailto:adbaraiac04@gmail.com?subject=${encodeURIComponent('Teacher application')}&body=${encodeURIComponent(lines)}`;
  });
});
