'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { sendTemplateSms, normalizeMobile, SmsError } = require('./sms');

try {
  process.loadEnvFile(path.join(__dirname, '.env'));
} catch {
  // No .env file; rely on the real environment.
}

const CARD_TYPES = {
  student: 'Student Concession Card',
  senior: 'Senior Citizen Card',
  travel: 'Travel Card',
};

function smsConfig() {
  const apiKey = process.env.VOXBAY_API_KEY || '';
  return {
    apiKey,
    senderId: process.env.VOXBAY_SENDER_ID || 'KESRTC',
    templateId: process.env.VOXBAY_TEMPLATE_ID || '1707175428720844265',
    dryRun: process.env.SMS_DRY_RUN === 'true' || !apiKey,
  };
}

function validateApplication(input) {
  const errors = {};
  const name = String(input.name ?? '').trim();
  const mobile = normalizeMobile(input.mobile);
  const cardType = String(input.cardType ?? '');
  const depot = String(input.depot ?? '').trim();

  if (name.length < 2 || name.length > 30) errors.name = 'Enter your name (2-30 characters)';
  if (!mobile) errors.mobile = 'Enter a valid 10-digit mobile number';
  if (!CARD_TYPES[cardType]) errors.cardType = 'Choose a card type';
  if (depot.length < 2 || depot.length > 30) errors.depot = 'Enter your depot (2-30 characters)';

  return { errors, application: { name, mobile, cardType, depot } };
}

// The 7 values for the DLT template, in placeholder order.
// IMPORTANT: this order is a placeholder. Match it to the approved template
// text for VOXBAY_TEMPLATE_ID, or the SMS will be rejected or read wrongly.
function buildSmsVariables(app, applicationId, now = new Date()) {
  const date = now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
  return [
    app.name,                  // {#var1#} applicant name
    applicationId,             // {#var2#} application number
    CARD_TYPES[app.cardType],  // {#var3#} card type
    app.depot,                 // {#var4#} depot
    date,                      // {#var5#} application date
    '7 working days',          // {#var6#} processing time
    'www.keralartc.com',       // {#var7#} where to track / helpline
  ];
}

function newApplicationId() {
  return `KSRTC${Date.now().toString().slice(-6)}${crypto.randomInt(100, 1000)}`;
}

function readJson(req, limit = 10 * 1024) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > limit) reject(Object.assign(new Error('Body too large'), { status: 413 }));
    });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); }
      catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function handleApply(req, res) {
  const { errors, application } = validateApplication(await readJson(req));
  if (Object.keys(errors).length) return sendJson(res, 400, { ok: false, errors });

  const applicationId = newApplicationId();
  // A real app would save the application to a database here.

  try {
    const sms = await sendTemplateSms(
      { to: application.mobile, variables: buildSmsVariables(application, applicationId) },
      smsConfig(),
    );
    sendJson(res, 200, { ok: true, applicationId, sms: { status: sms.status, messageId: sms.messageId } });
  } catch (err) {
    if (!(err instanceof SmsError)) throw err;
    console.error('[sms]', err.message, err.body ?? '');
    // The application is accepted even if the SMS fails; tell the user.
    sendJson(res, 200, { ok: true, applicationId, sms: { status: 'failed' } });
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/api/apply') return await handleApply(req, res);
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return fs.createReadStream(path.join(__dirname, 'public', 'index.html')).pipe(res);
    }
    sendJson(res, 404, { ok: false, error: 'Not found' });
  } catch (err) {
    console.error(err);
    sendJson(res, err.status || 500, { ok: false, error: err.status ? err.message : 'Server error' });
  }
});

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  server.listen(port, () => {
    const { dryRun } = smsConfig();
    console.log(`KSRTC card form on http://localhost:${port} (SMS ${dryRun ? 'DRY RUN' : 'LIVE'})`);
  });
}

module.exports = { server, validateApplication, buildSmsVariables };
