// Cloudflare R2 storage wrapper (S3-compatible).
//
// Config comes from env vars — set them in the Railway dashboard:
//   R2_ACCOUNT_ID         Cloudflare account ID
//   R2_ACCESS_KEY_ID      R2 API token — access key id
//   R2_SECRET_ACCESS_KEY  R2 API token — secret access key
//   R2_BUCKET             bucket name
//
// When unset, isConfigured() returns false and the attachment routes return
// a clear 503 instead of crashing — the rest of the app is unaffected.

const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env

function isConfigured() {
  return !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET)
}

let _client = null
function client() {
  if (!isConfigured()) {
    throw new Error('Cloudflare R2 chưa được cấu hình — thiếu biến môi trường R2_*')
  }
  if (!_client) {
    _client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    })
  }
  return _client
}

async function putObject(key, body, contentType) {
  await client().send(new PutObjectCommand({
    Bucket: R2_BUCKET, Key: key, Body: body, ContentType: contentType,
  }))
}

async function deleteObject(key) {
  await client().send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }))
}

// Short-lived presigned GET URL. The browser can't send our Bearer token when
// opening a file in a new tab, so the client views/downloads via this instead.
// `inline: true` → PDFs/images render in the tab; false → forces a download.
async function presignGet(key, { filename, contentType, inline = true, expiresIn = 300 } = {}) {
  const disposition =
    `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(filename || 'file')}"`
  const cmd = new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ResponseContentDisposition: disposition,
    ResponseContentType: contentType || undefined,
  })
  return getSignedUrl(client(), cmd, { expiresIn })
}

module.exports = { isConfigured, putObject, deleteObject, presignGet }
