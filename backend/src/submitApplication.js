const crypto = require('crypto');
const { doc, PutCommand } = require('./lib/dynamo');
const { sendSms, publishToTopic } = require('./lib/sns');

const RESPONSE_HEADERS = { 'Content-Type': 'application/json' };

function jsonResponse(statusCode, body) {
  return { statusCode, headers: RESPONSE_HEADERS, body: JSON.stringify(body) };
}

// A name and somewhere they can teach. Everything else is useful rather than
// essential, and an application we cannot act on is worse than a thin one.
const REQUIRED_FIELDS = ['fullName', 'homeCity'];
// At least one of these - same rule as the parent booking form.
const CONTACT_FIELDS = ['phone', 'email'];
const OPTIONAL_FIELDS = [
  'areas', 'travelRadius', 'pianoYears', 'teachingExperience', 'availability',
  'videoKey', 'videoLink', 'hasCar', 'backgroundCheckOk', 'notes', 'source',
];

const MAX_LENGTHS = {
  fullName: 200, phone: 40, email: 200, homeCity: 120, areas: 600,
  travelRadius: 40, pianoYears: 40, teachingExperience: 2000, availability: 400,
  videoKey: 300, videoLink: 500, hasCar: 10, backgroundCheckOk: 10,
  notes: 2000, source: 200,
};

function clean(value, field) {
  if (value === undefined || value === null) return '';
  const raw = Array.isArray(value) ? value.join(', ') : String(value);
  return raw.slice(0, MAX_LENGTHS[field] || 200);
}

exports.handler = async (event) => {
  let data;
  try {
    data = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON' });
  }

  // Same honeypot as the booking form - real applicants never fill this in.
  if (data.website) {
    return jsonResponse(200, { ok: true });
  }

  const missing = REQUIRED_FIELDS.filter((f) => !data[f] || String(data[f]).trim() === '');
  if (missing.length) {
    return jsonResponse(400, { error: `Missing required fields: ${missing.join(', ')}` });
  }
  const hasContact = CONTACT_FIELDS.some((f) => data[f] && String(data[f]).trim() !== '');
  if (!hasContact) {
    return jsonResponse(400, { error: `Provide at least one of: ${CONTACT_FIELDS.join(', ')}` });
  }

  const id = crypto.randomUUID();
  const token = crypto.randomBytes(16).toString('hex');
  const submittedAt = new Date().toISOString();

  const application = { id, token, submittedAt, status: 'new', reviewNote: '' };
  REQUIRED_FIELDS.concat(CONTACT_FIELDS, OPTIONAL_FIELDS).forEach((field) => {
    application[field] = clean(data[field], field);
  });

  await doc.send(new PutCommand({
    TableName: process.env.APPLICATIONS_TABLE,
    Item: application,
  }));

  const domainName = event.requestContext && event.requestContext.domainName;
  const apiBaseUrl = domainName ? `https://${domainName}` : '';
  const link = `${apiBaseUrl}/applications/${id}?token=${token}`;

  const contact = [application.phone, application.email].filter(Boolean).join(' / ');
  const message = [
    'New teacher application!',
    `${application.fullName} - ${contact}`,
    `Based in: ${application.homeCity}`,
    application.areas ? `Can teach: ${application.areas}` : null,
    application.travelRadius ? `Will travel: ${application.travelRadius}` : null,
    application.pianoYears ? `Playing for: ${application.pianoYears}` : null,
    application.availability ? `Free: ${application.availability}` : null,
    application.hasCar === 'yes' ? 'Has their own transport' : null,
    application.hasCar === 'no' ? 'NO transport of their own' : null,
    application.videoKey ? 'Video: uploaded' : (application.videoLink ? `Video: ${application.videoLink}` : 'Video: none'),
    `Review: ${link}`,
  ].filter(Boolean).join('\n');

  // Independent channels, same as lead intake: the application is already
  // saved, so one notification failing must not fail the applicant's submit.
  const notifications = await Promise.allSettled([
    publishToTopic(process.env.NOTIFICATION_TOPIC_ARN, 'New teacher application', message),
    sendSms(process.env.AIDEN_PHONE, message),
  ]);
  notifications.forEach((result, i) => {
    if (result.status === 'rejected') {
      console.error(`Notification channel ${i === 0 ? 'email' : 'sms'} failed`, result.reason);
    }
  });

  return jsonResponse(200, { ok: true, id });
};
