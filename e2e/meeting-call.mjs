/**
 * Two-browser verification of the encrypted meeting call.
 *
 * Drives the real app: the student signs in at `/`, the mentor at
 * `/faculty-login`, both open the ongoing meeting's call, and the script checks
 * that each side decodes the other's end-to-end encrypted video.
 *
 * See e2e/README.md for how to run it.
 */
import { chromium } from 'playwright';
import { fakeMediaScript } from './fakeMedia.mjs';

const APP = process.env.E2E_APP_URL ?? 'http://localhost:5173';
const API = process.env.E2E_API_URL ?? 'http://localhost:8080';
const STUDENT = {
  registration_no: process.env.E2E_STUDENT_REG ?? '229301001',
  password: process.env.E2E_STUDENT_PASSWORD ?? 'Student-Pass-1',
};
const FACULTY = {
  email: process.env.E2E_FACULTY_EMAIL ?? 'asha@muj.edu',
  password: process.env.E2E_FACULTY_PASSWORD ?? 'Faculty-Pass-1',
};

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
}

async function launch(seed) {
  const browser = await chromium.launch({
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  const context = await browser.newContext({
    permissions: ['camera', 'microphone'],
  });
  await context.addInitScript(fakeMediaScript(seed));
  const page = await context.newPage();
  page.on('pageerror', (error) => console.log(`  [pageerror] ${error.message}`));
  return { browser, context, page };
}

/**
 * Creates a dedicated ongoing meeting through the API.
 *
 * Each Playwright profile generates a fresh encryption device key, so reusing
 * an older meeting would leave both browsers waiting for somebody to reseal the
 * key for them.
 */
async function createOngoingMeeting() {
  const call = async (path, options = {}) => {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(`${path} -> ${response.status} ${JSON.stringify(body)}`);
    }
    return body;
  };

  const faculty = await call('/auth/login-faculty', {
    method: 'POST',
    body: JSON.stringify(FACULTY),
  });
  const student = await call('/auth/login-student', {
    method: 'POST',
    body: JSON.stringify(STUDENT),
  });

  const created = await call('/api/meetings/create', {
    method: 'POST',
    headers: { authorization: `Bearer ${faculty.accessToken}` },
    body: JSON.stringify({
      student_id: STUDENT.registration_no,
      reason: 'Verification run',
    }),
  });

  for (const token of [faculty.accessToken, student.accessToken]) {
    await call(`/api/meetings/${created.meetingId}/ready`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ ready: true }),
    });
  }
  await call(`/api/meetings/${created.meetingId}/start`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${faculty.accessToken}` },
    body: JSON.stringify({}),
  });

  return { meeting_id: created.meetingId, status: 'ongoing' };
}

async function joinCall(page, path) {
  await page.goto(`${APP}${path}`);
  await page
    .getByRole('button', { name: /join securely/i })
    .waitFor({ timeout: 45000 });
  await page.getByRole('button', { name: /join securely/i }).click();
  await page.getByText('Connected', { exact: false }).first().waitFor({ timeout: 45000 });
}

/** Playback advancing on a remote tile proves encrypted frames arrive and decode. */
async function remoteVideoAdvances(page) {
  return page.evaluate(async () => {
    const deadline = Date.now() + 30000;
    let last = null;
    while (Date.now() < deadline) {
      const remote = document.querySelector('.mc-tile video[data-local="false"]');
      if (remote && remote.videoWidth > 0 && remote.currentTime > 0) {
        if (last !== null && remote.currentTime > last + 0.4) {
          return {
            width: remote.videoWidth,
            height: remote.videoHeight,
            advanced: remote.currentTime - last,
          };
        }
        last = remote.currentTime;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return null;
  });
}

const meeting = await createOngoingMeeting();
console.log(`Using meeting ${meeting.meeting_id} (${meeting.status})\n`);

const student = await launch('a');
const faculty = await launch('b');

try {
  /* ------------------------------------------------------------- sign in */
  await student.page.goto(`${APP}/`);
  await student.page.locator('#regNo').fill(STUDENT.registration_no);
  await student.page.locator('#password').fill(STUDENT.password);
  await student.page
    .getByRole('button', { name: /access dashboard/i })
    .click();
  await student.page.waitForURL('**/dashboard', { timeout: 20000 });
  check('student signs in', true);

  await faculty.page.goto(`${APP}/faculty-login`);
  const loginForm = faculty.page.locator('form.auth-form').first();
  await loginForm.locator('input[type="email"]').fill(FACULTY.email);
  await loginForm.locator('input[type="password"]').fill(FACULTY.password);
  await loginForm.getByRole('button', { name: /sign in/i }).click();
  await faculty.page.waitForURL('**/dashboard-faculty', { timeout: 20000 });
  check('mentor signs in', true);

  /* ------------------------------------------------- join call from the UI */
  await student.page.goto(`${APP}/student-meetings`);
  const card = student.page
    .locator('.sm-card', { hasText: 'Verification run' })
    .first();
  const joinButton = card.getByRole('button', { name: /join call/i });
  await joinButton.waitFor({ timeout: 20000 });
  check('the live meeting card offers a "Join call" button', true);
  await joinButton.click();
  await student.page.waitForURL('**/call', { timeout: 20000 });

  await student.page
    .getByRole('button', { name: /join securely/i })
    .waitFor({ timeout: 45000 });
  check('student gets an encryption key before joining', true);
  await student.page.getByRole('button', { name: /join securely/i }).click();
  await student.page
    .getByText('Connected', { exact: false })
    .first()
    .waitFor({ timeout: 45000 });
  check('student connects to the encrypted call', true);

  await joinCall(faculty.page, `/faculty-meetings/${meeting.meeting_id}/call`);
  check('mentor connects to the same call', true);

  /* --------------------------------------------------------- media flows */
  const secureBadge = await student.page.locator('.mc-secure').first().innerText();
  check(
    'the call reports end-to-end encryption',
    /end-to-end encrypted/i.test(secureBadge),
    secureBadge.split('\n')[0]
  );

  const studentRemote = await remoteVideoAdvances(student.page);
  check(
    'student decodes the mentor video',
    studentRemote !== null,
    studentRemote
      ? `${studentRemote.width}x${studentRemote.height}, advanced ${studentRemote.advanced.toFixed(2)}s`
      : 'no frames'
  );

  const facultyRemote = await remoteVideoAdvances(faculty.page);
  check(
    'mentor decodes the student video',
    facultyRemote !== null,
    facultyRemote
      ? `${facultyRemote.width}x${facultyRemote.height}, advanced ${facultyRemote.advanced.toFixed(2)}s`
      : 'no frames'
  );

  /* ------------------------------------------------------------ controls */
  await student.page.getByRole('button', { name: 'Mute microphone' }).click();
  await student.page
    .getByRole('button', { name: 'Unmute microphone' })
    .waitFor({ timeout: 10000 });
  check('mute works', true);

  await student.page.getByRole('button', { name: 'Unmute microphone' }).click();
  await student.page
    .getByRole('button', { name: 'Mute microphone' })
    .waitFor({ timeout: 10000 });
  check('unmute works', true);

  await student.page.getByRole('button', { name: 'Turn camera off' }).click();
  await student.page
    .getByRole('button', { name: 'Turn camera on' })
    .waitFor({ timeout: 10000 });
  check('camera can be switched off', true);
  await student.page.getByRole('button', { name: 'Turn camera on' }).click();
  await student.page
    .getByRole('button', { name: 'Turn camera off' })
    .waitFor({ timeout: 10000 });
  check('camera can be switched back on', true);

  /* ------------------------------------------------------- key rotation */
  const rotate = faculty.page.getByRole('button', {
    name: /rotate the meeting encryption key/i,
  });
  if (await rotate.isVisible()) {
    await rotate.click();
    await faculty.page.waitForTimeout(5000);
    const stillDecoding = await remoteVideoAdvances(faculty.page);
    check('media survives a key rotation by the mentor', stillDecoding !== null);
  }

  /* ------------------------------------------------------------- leaving */
  await student.page.getByRole('button', { name: 'Leave the call' }).click();
  await student.page.waitForURL('**/student-meetings', { timeout: 20000 });
  check('student leaves and returns to the meetings page', true);

  const tiles = await faculty.page.evaluate(async () => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const count = document.querySelectorAll('.mc-tile:not(.empty)').length;
      if (count === 1) return count;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return document.querySelectorAll('.mc-tile:not(.empty)').length;
  });
  check('mentor sees the participant leave', tiles === 1, `tiles=${tiles}`);
} finally {
  await student.browser.close();
  await faculty.browser.close();
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) process.exitCode = 1;
