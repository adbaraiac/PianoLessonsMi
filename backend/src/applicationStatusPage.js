const { doc, GetCommand, UpdateCommand } = require('./lib/dynamo');
const { APPLICATION_STATUS_OPTIONS } = require('./lib/config');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3 = new S3Client({});
const VIDEO_URL_TTL_SECONDS = 3600;

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
  .card{max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:1.5rem;box-shadow:0 2px 12px rgba(0,0,0,.08);}
  h1{font-size:1.15rem;margin:0 0 .25rem;}
  .sub{color:#737378;font-size:.85rem;margin:0 0 1rem;}
  dl{margin:0 0 1.25rem;}
  dt{font-weight:600;font-size:.8rem;color:#737378;margin-top:.7rem;}
  dd{margin:0;font-size:1rem;white-space:pre-wrap;}
  video{width:100%;border-radius:12px;background:#000;margin:.5rem 0 1rem;}
  fieldset{border:1px solid #eee;border-radius:12px;padding:.75rem 1rem;margin-bottom:1rem;}
  legend{font-weight:600;font-size:.85rem;padding:0 .4rem;}
  select,textarea{width:100%;min-height:44px;font-size:1rem;font-family:inherit;border:1px solid #ddd;border-radius:8px;padding:.4rem;box-sizing:border-box;}
  button{width:100%;min-height:48px;background:#3d5c50;color:#fff;border:none;border-radius:999px;font-size:1rem;font-weight:600;margin-top:.5rem;}
  a.call{display:block;text-align:center;margin-top:.75rem;color:#3d5c50;font-weight:600;}
  .note{color:#737378;font-size:.85rem;}
  .saved{color:#3d5c50;font-weight:600;}
</style></head>
<body><div class="card">${content}</div></body></html>`;
}

function row(label, value) {
  if (!value) return '';
  return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`;
}

function render(app, token, videoUrl, justSaved) {
  const statusOptions = APPLICATION_STATUS_OPTIONS.map((s) =>
    `<option value="${s.key}" ${app.status === s.key ? 'selected' : ''}>${escapeHtml(s.label)}</option>`
  ).join('');

  // The clip is served through a short-lived signed URL rather than a public
  // object: someone's audition video should stop being reachable once this
  // page is closed.
  const video = videoUrl
    ? `<video controls preload="metadata" src="${escapeHtml(videoUrl)}"></video>
       <p class="note">This video link works for the next hour. Reload this page for a fresh one.</p>`
    : (app.videoLink
      ? `<p><a href="${escapeHtml(app.videoLink)}" rel="noopener noreferrer" target="_blank">Watch their video &rarr;</a></p>`
      : '<p class="note">No video submitted.</p>');

  const contactLink = app.phone
    ? `<a class="call" href="sms:${escapeHtml(app.phone)}">Text ${escapeHtml(app.fullName.split(' ')[0])}</a>`
    : (app.email ? `<a class="call" href="mailto:${escapeHtml(app.email)}">Email ${escapeHtml(app.fullName.split(' ')[0])}</a>` : '');

  return page(`${app.fullName} - teacher application`, `
    ${justSaved ? '<p class="saved">&#10003; Saved.</p>' : ''}
    <h1>${escapeHtml(app.fullName)}</h1>
    <p class="sub">Applied ${escapeHtml(app.submittedAt.slice(0, 10))} &middot; based in ${escapeHtml(app.homeCity)}</p>
    ${video}
    <dl>
      ${row('Phone', app.phone)}
      ${row('Email', app.email)}
      ${row('Can teach in', app.areas)}
      ${row('Will travel', app.travelRadius)}
      ${row('Playing for', app.pianoYears)}
      ${row('Teaching experience', app.teachingExperience)}
      ${row('Available', app.availability)}
      ${row('Own transport', app.hasCar === 'yes' ? 'Yes' : app.hasCar === 'no' ? 'No' : '')}
      ${row('OK with a background check', app.backgroundCheckOk === 'yes' ? 'Yes' : '')}
      ${row('Anything else', app.notes)}
      ${row('Came from', app.source)}
    </dl>
    <form method="POST">
      <input type="hidden" name="token" value="${escapeHtml(token)}" />
      <fieldset>
        <legend>Where are they up to?</legend>
        <select name="status">${statusOptions}</select>
      </fieldset>
      <fieldset>
        <legend>Your notes</legend>
        <textarea name="reviewNote" rows="3" placeholder="What stood out, what to ask them...">${escapeHtml(app.reviewNote || '')}</textarea>
      </fieldset>
      <button type="submit">Save</button>
    </form>
    ${contactLink}
  `);
}

async function load(id) {
  const res = await doc.send(new GetCommand({
    TableName: process.env.APPLICATIONS_TABLE,
    Key: { id },
  }));
  return res.Item || null;
}

exports.handler = async (event) => {
  const id = event.pathParameters && event.pathParameters.id;
  const method = event.requestContext && event.requestContext.http && event.requestContext.http.method;
  if (!id) return htmlResponse(page('Not found', '<p>Unknown application.</p>'), 404);

  const app = await load(id);
  if (!app) return htmlResponse(page('Not found', '<p>Unknown application.</p>'), 404);

  let token = (event.queryStringParameters || {}).token || '';
  let justSaved = false;

  if (method === 'POST') {
    const body = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf8')
      : (event.body || '');
    const params = new URLSearchParams(body);
    token = params.get('token') || token;
    if (token !== app.token) {
      return htmlResponse(page('Not allowed', '<p>That link is not valid.</p>'), 403);
    }
    const newStatus = params.get('status');
    const reviewNote = (params.get('reviewNote') || '').slice(0, 2000);
    if (APPLICATION_STATUS_OPTIONS.some((s) => s.key === newStatus)) {
      await doc.send(new UpdateCommand({
        TableName: process.env.APPLICATIONS_TABLE,
        Key: { id },
        UpdateExpression: 'SET #status = :status, reviewNote = :note',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': newStatus, ':note': reviewNote },
      }));
      app.status = newStatus;
      app.reviewNote = reviewNote;
      justSaved = true;
    }
  }

  if (token !== app.token) {
    return htmlResponse(page('Not allowed', '<p>That link is not valid.</p>'), 403);
  }

  let videoUrl = null;
  if (app.videoKey) {
    try {
      videoUrl = await getSignedUrl(s3, new GetObjectCommand({
        Bucket: process.env.APPLICATION_VIDEOS_BUCKET,
        Key: app.videoKey,
      }), { expiresIn: VIDEO_URL_TTL_SECONDS });
    } catch (err) {
      console.error('Could not sign video url', err);
    }
  }

  return htmlResponse(render(app, token, videoUrl, justSaved));
};
