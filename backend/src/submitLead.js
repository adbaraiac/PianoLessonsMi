const crypto = require('crypto');
const { doc, PutCommand } = require('./lib/dynamo');
const { sendSms, publishToTopic } = require('./lib/sns');

const RESPONSE_HEADERS = { 'Content-Type': 'application/json' };

function jsonResponse(statusCode, body) {
  return { statusCode, headers: RESPONSE_HEADERS, body: JSON.stringify(body) };
}

const REQUIRED_FIELDS = ['parentName', 'parentPhone', 'childAge', 'address', 'day'];
// Stored but not required, so a parent on a cached copy of an older form still
// books successfully instead of hitting a validation error. childName, area and
// time live here because the form now asks which days work rather than locking a
// specific slot - older cached copies still send them.
const OPTIONAL_FIELDS = [
  'parentEmail', 'childName', 'favoriteSong', 'area', 'time', 'notes', 'priceAcknowledged',
];
const MAX_LENGTHS = {
  parentName: 200, parentPhone: 40, parentEmail: 200, childName: 200, childAge: 10,
  favoriteSong: 300, area: 100, address: 300, day: 120, time: 120, notes: 1000,
  priceAcknowledged: 10,
};

function clean(value, field) {
  if (value === undefined || value === null) return '';
  return String(value).slice(0, MAX_LENGTHS[field] || 200);
}

exports.handler = async (event) => {
  let data;
  try {
    data = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON' });
  }

  // Hidden honeypot field - real parents never fill this in, bots often do.
  // Pretend success so bots don't learn to look for a different signal.
  if (data.website) {
    return jsonResponse(200, { ok: true });
  }

  const missing = REQUIRED_FIELDS.filter((f) => !data[f] || String(data[f]).trim() === '');
  if (missing.length) {
    return jsonResponse(400, { error: `Missing required fields: ${missing.join(', ')}` });
  }

  const id = crypto.randomUUID();
  const token = crypto.randomBytes(16).toString('hex');
  const submittedAt = new Date().toISOString();

  const lead = {
    id,
    token,
    submittedAt,
    status: 'new',
    assignedTeacher: '',
    displacementNote: '',
  };
  REQUIRED_FIELDS.concat(OPTIONAL_FIELDS).forEach((field) => {
    lead[field] = clean(data[field], field);
  });

  await doc.send(new PutCommand({ TableName: process.env.LEADS_TABLE, Item: lead }));

  // Built from the incoming request's own host rather than a template-time
  // reference to the API resource - referencing the API's URL from its own
  // function's environment variable creates a circular CloudFormation
  // dependency (the function's permission depends on the API, which would
  // then depend back on the function through its env var).
  const domainName = event.requestContext && event.requestContext.domainName;
  const apiBaseUrl = domainName ? `https://${domainName}` : '';
  const link = `${apiBaseUrl}/leads/${id}?token=${token}`;
  const child = lead.childName ? `${lead.childName} (age ${lead.childAge})` : `Child age ${lead.childAge}`;
  const message = [
    'New free trial lesson request!',
    `Days that work: ${lead.day}${lead.time ? ` - ${lead.time}` : ''}`,
    `${child} - ${lead.parentName}, ${lead.parentPhone}`,
    lead.address ? `Address: ${lead.address}` : null,
    lead.area ? `Area: ${lead.area}` : null,
    lead.favoriteSong ? `Favorite song: ${lead.favoriteSong}` : null,
    lead.priceAcknowledged === 'yes' ? 'Pricing: acknowledged before booking' : null,
    lead.notes ? `Notes: ${lead.notes}` : null,
    `Log it: ${link}`,
  ].filter(Boolean).join('\n');

  // Email and SMS are independent - the lead is already saved either way,
  // and one channel failing (e.g. SMS while toll-free registration is
  // pending) should never block the other or fail the parent's submission.
  const notifications = await Promise.allSettled([
    publishToTopic(process.env.NOTIFICATION_TOPIC_ARN, 'New free trial lesson request', message),
    sendSms(process.env.AIDEN_PHONE, message),
  ]);
  notifications.forEach((result, i) => {
    if (result.status === 'rejected') {
      console.error(`Notification channel ${i === 0 ? 'email' : 'sms'} failed`, result.reason);
    }
  });

  return jsonResponse(200, { ok: true, id });
};
