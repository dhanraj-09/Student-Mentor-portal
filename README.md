# Student-Mentor Portal

A full-stack mentorship platform connecting students with faculty for project-based learning,
including **end-to-end encrypted video meetings** between a student and their mentor.

## Project Structure

```
packages/
├── frontend/     # React + TypeScript frontend
├── backend/      # Express + TypeScript backend
└── shared/       # Shared types and utilities
infra/mysql/      # Local database: schema, migrations, dev seed
e2e/              # Two-browser verification of the video call (opt-in)
scripts/          # Local LiveKit dev server helper
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+
- Docker (only for the local database; production uses MySQL on Aiven)
- A Chromium-based browser or Safari 15.4+ for the video call. Firefox lacks the
  encoded-transform API that end-to-end encrypted media needs.

### Installation

```bash
npm install
```

This installs dependencies for all packages (monorepo setup).

Background blur needs the MediaPipe segmentation runtime staged into the
frontend's `public/` directory:

```bash
npm run assets:mediapipe
```

The library would otherwise fetch that runtime from a CDN mid-call, making a
feature depend on a third party being reachable from every participant's
browser. The staged copy is git-ignored (it is ~19MB of WebAssembly), so rerun
this after a fresh `npm install`. Skipping it only disables blur.

### Environment

```bash
cp packages/backend/.env.example packages/backend/.env
cp packages/frontend/.env.example packages/frontend/.env
```

Fill in `JWT_SECRET`, `REFRESH_SECRET` and the database block. For the video
call also set `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` (see
[Video meetings](#video-meetings)).

### Database

Production uses MySQL hosted on Aiven over TLS (`ca.pem` at the backend package
root, or `DB_SSL_CA_PEM`). For local work a container with the same schema is
provided:

```bash
npm run db:up      # MySQL on localhost:3307, schema applied automatically
npm run seed       # a mentor, an assigned student, and meetings to try
npm run db:down    # stop it again
```

Point `packages/backend/.env` at it:

```bash
DB_HOST=127.0.0.1
DB_PORT=3307
DB_USER=portal
DB_PASSWORD=portal
DB_NAME=student_mentor
DB_SSL=false      # the local container does not terminate TLS
```

`infra/mysql/schema.sql` is the full local schema; `infra/mysql/migrations/`
holds the incremental scripts to run against an existing database (Aiven
included).

### Development

Run both frontend and backend:

```bash
npm run dev
```

Or run individually:

```bash
npm run dev -w frontend   # Frontend only
npm run dev -w backend    # Backend only
```

### Build

```bash
npm run build -w frontend
npm run build -w backend
```

---

## First login (password not set)

Students are provisioned by the college without a password. The first time one
tries to sign in, the portal detects that and walks them through setting one.

```text
1. Login attempt        registration number + any password
        ↓
2. Password Not Set     the account exists but has no password
        ↓
3. Choose a method      Outlook email link  |  Microsoft Authenticator
        ↓                      ↓                        ↓
4-6.                    link emailed,            QR code scanned,
                        opened from Outlook      6-digit code verified
        ↓                      ↓                        ↓
7. Set New Password     both paths end at the same screen (rules checked live)
        ↓
8. Success  →  9. Login again  →  10. Dashboard (JWT access token)
                                       ↓
                                 11-12. access token expires, the refresh
                                        cookie mints a new one silently
```

Routes: `/set-password`, `/set-password/authenticator`, `/set-password/new`.

### How it is protected

- The reset link carries a 32-byte random token. Only its **SHA-256 hash** is
  stored, so a database leak cannot be turned back into a working link.
- Tokens are **single use** and expire (30 minutes for the email link, 15 for
  one issued after an authenticator code). Requesting a new one retires the old.
- Both paths converge on one write: a valid token authorises exactly one
  password change.
- The password rules the screen shows are the rules the server enforces - both
  call `checkPasswordRules` from `packages/shared`.
- Requesting a link always answers the same way, so the endpoint cannot be used
  to discover which registration numbers exist. Login is the one deliberate
  exception: it has to say "password not set" for the flow to start, and it sits
  behind the same login rate limit as any other attempt.

### Configuration

| Variable                                                                           | Purpose                                                                                  |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `APP_BASE_URL`                                                                     | Frontend origin the emailed link points at                                               |
| `STUDENT_EMAIL_DOMAIN`                                                             | Used when a student row has no `email`; the address becomes `<registration_no>@<domain>` |
| `PASSWORD_SETUP_EMAIL_TTL_MINUTES` / `PASSWORD_SETUP_TOTP_TTL_MINUTES`             | Token lifetimes (30 / 15)                                                                |
| `TOTP_ISSUER`                                                                      | Label shown in Microsoft Authenticator                                                   |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Outgoing mail                                                                            |

**Without SMTP configured the reset link is written to the server log instead of
being sent.** That keeps local development working with no mail account, and is
refused outright when `NODE_ENV=production`.

### Database

```bash
mysql -h <host> -u <user> -p <database> < infra/mysql/migrations/002_first_login_password_setup.sql
```

It makes `student.password_hash` nullable, adds `student.email`, and creates
`password_setup_tokens` and `student_totp`.

### Trying it locally

`npm run seed` provisions `229301777` with no password. Sign in with that
registration number and any password to enter the flow. With no SMTP set up,
copy the link from the backend log.

---

## Video meetings

A meeting moves through `pending → accepted → ongoing → completed`. Once the
mentor starts it (`ongoing`), both sides get a **Join call** button on their
meetings page, which opens an end-to-end encrypted video call.

```
Student meetings ──┐
                   ├─► /student-meetings/:id/call
Faculty meetings ──┘   /faculty-meetings/:id/call
```

### How it fits together

```text
   Student browser                              Mentor browser
 ┌────────────────────┐                     ┌────────────────────┐
 │ camera / mic       │                     │ camera / mic       │
 │        ↓           │                     │        ↑           │
 │ E2EE worker        │   encrypted media   │ E2EE worker        │
 └─────────┬──────────┘                     └─────────▲──────────┘
           │                                          │
           ▼            ┌────────────────┐            │
                        │  LiveKit SFU   │
                        │ routes packets,│
                        │ cannot decrypt │
                        └────────────────┘

  HTTPS control plane (no media, no keys)
 ┌────────────────────────────────────────────────────────────┐
 │ Express backend          │ MySQL                           │
 │  • JWT authentication    │  • meetings, room name, key ver │
 │  • participant check     │  • public device keys           │
 │  • short-lived LK tokens │  • sealed key envelopes only    │
 └────────────────────────────────────────────────────────────┘
```

The backend authenticates the participant, checks they belong to the meeting,
and mints a short-lived LiveKit token. The encryption key is created in the
browser and sealed to the other participant's public key, so the server relays
ciphertext it cannot open. See [SECURITY.md](./SECURITY.md).

### LiveKit setup

**Local development**

```bash
npm run livekit     # downloads the LiveKit binary once, runs it in dev mode
```

Dev mode listens on `ws://localhost:7880` with API key `devkey` and secret
`secret` — localhost only.

**LiveKit Cloud (recommended for deployments)**

1. Create a project at <https://cloud.livekit.io>.
2. `LIVEKIT_URL=wss://<project>.livekit.cloud`
3. Copy the API key and secret into `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`.

TURN, TLS and global routing come with LiveKit Cloud, so nothing else is
required. Self-hosting instead means opening 7880/tcp (behind TLS), 7881/tcp as
the fallback when UDP is blocked, and the configured UDP range, plus enabling
LiveKit's TURN server for participants behind strict firewalls.

`LIVEKIT_API_SECRET` never leaves the backend: the browser only receives the
signed join token, scoped to one room and valid for minutes.

### Database changes

The feature adds `room_name` and `e2ee_key_version` to `meetings`, plus
`e2ee_device_keys`, `e2ee_key_envelopes` and `e2ee_key_requests`. Apply them to
an existing database with:

```bash
mysql -h <host> -u <user> -p <database> < infra/mysql/migrations/001_video_meetings.sql
```

### API

| Method | Path                                      | Purpose                                                         |
| ------ | ----------------------------------------- | --------------------------------------------------------------- |
| `POST` | `/api/meetings/e2ee/device-key`           | Register this browser's public key                              |
| `GET`  | `/api/meetings/e2ee/device-key`           | Read the registered public key                                  |
| `GET`  | `/api/meetings/:id/room/participant-keys` | Public keys of both participants                                |
| `GET`  | `/api/meetings/:id/room/keys`             | Key generation, this device's sealed envelope, pending requests |
| `POST` | `/api/meetings/:id/room/keys`             | Publish sealed envelopes (first key, fulfilment, rotation)      |
| `POST` | `/api/meetings/:id/room/key-requests`     | Ask the other participant to seal the key                       |
| `POST` | `/api/meetings/:id/room/token`            | Short-lived LiveKit token (requires a usable key)               |

### Verification

`e2e/` contains two Playwright scripts that drive real browsers against a
running stack: the full call between a student and a mentor, and a proof that an
operator holding the LiveKit credentials cannot decode the media. See
[e2e/README.md](./e2e/README.md).

### Troubleshooting

| Symptom                              | Cause                                                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| "Waiting for the encryption key"     | The other participant must open the call once so their browser can seal the key for yours. Every new browser profile has a new device key. |
| "This browser cannot join securely"  | Firefox, or a non-secure origin. Use Chrome/Edge/Safari over HTTPS (or `localhost`).                                                       |
| "The video service is not available" | `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` are missing on the backend.                                                       |
| Call connects but no video           | Media path: check the LiveKit UDP range and that 7881/tcp is reachable.                                                                    |
| Camera or microphone denied          | Site permission in the address bar; the call can still be joined with them off.                                                            |

---

## Tech Stack

- **Frontend**: React 18, Vite, TypeScript, React Router, Axios, lucide-react, livekit-client
- **Backend**: Express, TypeScript, JWT, bcryptjs, CORS, mysql2, livekit-server-sdk
- **Shared**: Shared types and validation logic
- **Media**: LiveKit (SFU) with frame-level end-to-end encryption
