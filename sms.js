'use strict';

// Client for the Voxbay SMS API (see KSRTC SMS DELIVERY API DOCUMENT).
// POST /customer/api/external/v1/sms/send with a DLT template and its variables.

const SEND_URL = 'https://sms.voxbay.com/customer/api/external/v1/sms/send';

class SmsError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = 'SmsError';
    this.status = status;
    this.body = body;
  }
}

// Accepts "9876543210", "+91 98765 43210", "09876543210" etc. and returns the
// 10-digit Indian mobile number the API expects, or null if invalid.
function normalizeMobile(input) {
  const digits = String(input ?? '').replace(/\D/g, '');
  const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2)
    : digits.length === 11 && digits.startsWith('0') ? digits.slice(1)
    : digits;
  return /^[6-9]\d{9}$/.test(local) ? local : null;
}

async function sendTemplateSms({ to, variables }, config) {
  const { apiKey, senderId, templateId, dryRun = false, fetchImpl = fetch, timeoutMs = 10000 } = config;

  const mobile = normalizeMobile(to);
  if (!mobile) throw new SmsError(`Invalid mobile number: ${to}`);
  if (!senderId || !templateId) throw new SmsError('senderId and templateId are required');
  if (!Array.isArray(variables)) throw new SmsError('variables must be an array');

  const payload = { to: mobile, senderId, templateId, variables: variables.map(String) };

  if (dryRun) {
    console.log('[sms:dry-run] would send', JSON.stringify(payload));
    return { dryRun: true, messageId: null, to: `91${mobile}`, status: 'dry-run', payload };
  }
  if (!apiKey) throw new SmsError('VOXBAY_API_KEY is not set');

  let res;
  try {
    res = await fetchImpl(SEND_URL, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new SmsError(`SMS request failed: ${err.message}`);
  }

  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    const reason = body?.error?.message || body?.message || `HTTP ${res.status}`;
    throw new SmsError(`SMS not sent: ${reason}`, { status: res.status, body });
  }

  // Success shape: { success, data: { messageId, to, status, credits }, meta: { requestId, timestamp } }
  return { ...body.data, requestId: body.meta?.requestId };
}

module.exports = { sendTemplateSms, normalizeMobile, SmsError, SEND_URL };
