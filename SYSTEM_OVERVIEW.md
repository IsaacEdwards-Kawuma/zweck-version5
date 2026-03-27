# SYSTEM OVERVIEW

This document gives a practical, high-level view of the Zweck system: what it is built with, how modules fit together, where data lives, and where to edit when making changes.

## 1) What This System Is

Zweck is a full-stack business and accounting platform with:

- Accounting and general ledger posting/reversal
- Director capital/equity tracking
- Projects and tasks
- Reports and exports
- Meetings and document register
- Chat and notifications
- Role-based authentication and admin controls

## 2) Technology Stack

### Frontend

- React (JavaScript/JSX)
- Vite
- React Router
- TanStack Query (React Query)
- Axios
- Tailwind CSS
- Socket.IO client

### Backend

- Node.js + Express (TypeScript)
- Prisma ORM
- PostgreSQL
- Zod validation
- JWT auth + bcrypt password hashing
- Socket.IO server (chat realtime)
- multer (uploads)

### Platform / Tooling

- NPM workspaces monorepo (`client`, `server`)
- Prisma migrations
- OpenAPI JSON docs
- Sentry integration
- CI workflow

## 3) Repo Structure (High Level)

- `client/` - frontend SPA
- `server/` - backend API and business logic
- `server/prisma/` - database schema and migrations
- root scripts - orchestrate build/lint/test/dev for both apps

## 4) Architecture Map

```text
┌──────────────────────────────────────────────┐
│                  Frontend (client)           │
│ React + Vite + Router + React Query + Axios │
└──────────────────────┬───────────────────────┘
                       │ HTTPS /api + JWT
                       ▼
┌──────────────────────────────────────────────┐
│               Backend (server)               │
│ Express + TypeScript + Zod + Prisma          │
│ Routes: auth, transactions, accounts,        │
│ directors, projects, reports, chat, etc.     │
└───────────────┬───────────────────┬──────────┘
                │                   │
                │ Prisma            │ Socket.IO
                ▼                   ▼
┌──────────────────────────┐   ┌──────────────────────┐
│   PostgreSQL Database    │   │ Realtime Chat Events │
│ users, tx, projects, ... │   │ + room interactions  │
└──────────────────────────┘   └──────────────────────┘
```

## 5) Data Storage and Core Models

Data is stored in PostgreSQL via Prisma. Core models include:

- Auth and identity: `User`, `PasswordResetToken`, `LoginEvent`
- Accounting: `Transaction`, `ReferenceSequence`
- People: `Director`
- Projects: `Project`, `ProjectTask`
- Collaboration: `ChatRoom`, `ChatMessage`, `ChatRoomMember`, `Notification`
- Governance/admin: `Meeting`, `DocumentRegister`, `AuditLog`, `AppSettings`

Key accounting fields in `Transaction`:

- `referenceNumber`
- `postingStatus` (`POSTED`, `REVERSED`, `PENDING`)
- `reversalOfId` (link to original/reversal relationship)
- `documentStatus`
- `createdBy` and `createdAt`

## 6) Authentication and Authorization

- Login returns JWT token.
- Frontend stores token and sends it on API calls.
- Backend middleware verifies token and loads user context.
- Role guards protect routes (`ADMIN`, `USER`, `DIRECTOR`) and self-service paths.

Design intent:

- Identity and permissions are enforced server-side.
- Sensitive operations are never trusted from frontend-only checks.

## 7) Frontend Data Flow

Pattern used throughout frontend:

1. `src/api/*` defines request functions.
2. `src/hooks/*` wraps these with React Query.
3. `src/pages/*` consumes hook data and renders UI.
4. Mutations invalidate related queries to refresh views.

This keeps server state centralized and consistent across pages.

## 8) Backend API Pattern

- Route modules grouped by domain in `server/src/routes/*`
- Request body validation with Zod
- Shared error response shape
- Audit logs for important accounting/admin actions

## 9) Accounting Safety Rules

For ledger-grade auditability:

- Prefer reversing posted transactions over deletion.
- Keep original and reversal entries visible.
- Stamp creator/poster from authenticated user context.
- Keep document and posting statuses explicit.
- Keep account-level balance derivation on server logic.

## 10) File Upload / Document Handling

- Transaction docs: upload endpoint and URL stored on transaction row.
- Director avatars: upload and storage path abstraction.
- Document register: metadata/index of governance documents.

## 11) Where To Edit What

### Ledger and Posting

- `client/src/pages/Ledger.jsx`
- `client/src/pages/PostTransaction.jsx`
- `server/src/routes/transactions.ts`
- `server/src/lib/derive.ts`
- `server/src/lib/constants.ts`

### Dashboard and Balances

- `client/src/pages/Dashboard.jsx`
- `client/src/hooks/useDashboard.js`
- `server/src/routes/accounts.ts`

### Reports

- `client/src/pages/Reports.jsx`
- `client/src/lib/reportsAnalytics.js`
- `server/src/routes/reports.ts`

### Auth and Access Control

- `server/src/routes/auth.ts`
- `server/src/middleware/auth.ts`
- `client/src/components/Protected.jsx`
- `client/src/api/client.js`

### Notifications and Chat

- `client/src/components/NotificationBell.jsx`
- `server/src/routes/notifications.ts`
- `client/src/pages/Chat.jsx`
- `client/src/pages/ChatRoom.jsx`
- `server/src/routes/chat.ts`
- `server/src/socket/chatSocket.ts`
- `client/src/lib/chatE2ee.js` (DM text + DM attachment E2EE: Web Crypto ECDH + HKDF + AES-GCM)
- `server/src/lib/chatE2ee.ts` (ciphertext prefix detection; server never decrypts)

### Schema / Migration

- `server/prisma/schema.prisma`
- `server/prisma/migrations/*`

## 12) Chat: DM end-to-end encryption (E2EE)

**Scope today:** **Direct message (DM) text and DM attachments.** Group, meeting, and project rooms use the same transport (TLS) but message bodies and attachment bytes are processed as plaintext on the server. In DMs, message bodies use the same AES key as text; image/file bytes are encrypted in the browser before upload and stored as ciphertext (attachment kinds `IMAGE_E2EE` / `FILE_E2EE`); the server sees names and sizes but not plaintext file content. Upload URLs remain under the public static path; confidentiality relies on encryption at rest in the stored file.

**Cryptography (client):**

- Per-user **ECDH P-256** key pair; **only the public JWK** is stored on the user row (`User.chatPublicKeyJwk`).
- Private keys stay in the browser (`localStorage` under `zweck_chat_ecdh_jwk_${userId}`).
- Per-DM-room symmetric key: **ECDH shared secret → HKDF → AES-256-GCM**.
- Message bodies are stored in Postgres as ciphertext strings prefixed with `E2EE:v1:`.
- DM attachments: **AES-GCM** over file bytes (IV + ciphertext); same DM key as message text.

**API (under `/api/chat`):**

- `GET /me/crypto`, `PUT /me/crypto` — register the caller’s public key.
- `GET /users/:userId/public-key` — fetch a user’s public key only if a DM room exists between the caller and that user.

**Server behavior for ciphertext:**

- No mention parsing, no link-preview fetch, and in-app notification preview uses a generic “encrypted” label for DM E2EE messages (and “encrypted attachment” when applicable).
- Forwarding E2EE messages (including those with E2EE attachments) is blocked.

**Key backup:** The chat UI can **export** or **import** a JSON backup of the local ECDH key material for the logged-in user (for moving browsers or recovery). Treat backup files like passwords.

### Recommended next steps (priority order)

1. **Authenticated attachment download** — Serve chat uploads only to room members (URLs alone would not suffice); complements E2EE ciphertext on disk.
2. **Group / room E2EE** — Requires group key agreement (e.g. sender keys or MLS-style design); significantly more complex than DM pairwise ECDH.
3. **Password-protected backup** — Encrypt the JSON backup with a user passphrase before download (reduces risk if the file leaks).
4. **Multi-device sync without manual backup** — Optional encrypted key escrow or device-to-device verify flow (high effort; careful threat modeling).

## 13) Recommended Change Workflow

1. Update UI/API caller in client.
2. Update backend route/service logic.
3. If needed, update Prisma schema + migration.
4. Run lint/build.
5. Verify critical business flow manually.
6. Commit with a clear message explaining why the change exists.

## 14) Deployment Shape

Current repo is set up for a split deployment style:

- Frontend hosted separately
- Backend API hosted separately
- PostgreSQL managed externally

Local dev runs both apps via workspace scripts.

