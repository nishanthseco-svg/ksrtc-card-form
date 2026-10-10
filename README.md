# KSRTC Card Form — SMS sample

A sample KSRTC card application form. When someone applies, it sends a confirmation SMS through the
[Voxbay SMS API](https://sms.voxbay.com) (`POST /customer/api/external/v1/sms/send`).

It has no npm dependencies and needs Node.js 20.12 or later.

## Run

```bash
cp .env.example .env   # add your VOXBAY_API_KEY
npm start              # http://localhost:3000
npm test
```

If `VOXBAY_API_KEY` is empty or `SMS_DRY_RUN=true`, the SMS is printed to the console and not sent.
Set the key and `SMS_DRY_RUN=false` to send real messages.

## Files

| File | What it does |
|---|---|
| `sms.js` | Voxbay client: checks the number, sends the request, handles errors and timeouts |
| `server.js` | HTTP server: serves the form, checks input, maps fields to template variables |
| `public/index.html` | The application form |
| `test/sms.test.js` | Unit tests (the API is faked, so nothing is sent) |

## Before going live

- **Template variables:** `buildSmsVariables()` in `server.js` sends 7 values. Their order is a
  placeholder. Change it to match the approved DLT template text for `VOXBAY_TEMPLATE_ID`.
- **API key:** keep it in `.env` or a secret on the server only. Never put it in front-end code.
  Rotate any key that has been shared in documents.
- **Storage:** applications are not saved. Add a database where `server.js` says so.
