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
