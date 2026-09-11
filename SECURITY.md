# Security — video meetings

How the mentoring call is protected, what the infrastructure can and cannot
see, and where the limits are. Claims here are stated precisely; see
[Verification](#verification) for how each was checked.

---

## 1. Two layers of encryption

### Transport

| Channel                     | Protection          |
| --------------------------- | ------------------- |
| Browser ↔ API               | HTTPS in production |
| Browser ↔ LiveKit signaling | WSS in production   |
| Browser ↔ LiveKit media     | DTLS-SRTP, always   |

Transport security protects each hop, and each hop terminates it. That is why
it is not enough on its own: the SFU terminates DTLS-SRTP and would otherwise
see plaintext media.

### End-to-end

LiveKit's E2EE encrypts every media frame **in a Web Worker on the sending
device** and decrypts it only on the other participant's device.

| Content                        | E2EE                                                   |
| ------------------------------ | ------------------------------------------------------ |
| Microphone audio               | Yes                                                    |
| Camera video                   | Yes                                                    |
| Screen share                   | Yes (same publish pipeline)                            |
| Data messages                  | Yes — the room is created with the `encryption` option |
| Signaling metadata, REST calls | **No** — TLS only                                      |

The room is created with `new Room({ encryption: { keyProvider, worker } })`,
`setE2EEEnabled(true)` runs **before** connecting, and encryption is verified
again after connecting; if it is not active the client disconnects
(`packages/frontend/src/hooks/useMeetingCall.ts`).

---

## 2. Key management

**Device identity keys.** Each browser generates an ECDH P-256 key pair with
Web Crypto. The private key is **non-extractable** and stored in IndexedDB, so
it cannot be read by application code, uploaded or copied. Only the public half
is registered with the backend (`e2ee_device_keys`).

**Room keys.** The first participant to open the call generates a random
256-bit key with `crypto.getRandomValues`. That key is what LiveKit uses to
encrypt frames.

**Distribution.** The room key is never sent to the server in the clear. For
each recipient the sender performs ECIES:

```text
ephemeral ECDH P-256 key pair
        ↓ ECDH with the recipient's registered public key
   shared secret
        ↓ HKDF-SHA256 (random 32-byte salt, context info)
   AES-256-GCM wrapping key
        ↓ encrypt(room key), AAD = context
   envelope { ephemeral_public_key, salt, iv, ciphertext }
```

The context bound into the KDF and the AEAD is
`"pbl3-meeting-room-key-v1 | meeting_id | key_version | recipient_public_key |
ephemeral_public_key"`, so an envelope cannot be replayed against another
meeting, generation or recipient. The backend stores those envelopes
(`e2ee_key_envelopes`) and relays them; it holds no private key.

**Requesting access.** A participant with no envelope for the current
generation posts a key request; the participant that holds the key seals it for
them. Only ciphertext moves through the server.

**Rotation and revocation.** The mentor can rotate the key: a new generation is
sealed for both participants and published as `key_version + 1`. The server
rejects a rotation that omits a participant who has a device key, deletes the
superseded generation, and each generation occupies its own LiveKit keyring
slot so frames in flight still decrypt. Registering a new device key
invalidates envelopes sealed to the old one, and the token endpoint then
refuses to issue a token until the new device is sealed for.

**Never done with keys.** They are not hard-coded, not placed in `.env`, not
put in a URL or room link, not written to `localStorage`/`sessionStorage`, not
logged, and not included in error messages.

---

## 3. What each party can see

| Party                | Meeting media               | Metadata                                                      |
| -------------------- | --------------------------- | ------------------------------------------------------------- |
| Student              | **Yes**                     | Yes                                                           |
| Mentor               | **Yes**                     | Yes                                                           |
| Backend API          | **No**                      | Yes — who met whom, when, reason, status, marks               |
| LiveKit SFU          | **No**                      | Yes — room name, participant identities, timing, packet sizes |
| MySQL database       | **No** (no media is stored) | The metadata above plus ciphertext envelopes                  |
| Reverse proxy / host | **No**                      | TLS-protected connection metadata                             |

Accurate terminology:

- WebRTC media is always encrypted in transit with DTLS-SRTP.
- **SFU-routed media is normally readable by the SFU** — that is exactly what
  the E2EE layer removes here.
- Signaling and REST traffic are protected by **TLS, not E2EE**.

---

## 4. Authentication, authorisation, encryption

| Question                    | Mechanism                                                                                      |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| Who are you?                | The portal's existing JWT access token (in memory) plus refresh cookie; bcrypt password hashes |
| May you join this call?     | The meeting's `student_id` / `faculty_email` are checked server-side on every room route       |
| Can anyone else decrypt it? | Per-meeting room key sealed to each participant's device key                                   |

The path into a call:

```text
sign in → participant of the meeting → meeting is `ongoing`
        → a usable key envelope exists → short-lived LiveKit token (300s)
        → E2EE enabled → connect
```

Additional controls:

- The LiveKit room name is generated by the server (`meeting_<id>_<uuid>_<random>`)
  and never accepted from the client, so a meeting id cannot be turned into a
  joinable room.
- The LiveKit identity is always the authenticated user; the display name comes
  from the database, not the request.
- Grants are minimal: `roomJoin`, `canPublish`, `canSubscribe`,
  `canPublishData` — no `roomCreate`, no `roomAdmin`.
- All key material is validated (base64, length, recipient) before storage.

---

## 5. Fail-closed policy

| Situation                             | Behaviour                                                |
| ------------------------------------- | -------------------------------------------------------- |
| Browser cannot do E2EE (e.g. Firefox) | Join button disabled, reason shown                       |
| Page is not a secure context          | Blocked with an explanation                              |
| No key envelope for this browser      | UI waits; the **server** also refuses a token (`409`)    |
| Key sealed to a previous device       | `409`, join blocked                                      |
| Encryption not active after connect   | The client disconnects rather than continue in the clear |
| Remote frames cannot be decrypted     | Dropped, never rendered; the UI says so                  |

---

## 6. Data minimisation

Stored: meeting metadata the portal already kept (participants, reason, status,
readiness, marks, skills), the generated room name, the key generation number,
**public** device keys and sealed envelopes.

Not stored and not implemented: audio, video, screen recordings, transcripts or
any encryption key. There is deliberately **no recording and no server-side
media pipeline** — a recorder would need decryption capability and would break
the guarantee above. Meeting media is never sent to any AI, transcription or
analytics service.

---

## 7. Threat model

**Protected against**

- A curious or compromised LiveKit SFU reading meeting content.
- A curious or compromised backend reading meeting content (no private keys, no media).
- Database compromise: it holds ciphertext envelopes only.
- Network eavesdropping, including at the host or reverse proxy.
- Unauthorised joins: no anonymous access, unguessable room names, no
  client-chosen identity, tokens expire in minutes.

**Not protected against**

- A compromised participant device — it holds the keys by design.
- A participant recording their own screen.
- Stolen portal credentials.
- Metadata analysis: who met whom, when, for how long.
- **Key substitution by the backend.** Public keys are distributed through the
  backend, so a malicious backend could hand out a key it controls. This is
  mitigated, not eliminated, by showing each device fingerprint in the call
  lobby for out-of-band comparison. Pinning fingerprints per user would close it.

---

## 8. Verification

| Claim                                           | Evidence                                                                                                                                                                            |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A student and mentor can hold an encrypted call | `e2e/meeting-call.mjs` — two Chromium browsers against a real LiveKit server; each decodes the other's video (640×480, playback advancing)                                          |
| The infrastructure cannot read the media        | `e2e/encryption-proof.mjs` — a client holding the **LiveKit API key and secret** joins, receives ~382 KB / 242 video frames and decodes **0** (`framesDecoded=0`, rendered width 0) |
| Joining fails closed without a key              | The token endpoint returns `409` (`E2EE_KEY_UNAVAILABLE` / `E2EE_STALE_DEVICE_KEY`); the join button stays disabled                                                                 |
| Unauthorised users get nothing                  | Room routes return `401` unauthenticated and `403` for a non-participant                                                                                                            |
| Reconnection is handled                         | `e2e/encryption-proof.mjs` drops the network and observes the reconnecting state and recovery                                                                                       |

Not verified, and not claimed: behaviour across NAT and firewalls on real
networks (mobile data, campus wifi), which needs devices on separate networks
and a TURN-capable deployment.

---

## 9. Reporting

Please report security problems privately to the maintainers rather than in a
public issue, with steps to reproduce.
