const crypto = require('crypto');
const { doc, PutCommand } = require('./lib/dynamo');
const { sendSms, publishToTopic } = require('./lib/sns');

const RESPONSE_HEADERS = { 'Content-Type': 'application/json' };

function jsonResponse(statusCode, body) {
  return { statusCode, headers: RESPONSE_HEADERS, body: JSON.stringify(body) };
}

const REQUIRED_FIELDS = ['parentName', 'parentPhone', 'childName', 'childAge', 'area', 'day', 'time'];
const MAX_LENGTHS = {
  parentName: 200, parentPhone: 40, parentEmail: 200, childName: 200, childAge: 10,
  favoriteSong: 300, area: 100, day: 40, time: 40, notes: 1000,
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
  REQUIRED_FIELDS.concat(['parentEmail', 'favoriteSong', 'notes']).forEach((field) => {
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
  const message = [
    'New free trial lesson request!',
    `${lead.childName} (${lead.childAge}) - ${lead.parentName}, ${lead.parentPhone}`,
    lead.favoriteSong ? `Favorite song: ${lead.favoriteSong}` : null,
    `Area: ${lead.area}`,
    `Preferred: ${lead.day} - ${lead.time}`,
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
