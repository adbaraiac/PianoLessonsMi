const { doc, GetCommand, UpdateCommand } = require('./lib/dynamo');
const { TEACHERS, STATUS_OPTIONS, isBookedStatus } = require('./lib/config');

function htmlResponse(body, statusCode = 200) {
  return { statusCode, headers: { 'Content-Type': 'text/html; charset=utf-8' }, body };
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function page(title, content) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#faf9f7;color:#2c2c2e;margin:0;padding:1.5rem;}
  .card{max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:1.5rem;box-shadow:0 2px 12px rgba(0,0,0,.08);}
  h1{font-size:1.15rem;margin:0 0 1rem;}
  dl{margin:0 0 1.25rem;}
  dt{font-weight:600;font-size:.8rem;color:#737378;margin-top:.6rem;}
  dd{margin:0;font-size:1rem;}
  fieldset{border:1px solid #eee;border-radius:12px;padding:.75rem 1rem;margin-bottom:1rem;}
  legend{font-weight:600;font-size:.85rem;padding:0 .4rem;}
  select,textarea{width:100%;min-height:44px;font-size:1rem;font-family:inherit;border:1px solid #ddd;border-radius:8px;padding:.4rem;}
  button{width:100%;min-height:48px;background:#3d5c50;color:#fff;border:none;border-radius:999px;font-size:1rem;font-weight:600;margin-top:.5rem;}
  .note{color:#737378;font-size:.85rem;}
</style></head>
<body><div class="card">${content}</div></body></html>`;
}

function renderLead(lead, token, justSaved) {
  const teacherOptions = TEACHERS.map((t) =>
    `<option value="${t.key}" ${lead.assignedTeacher === t.key ? 'selected' : ''}>${escapeHtml(t.label)}</option>`
  ).join('');
  const statusOptions = STATUS_OPTIONS.map((s) =>
    `<option value="${s.key}" ${lead.status === s.key ? 'selected' : ''}>${escapeHtml(s.label)}</option>`
  ).join('');

  return `
    ${justSaved ? '<p class="note">✓ Saved.</p>' : ''}
    <h1>${escapeHtml(lead.childName)} (${escapeHtml(lead.childAge)}) — ${escapeHtml(lead.parentName)}</h1>
    <dl>
      <dt>Phone</dt><dd>${escapeHtml(lead.parentPhone)}</dd>
      <dt>Favorite song</dt><dd>${escapeHtml(lead.favoriteSong || '—')}</dd>
      <dt>Area</dt><dd>${escapeHtml(lead.area)}</dd>
      <dt>Requested</dt><dd>${escapeHtml(lead.day)} — ${escapeHtml(lead.time)}</dd>
      <dt>Notes</dt><dd>${escapeHtml(lead.notes || '—')}</dd>
    </dl>
    <form method="POST" action="?token=${encodeURIComponent(token)}">
      <fieldset>
        <legend>Who's teaching this?</legend>
        <select name="teacher">
          <option value="">— none yet —</option>
          ${teacherOptions}
        </select>
      </fieldset>
      <fieldset>
        <legend>Status</legend>
        <select name="status">
          ${statusOptions}
        </select>
      </fieldset>
      <fieldset>
        <legend>Displacement note (optional)</legend>
        <textarea name="displacementNote" rows="2" placeholder="e.g. bumped the Smith family this week">${escapeHtml(lead.displacementNote || '')}</textarea>
      </fieldset>
      <button type="submit">Save</button>
    </form>
    <p class="note">This just updates our records — remember to text the teacher and/or family yourself as usual.</p>
  `;
}

async function adjustSlotOnStatusChange(lead, newStatus, teacher) {
  if (!teacher || !lead.day) return;
  const teacherDay = `${teacher}#${lead.day}`.toLowerCase();
  const wasBooked = isBookedStatus(lead.status);
  const willBeBooked = isBookedStatus(newStatus);
  if (wasBooked === willBeBooked) return;

  const delta = willBeBooked ? 1 : -1;
  await doc.send(new UpdateCommand({
    TableName: process.env.SLOTS_TABLE,
    Key: { teacherDay },
    UpdateExpression: 'SET booked = if_not_exists(booked, :zero) + :delta, capacity = if_not_exists(capacity, :defaultCap)',
    ExpressionAttributeValues: { ':delta': delta, ':zero': 0, ':defaultCap': 0 },
  }));
}

exports.handler = async (event) => {
  const id = event.pathParameters && event.pathParameters.id;
  const method = event.requestContext.http.method;
  const token = (event.queryStringParameters || {}).token;

  if (!id) return htmlResponse(page('Not found', '<h1>Lead not found</h1>'), 404);

  const { Item: lead } = await doc.send(new GetCommand({ TableName: process.env.LEADS_TABLE, Key: { id } }));

  if (!lead || lead.token !== token) {
    return htmlResponse(page('Not found', '<h1>Link not valid</h1><p class="note">This link is either wrong or has expired.</p>'), 404);
  }

  if (method === 'POST') {
    const rawBody = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '');
    const params = new URLSearchParams(rawBody);
    const newStatus = params.get('status');
    const newTeacher = params.get('teacher') || lead.assignedTeacher || '';
    const displacementNote = params.has('displacementNote') ? params.get('displacementNote').slice(0, 500) : (lead.displacementNote || '');

    if (STATUS_OPTIONS.some((s) => s.key === newStatus)) {
      await adjustSlotOnStatusChange(lead, newStatus, newTeacher);
      await doc.send(new UpdateCommand({
        TableName: process.env.LEADS_TABLE,
        Key: { id },
        UpdateExpression: 'SET #status = :status, assignedTeacher = :teacher, displacementNote = :note',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': newStatus, ':teacher': newTeacher, ':note': displacementNote },
      }));
      lead.status = newStatus;
      lead.assignedTeacher = newTeacher;
      lead.displacementNote = displacementNote;
    }

    return htmlResponse(page('Saved', renderLead(lead, token, true)));
  }

  return htmlResponse(page(`${lead.childName}'s trial request`, renderLead(lead, token, false)));
};
