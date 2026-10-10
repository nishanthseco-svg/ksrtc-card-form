'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sendTemplateSms, normalizeMobile, SmsError, SEND_URL } = require('../sms');
const { validateApplication, buildSmsVariables } = require('../server');

const config = { apiKey: 'test-key', senderId: 'KESRTC', templateId: '1707175428720844265' };

function fakeFetch(status, body, calls = []) {
  return async (url, init) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
}

test('normalizeMobile accepts common Indian formats', () => {
  assert.equal(normalizeMobile('8075859426'), '8075859426');
  assert.equal(normalizeMobile('+91 80758 59426'), '8075859426');
  assert.equal(normalizeMobile('08075859426'), '8075859426');
  assert.equal(normalizeMobile('12345'), null);
  assert.equal(normalizeMobile('5075859426'), null);
});

test('sends the documented request and returns data', async () => {
  const calls = [];
  const fetchImpl = fakeFetch(200, {
    success: true,
    data: { messageId: '69a002126a3cd35ed260673d', to: '918075859426', status: 'sent', credits: 2 },
    meta: { requestId: 'req_0a3015615764441f', timestamp: '2026-02-26T08:19:31.208Z' },
  }, calls);

  const result = await sendTemplateSms({ to: '+91 8075859426', variables: ['A', 1] }, { ...config, fetchImpl });

  assert.equal(calls[0].url, SEND_URL);
  assert.equal(calls[0].init.headers['X-API-Key'], 'test-key');
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    to: '8075859426', senderId: 'KESRTC', templateId: '1707175428720844265', variables: ['A', '1'],
  });
  assert.equal(result.messageId, '69a002126a3cd35ed260673d');
  assert.equal(result.status, 'sent');
  assert.equal(result.requestId, 'req_0a3015615764441f');
});

test('throws SmsError on API failure', async () => {
  const fetchImpl = fakeFetch(401, { success: false, message: 'Invalid API key' });
  await assert.rejects(
    sendTemplateSms({ to: '8075859426', variables: [] }, { ...config, fetchImpl }),
    (err) => err instanceof SmsError && err.status === 401 && /Invalid API key/.test(err.message),
  );
});

test('dry run does not call the API', async () => {
  const calls = [];
  const result = await sendTemplateSms(
    { to: '8075859426', variables: ['x'] },
    { ...config, apiKey: '', dryRun: true, fetchImpl: fakeFetch(200, {}, calls) },
  );
  assert.equal(calls.length, 0);
  assert.equal(result.status, 'dry-run');
});

test('validateApplication reports field errors', () => {
  const { errors } = validateApplication({ name: 'A', mobile: '123', cardType: 'gold', depot: '' });
  assert.deepEqual(Object.keys(errors).sort(), ['cardType', 'depot', 'mobile', 'name']);
});

test('buildSmsVariables returns 7 template values', () => {
  const { application } = validateApplication({ name: 'Anu', mobile: '8075859426', cardType: 'student', depot: 'Kollam' });
  const vars = buildSmsVariables(application, 'KSRTC123456789');
  assert.equal(vars.length, 7);
  assert.equal(vars[0], 'Anu');
  assert.equal(vars[1], 'KSRTC123456789');
});
