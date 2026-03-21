## ZweckOS

Production-ready internal web app for company management + double-entry accounting for **Zweck Co. Ltd (Kampala, Uganda)**.

### Key rule (single source of truth)

**All financial figures are derived from the `Transaction` table only.** No balances are stored anywhere.

### Tech

- **Client**: React + Vite + Tailwind + React Router + React Query + Axios
- **Server**: Node.js + Express (TypeScript) + Zod + JWT + bcrypt
- **DB**: PostgreSQL + Prisma

### Setup

1. Create env files.

- `server/.env`

```env
DATABASE_URL="postgresql://user:password@localhost:5432/zweckos"
JWT_SECRET="replace-this-with-a-strong-secret"
PORT=3001
```

- `client/.env`

```env
VITE_API_URL="http://localhost:3001/api"
```

2. Install dependencies (from repo root).

```bash
npm install
```

3. Create DB tables (from repo root).

```bash
npm run db:migrate
```

4. Start dev servers (from repo root).

```bash
npm run dev
```

- Client: `http://localhost:5173`
- API: `http://localhost:3001/api/health`

### First login (no seed data)

The database starts completely empty. To avoid seed data while still enabling first access:

- The **first call** to `POST /api/auth/register` is treated as a **bootstrap** and creates the first **ADMIN** user.
- After the first user exists, `POST /api/auth/register` is **ADMIN-only**.

The UI has a **“First Admin Setup”** tab on the login screen to do this.

### Prisma Studio

```bash
npm run db:studio
```

### Deploy (Neon + Render + Vercel)

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for hosting the database on **Neon**, the API on **Render**, and the client on **Vercel**.

Production DB migrations (after changing schema locally):

```bash
npm run db:deploy
```

