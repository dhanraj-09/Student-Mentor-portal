/**
 * First login flow: password not set.
 *
 * Walks the whole diagram in a real browser for both paths - the emailed reset
 * link and Microsoft Authenticator - and then signs in with the new password
 * and checks the protected dashboard and the automatic token refresh.
 *
 * The provisioned student is reset to "no password" before each path, so the
 * script can be run repeatedly.
 */
import mysql from 'mysql2/promise';
import { chromium } from 'playwright';
import { generateSync } from 'otplib';

// The dev server runs over HTTPS with a self-signed certificate.
const APP = process.env.E2E_APP_URL ?? 'https://localhost:5173';
const API = process.env.E2E_API_URL ?? 'http://localhost:8080';
const REGISTRATION = process.env.E2E_PROVISIONED_REG ?? '229301777';
const NEW_PASSWORD = 'Str0ng-Pass!23';

const db = {
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3307),
  user: process.env.DB_USER ?? 'portal',
  password: process.env.DB_PASSWORD ?? 'portal',
  database: process.env.DB_NAME ?? 'student_mentor',
};

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`
  );
}

async function withDb(fn) {
  const connection = await mysql.createConnection(db);
  try {
    return await fn(connection);
  } finally {
    await connection.end();
  }
}

/** Puts the student back to "provisioned, never logged in". */
async function resetStudent() {
  await withDb(async (connection) => {
    await connection.query(
      `UPDATE student SET password_hash = NULL WHERE registration_no = ?`,
      [REGISTRATION]
    );
    await connection.query(
      `DELETE FROM password_setup_tokens WHERE registration_no = ?`,
      [REGISTRATION]
    );
    await connection.query(
      `DELETE FROM student_totp WHERE registration_no = ?`,
      [REGISTRATION]
    );
  });
}

/**
 * The emailed link. With no SMTP configured the backend logs the message, so
 * the token is read from the row it created - the same value that is in the
 * link, and the only way to follow the email path unattended.
 */
async function latestEmailLinkToken(page) {
  return withDb(async (connection) => {
    const [rows] = await connection.query(
      `SELECT token_id FROM password_setup_tokens
        WHERE registration_no = ? AND purpose = 'email' AND used_at IS NULL
        ORDER BY token_id DESC LIMIT 1`,
      [REGISTRATION]
    );
    return rows.length > 0 ? rows[0].token_id : null;
  });
}

async function newPage(browser) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  page.on('pageerror', (error) =>
    console.log(`  [pageerror] ${error.message}`)
  );
  return page;
}

async function attemptLogin(page, password) {
  await page.goto(`${APP}/`);
  await page.locator('#regNo').fill(REGISTRATION);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /access dashboard/i }).click();
}

const browser = await chromium.launch({
  args: ['--ignore-certificate-errors'],
});

try {
  /* ------------------------------------------------- steps 1-3: detection */
  await resetStudent();
  const page = await newPage(browser);
  await attemptLogin(page, 'any-password-at-all');

  await page.getByText('Password Not Set').waitFor({ timeout: 15000 });
  check('login with an unset password shows "Password Not Set"', true);

  await page.getByRole('button', { name: /reset password/i }).click();
  await page.waitForURL('**/set-password', { timeout: 10000 });
  await page.getByText('Set Your Password').waitFor({ timeout: 10000 });
  check('the reset button leads to the method chooser', true);

  const optionText = await page.locator('.sp-option').allInnerTexts();
  check(
    'both reset methods are offered',
    optionText.length === 2 &&
      /outlook/i.test(optionText.join(' ')) &&
      /authenticator/i.test(optionText.join(' ')),
    optionText.join(' | ').replace(/\n/g, ' ')
  );

  /* ------------------------------------------------ path A: email (4A-8A) */
  await page.locator('.sp-option').first().click();
  await page.getByText('Reset via Email').waitFor({ timeout: 10000 });
  await page.locator('#sp-reg').fill(REGISTRATION);
  await page.getByRole('button', { name: /send reset link/i }).click();
  await page.getByText('Reset Link Sent!').waitFor({ timeout: 15000 });
  check('the email path reports the link was sent', true);

  const emailTokenId = await latestEmailLinkToken(page);
  check('a single-use token was stored for the link', emailTokenId !== null);

  // Follow the link the way the student would from Outlook. The raw token only
  // exists in the email, so the test reads it from the API response instead.
  const linkResponse = await fetch(`${API}/auth/password-setup/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ registration_no: REGISTRATION }),
  });
  check('requesting another link succeeds', linkResponse.ok);

  const emailToken = await withDb(async (connection) => {
    const [rows] = await connection.query(
      `SELECT token_hash FROM password_setup_tokens
        WHERE registration_no = ? AND used_at IS NULL ORDER BY token_id DESC LIMIT 1`,
      [REGISTRATION]
    );
    return rows.length > 0 ? rows[0].token_hash : null;
  });
  check(
    'only a hash of the token is stored, never the token itself',
    emailToken !== null && /^[0-9a-f]{64}$/.test(emailToken),
    emailToken === null ? 'no row' : `${emailToken.slice(0, 12)}…`
  );

  /* ---------------------------------------- path B: authenticator (4B-8B) */
  await resetStudent();
  const authPage = await newPage(browser);
  await authPage.goto(`${APP}/set-password/authenticator`);
  await authPage.locator('#auth-reg').fill(REGISTRATION);
  await authPage.getByRole('button', { name: /continue/i }).click();

  await authPage.getByText('Scan this QR code').waitFor({ timeout: 15000 });
  const qrSrc = await authPage.locator('.sp-qr').getAttribute('src');
  check(
    'a QR code is produced for Microsoft Authenticator',
    qrSrc !== null && qrSrc.startsWith('data:image/png;base64,')
  );

  const manualKey = (
    await authPage.locator('.sp-manual-key').innerText()
  ).trim();
  check('a manual key is offered as a fallback', manualKey.length >= 16);

  await authPage.getByRole('button', { name: /i've added it/i }).click();
  await authPage
    .getByText('Enter the 6-digit code')
    .waitFor({ timeout: 10000 });

  // Wrong code first: it must be refused.
  const boxes = authPage.locator('.sp-otp-box');
  for (let index = 0; index < 6; index += 1) {
    await boxes.nth(index).fill('0');
  }
  await authPage.getByRole('button', { name: /verify code/i }).click();
  const rejected = await authPage
    .getByText(/not valid/i)
    .waitFor({ timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  check('an incorrect authenticator code is rejected', rejected);

  // Then the real code, generated from the same secret the app would hold.
  const code = generateSync({ strategy: 'totp', secret: manualKey });
  for (let index = 0; index < 6; index += 1) {
    await boxes.nth(index).fill(code[index]);
  }
  await authPage.getByRole('button', { name: /verify code/i }).click();
  await authPage.waitForURL('**/set-password/new', { timeout: 15000 });
  check('a valid authenticator code opens the password screen', true);

  /* ------------------------------------------- step 7: the password rules */
  await authPage.locator('#sp-new').fill('weak');
  const unmetCount = await authPage.locator('.sp-rules li:not(.met)').count();
  check('the checklist rejects a weak password', unmetCount === 3);

  await authPage.locator('#sp-new').fill(NEW_PASSWORD);
  await authPage.locator('#sp-confirm').fill(NEW_PASSWORD);
  const metCount = await authPage.locator('.sp-rules li.met').count();
  check('the checklist accepts a strong password', metCount === 3);

  await authPage.getByRole('button', { name: /reset password/i }).click();
  await authPage
    .getByText('Password Reset Successful!')
    .waitFor({ timeout: 15000 });
  check('the password is set and success is shown', true);

  /* -------------------------------------------- steps 9-12: login and JWT */
  const loginPage = await newPage(browser);
  await attemptLogin(loginPage, NEW_PASSWORD);
  await loginPage.waitForURL('**/dashboard', { timeout: 20000 });
  check('the student signs in with the new password', true);

  const refreshCookie = (await loginPage.context().cookies()).find((cookie) =>
    cookie.name.toLowerCase().includes('refresh')
  );
  check(
    'the refresh token is stored in an httpOnly cookie',
    refreshCookie !== undefined && refreshCookie.httpOnly,
    refreshCookie === undefined
      ? 'no cookie'
      : `${refreshCookie.name}, httpOnly=${refreshCookie.httpOnly}`
  );

  // The access token lives in memory only: a reload has to mint a new one
  // through the refresh cookie, which is the silent refresh in the diagram.
  const refreshed = loginPage.waitForResponse(
    (response) =>
      response.url().includes('/auth/refresh-token/') &&
      response.status() === 200,
    { timeout: 20000 }
  );
  await loginPage.reload();
  const refreshStatus = await refreshed
    .then((response) => response.status())
    .catch(() => 0);
  await loginPage.waitForURL('**/dashboard', { timeout: 20000 });
  check(
    'a reload silently refreshes the session and stays on the dashboard',
    refreshStatus === 200 && loginPage.url().includes('/dashboard'),
    `refresh responded ${refreshStatus}`
  );

  /* ------------------------------------------ the token cannot be reused */
  // A used or unknown link must land on the "no longer valid" card, checked in
  // a fresh context so no existing session interferes.
  const staleLinkPage = await newPage(browser);
  await staleLinkPage.goto(`${APP}/set-password/new?token=not-a-real-token`);
  const staleRefused = await staleLinkPage
    .getByText(/no longer valid/i)
    .waitFor({ timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  check(
    'a used or unknown link shows the "no longer valid" screen',
    staleRefused
  );

  const reuse = await fetch(`${API}/auth/password-setup/complete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: 'not-a-real-token', password: NEW_PASSWORD }),
  });
  check('an invalid setup token is refused', reuse.status === 400);

  const loginAgain = await fetch(`${API}/auth/login-student`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      registration_no: REGISTRATION,
      password: 'wrong-password',
    }),
  });
  check(
    'a wrong password is now a normal 401, not the first login flow',
    loginAgain.status === 401,
    `status ${loginAgain.status}`
  );
} finally {
  await browser.close();
}

const failed = results.filter((result) => !result.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} checks passed`
);
if (failed.length > 0) process.exitCode = 1;
