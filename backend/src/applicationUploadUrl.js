const crypto = require('crypto');
const { S3Client } = require('@aws-sdk/client-s3');
const { createPresignedPost } = require('@aws-sdk/s3-presigned-post');

const s3 = new S3Client({});

// A phone shooting 1080p produces roughly 15-25MB a minute, 4K several times
// that. 180MB covers a comfortable clip at sensible settings while still being
// a hard ceiling S3 itself enforces - the limit lives in the signed policy, so
// a doctored client cannot talk its way past it.
const MAX_BYTES = 180 * 1024 * 1024;
const URL_TTL_SECONDS = 900;

// Deliberately a short allowlist rather than a bare "video/*" check: the
// content type is echoed back into the signed policy, so it has to be
// something we are willing to store and later hand back to a browser.
const ALLOWED = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/x-m4v': 'm4v',
  'video/webm': 'webm',
  'video/3gpp': '3gp',
};

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

function json(statusCode, body) {
  return { statusCode, headers: CORS_HEADERS, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  const q = (event && event.queryStringParameters) || {};
  const contentType = String(q.contentType || '').toLowerCase().split(';')[0].trim();
  const size = Number(q.size || 0);

  const ext = ALLOWED[contentType];
  if (!ext) {
    return json(400, {
      error: 'Unsupported video format',
      allowed: Object.keys(ALLOWED),
    });
  }
  // Checked here too so an oversized file is refused before the applicant sits
  // through an upload that S3 would reject at the very end.
  if (!Number.isFinite(size) || size <= 0) {
    return json(400, { error: 'Missing file size' });
  }
  if (size > MAX_BYTES) {
    return json(413, {
      error: 'That video is too large',
      maxBytes: MAX_BYTES,
      maxMb: Math.floor(MAX_BYTES / 1048576),
    });
  }

  // The key is unguessable on its own: the bucket blocks public access, but
  // this way a key appearing in a log is still not a usable handle on the file.
  const key = `applications/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;

  const presigned = await createPresignedPost(s3, {
    Bucket: process.env.APPLICATION_VIDEOS_BUCKET,
    Key: key,
    Expires: URL_TTL_SECONDS,
    Conditions: [
      ['content-length-range', 1, MAX_BYTES],
      ['eq', '$Content-Type', contentType],
    ],
    Fields: { 'Content-Type': contentType },
  });

  return json(200, {
    url: presigned.url,
    fields: presigned.fields,
    key,
    maxBytes: MAX_BYTES,
  });
};
