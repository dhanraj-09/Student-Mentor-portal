# Browser verification harness

Two Node scripts that drive real Chromium browsers against a running stack.
They are not part of `npm run lint`/`typecheck` because they need a live
backend, frontend, database and LiveKit server; Playwright is therefore not a
repository dependency either.

| Script                 | What it checks                                                                                                                                                                                                                                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `meeting-call.mjs`     | Student and mentor sign in, the ongoing meeting card offers "Join call", both obtain an encryption key, connect, and **each decodes the other's end-to-end encrypted video**; mute/unmute, camera off/on, mentor key rotation, leave, and the remaining participant seeing the other leave.                                        |
| `first-login.mjs`      | The whole "password not set" flow: detection at login, the method chooser, the emailed link, the Microsoft Authenticator QR and code (a wrong code is rejected first), the password rules, signing in with the new password, the httpOnly refresh cookie and the silent token refresh, and that a used or unknown link is refused. |
| `encryption-proof.mjs` | A client holding the **LiveKit API key and secret** (i.e. whoever runs the SFU) joins the room, receives the routed packets and decodes **zero** frames. Also drops the network to check the reconnecting state and recovery.                                                                                                      |

## Prerequisites

```bash
npm install
npm run db:up          # local MySQL on 3307 with the schema applied
npm run livekit        # LiveKit dev server on ws://localhost:7880
npm run seed           # demo mentor + student and an ongoing meeting
npm run dev            # frontend :5173, backend :8080

npm i --no-save playwright
npx playwright install chromium
```

`packages/backend/.env` needs the local database and LiveKit blocks:

```bash
DB_HOST=127.0.0.1
DB_PORT=3307
DB_USER=portal
DB_PASSWORD=portal
DB_NAME=student_mentor
DB_SSL=false
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
```

## Run

```bash
node e2e/meeting-call.mjs
node e2e/encryption-proof.mjs
node e2e/first-login.mjs
```

Each prints one `PASS`/`FAIL` line per check and exits non-zero on failure.

## Configuration

| Variable                                               | Default                                                                                                          |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `E2E_APP_URL`                                          | `http://localhost:5173`                                                                                          |
| `E2E_API_URL`                                          | `http://localhost:8080`                                                                                          |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | `ws://localhost:7880`, `devkey`, `secret` (the proof deliberately plays the part of the infrastructure operator) |
| `E2E_STUDENT_REG`, `E2E_STUDENT_PASSWORD`              | the seeded student                                                                                               |
| `E2E_FACULTY_EMAIL`, `E2E_FACULTY_PASSWORD`            | the seeded mentor                                                                                                |

## Why the camera is synthetic

`fakeMedia.mjs` replaces `navigator.mediaDevices.getUserMedia` with a canvas
video track and an oscillator audio track. Chromium's
`--use-fake-device-for-media-capture` switch is ignored by recent Playwright
builds, and a machine has only one physical webcam, so two browsers could not
otherwise capture at once. Everything below `getUserMedia` - encoding, E2EE
frame encryption, the SFU, decryption and rendering - is the real
implementation.

## Note on device keys

Every fresh browser profile generates a new encryption device key, which
invalidates the envelopes sealed to the previous one. `encryption-proof.mjs`
therefore creates its own meeting rather than reusing an existing one; in the
app, a participant joining from a new browser simply waits for the other
participant to reseal the key for them.
