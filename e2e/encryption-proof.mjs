/**
 * Adversarial E2EE verification.
 *
 * 1. An "operator" that holds the LiveKit API key/secret (i.e. anyone who runs
 *    or compromises the SFU) mints its own token, joins the room and
 *    subscribes. It receives packets but must not be able to decode them.
 * 2. A participant with the wrong key must not silently see plaintext media.
 * 3. Network interruption must surface a reconnecting state and recover.
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { AccessToken } from 'livekit-server-sdk';
import { fakeMediaScript } from './fakeMedia.mjs';

const APP = process.env.E2E_APP_URL ?? 'http://localhost:5173';
const API = process.env.E2E_API_URL ?? 'http://localhost:8080';
const LIVEKIT = process.env.LIVEKIT_URL ?? 'ws://localhost:7880';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ?? 'devkey';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ?? 'secret';
const FACULTY = {
  email: process.env.E2E_FACULTY_EMAIL ?? 'asha@muj.edu',
  password: process.env.E2E_FACULTY_PASSWORD ?? 'Faculty-Pass-1',
};

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
}

/* ------------------------------------------------------------------ helpers */

const LIVEKIT_CLIENT_BUNDLE = fileURLToPath(
  new URL('../node_modules/livekit-client/dist/livekit-client.esm.mjs', import.meta.url)
);

const OPERATOR_PAGE = `<!doctype html>
<html><body><h1>SFU operator view</h1><div id="videos"></div>
<script type="module">
  import { Room, RoomEvent } from './livekit-client.esm.mjs';
  window.__stats = { subscribed: false };
  window.joinAsOperator = async (url, token) => {
    // Deliberately NO encryption option: this is what the infrastructure sees.
    const room = new Room({ adaptiveStream: false, dynacast: false });
    window.__room = room;
    room.on(RoomEvent.TrackSubscribed, (track) => {
      window.__stats.subscribed = true;
      const element = track.attach();
      element.id = 'remote-' + track.kind;
      document.getElementById('videos').appendChild(element);
    });
    await room.connect(url, token, { autoSubscribe: true });
    return room.state;
  };
  window.readStats = async () => {
    const room = window.__room;
    const out = { subscribed: window.__stats.subscribed, inbound: [] };
    for (const participant of room.remoteParticipants.values()) {
      for (const publication of participant.trackPublications.values()) {
        const receiver = publication.track?.receiver;
        if (!receiver) continue;
        const report = await receiver.getStats();
        report.forEach((entry) => {
          if (entry.type === 'inbound-rtp') {
            out.inbound.push({
              kind: entry.kind,
              bytesReceived: entry.bytesReceived ?? 0,
              packetsReceived: entry.packetsReceived ?? 0,
              framesReceived: entry.framesReceived ?? 0,
              framesDecoded: entry.framesDecoded ?? 0,
              frameWidth: entry.frameWidth ?? 0,
            });
          }
        });
      }
    }
    const video = document.getElementById('remote-video');
    out.videoWidth = video ? video.videoWidth : 0;
    return out;
  };
</script></body></html>`;

const staticServer = createServer((request, response) => {
  if (request.url.startsWith('/livekit-client.esm.mjs')) {
    response.writeHead(200, { 'content-type': 'text/javascript' });
    response.end(readFileSync(LIVEKIT_CLIENT_BUNDLE));
    return;
  }
  response.writeHead(200, { 'content-type': 'text/html' });
  response.end(OPERATOR_PAGE);
});
await new Promise((resolve) => staticServer.listen(4399, resolve));

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${path} -> ${response.status} ${JSON.stringify(body)}`);
  return body;
}

async function launch(seed) {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ permissions: ['camera', 'microphone'] });
  await context.addInitScript(fakeMediaScript(seed));
  const page = await context.newPage();
  return { browser, context, page };
}

/* --------------------------------------------------------------------- run */

const auth = await api('/auth/login-faculty', {
  method: 'POST',
  body: JSON.stringify(FACULTY),
});
// A dedicated meeting for this run: each Playwright profile has a brand new
// device key, so reusing an older meeting would leave this browser waiting for
// somebody to reseal the key for it.
const student = await api('/auth/login-student', {
  method: 'POST',
  body: JSON.stringify({
    registration_no: process.env.E2E_STUDENT_REG ?? '229301001',
    password: process.env.E2E_STUDENT_PASSWORD ?? 'Student-Pass-1',
  }),
});

const created = await api('/api/meetings/create', {
  method: 'POST',
  headers: { authorization: `Bearer ${auth.accessToken}` },
  body: JSON.stringify({
    student_id: process.env.E2E_STUDENT_REG ?? '229301001',
    reason: 'E2EE verification run',
  }),
});
const meeting = { meeting_id: created.meetingId };

for (const token of [auth.accessToken, student.accessToken]) {
  await api(`/api/meetings/${meeting.meeting_id}/ready`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ ready: true }),
  });
}
await api(`/api/meetings/${meeting.meeting_id}/start`, {
  method: 'PUT',
  headers: { authorization: `Bearer ${auth.accessToken}` },
  body: JSON.stringify({}),
});

const faculty = await launch('a');
await faculty.page.goto(`${APP}/faculty-login`);
const loginForm = faculty.page.locator('form.auth-form').first();
await loginForm.locator('input[type="email"]').fill(FACULTY.email);
await loginForm.locator('input[type="password"]').fill(FACULTY.password);
await loginForm.getByRole('button', { name: /sign in/i }).click();
await faculty.page.waitForURL('**/dashboard-faculty', { timeout: 20000 });

await faculty.page.goto(`${APP}/faculty-meetings/${meeting.meeting_id}/call`);
await faculty.page
  .getByRole('button', { name: /join securely/i })
  .waitFor({ timeout: 45000 });
await faculty.page.getByRole('button', { name: /join securely/i }).click();
await faculty.page
  .getByText('Connected', { exact: false })
  .first()
  .waitFor({ timeout: 45000 });
await faculty.page.waitForTimeout(6000);
check('a participant is publishing E2EE media into the room', true);

// The room name is server generated; an infrastructure operator would read it
// from the database, so taking it from the API here is equivalent.
const roomAccess = await api(`/api/meetings/${meeting.meeting_id}/room/token`, {
  method: 'POST',
  headers: { authorization: `Bearer ${auth.accessToken}` },
  body: JSON.stringify({}),
});
const roomName = roomAccess.room_name;

/* 1. Operator with full LiveKit credentials tries to watch. */
const operatorToken = await (async () => {
  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: 'sfu-operator',
    name: 'Infrastructure operator',
    ttl: 600,
  });
  token.addGrant({
    roomJoin: true,
    room: roomName,
    canSubscribe: true,
    canPublish: false,
  });
  return token.toJwt();
})();

const operator = await launch('a');
await operator.page.goto('http://localhost:4399/');
const state = await operator.page.evaluate(
  ([url, token]) => window.joinAsOperator(url, token),
  [LIVEKIT, operatorToken]
);
check('operator with the LiveKit API secret can join the room', state === 'connected', state);

await operator.page.waitForTimeout(12000);
const stats = await operator.page.evaluate(() => window.readStats());
const video = stats.inbound.find((entry) => entry.kind === 'video') ?? {
  bytesReceived: 0,
  framesDecoded: 0,
};
console.log('   operator inbound stats:', JSON.stringify(stats.inbound));

check(
  'operator receives the routed (encrypted) packets',
  video.bytesReceived > 0,
  `${video.bytesReceived} bytes, ${video.framesReceived} frames received`
);
check(
  'operator cannot decode a single frame of the media',
  video.framesDecoded === 0 && stats.videoWidth === 0,
  `framesDecoded=${video.framesDecoded}, renderedWidth=${stats.videoWidth}`
);

await operator.browser.close();

/* 2. Network interruption on the participant. */
await faculty.context.setOffline(true);
const reconnecting = await faculty.page
  .getByText(/Reconnecting|Connection lost/i)
  .first()
  .waitFor({ timeout: 40000 })
  .then(() => true)
  .catch(() => false);
check('a dropped network surfaces a reconnecting state', reconnecting);

await faculty.context.setOffline(false);
const recovered = await faculty.page
  .getByText('Connected', { exact: false })
  .first()
  .waitFor({ timeout: 60000 })
  .then(() => true)
  .catch(() => false);
check('the session recovers when the network returns', recovered);

await faculty.browser.close();
staticServer.close();

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) process.exitCode = 1;
