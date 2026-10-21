# LibraCore architecture

## Services

```mermaid
flowchart LR
    user(["Browser<br/>staff and borrowers"])
    pgadmin(["pgAdmin / psql<br/>this machine only"])

    subgraph host["Docker host"]
        subgraph net["Compose network: libracore_default"]
            web["<b>web</b><br/>Nginx + React build<br/>:80"]
            api["<b>api</b><br/>Node.js 20 + Express 5<br/>:3000"]
            db[("<b>db</b><br/>PostgreSQL 16<br/>:5432")]
        end
        vol[("volume<br/>db_data")]
    end

    user -- "http://localhost:8080" --> web
    web -- "/api/* → http://api:3000<br/>(Compose DNS)" --> api
    api -- "pg pool, parameterized SQL" --> db
    db --- vol
    pgadmin -- "127.0.0.1:5433" --> db
```

| Service | Image | Published port | Health check |
|---|---|---|---|
| `web` | `libracore-web` (multi-stage: Node build → `nginx:1.27-alpine`) | `8080 → 80` | `wget http://127.0.0.1/` |
| `api` | `libracore-api` (`node:20-alpine`, runs as `node` user) | none | `wget http://127.0.0.1:3000/api/health` (checks DB) |
| `db` | `postgres:16-alpine` | `127.0.0.1:5433 → 5432` (localhost only, for pgAdmin) | `pg_isready` |

Start-up order is enforced with `depends_on: condition: service_healthy`:
`db` healthy → `api` starts (and bootstraps the first admin) → `api` healthy → `web` starts.

## Request flow

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant N as web (Nginx)
    participant A as api (Express)
    participant P as db (PostgreSQL)

    B->>N: POST /api/auth/login {email, password}
    N->>A: proxy to api:3000
    A->>P: SELECT user by email
    A->>A: bcrypt.compare(password, hash)
    A-->>B: 200 + Set-Cookie libracore_token (HttpOnly, SameSite=Lax)

    B->>N: POST /api/loans (cookie sent automatically)
    N->>A: proxy
    A->>A: verify JWT, reload user, check role, validate input
    A->>P: BEGIN, then SELECT books FOR UPDATE
    A->>P: INSERT loan and items, UPDATE available_copies
    A->>P: COMMIT
    A-->>B: 201 loan
```

1. The browser loads the React app from Nginx.
2. The app calls `/api/...` on the same origin, so the `HttpOnly` session cookie is sent automatically.
3. Nginx forwards `/api/` to the `api` service by its Compose service name.
4. Express authenticates the cookie (JWT, HS256), reloads the user from the database, checks the role, validates input and runs parameterized SQL.
5. Checkout and return run inside transactions with `SELECT ... FOR UPDATE` row locks.

## Project structure

```mermaid
flowchart TD
    root["libracore/"]
    root --> fe["frontend/<br/>React app + Nginx"]
    root --> be["backend/<br/>Express API"]
    root --> dbdir["database/<br/>init.sql, migrations/"]
    root --> docs["docs/<br/>architecture, PANDUAN"]
    root --> compose["compose.yml, .env.example"]

    fe --> fepages["src/pages/<br/>Login, Daybook, Loans, Catalog,<br/>Members, Reports, My loans, Account"]
    fe --> fecomp["src/components/<br/>Modal, Field, Toast, DataState"]
    fe --> fesvc["src/services/<br/>api client, auth, theme"]
    fe --> nginx["nginx.conf<br/>SPA fallback + /api proxy"]

    be --> routes["src/routes/<br/>auth, books, members, loans,<br/>me, dashboard"]
    be --> mw["src/middleware/<br/>auth (JWT cookie, roles), errors"]
    be --> svc["src/services/loans.js<br/>checkout, return, fines"]
    be --> tests["test/<br/>unit + integration (real PostgreSQL)"]
```

```text
libracore/
├── frontend/
│   ├── public/                 index.html (theme bootstrap), favicon
│   ├── src/
│   │   ├── components/         Modal, Field, ConfirmDialog, DataState, Toast, Icon
│   │   ├── layouts/            AppLayout (masthead + navigation per role)
│   │   ├── pages/              one file per screen
│   │   ├── services/           api.js, auth.js, theme.js, format.js, useResource.js
│   │   ├── App.js              routes per role
│   │   └── styles.css          design tokens, light and dark themes
│   ├── nginx.conf
│   └── Dockerfile              multi-stage: node build → nginx
├── backend/
│   ├── src/
│   │   ├── middleware/         auth.js, errors.js
│   │   ├── routes/             auth, books, members, loans, me, dashboard
│   │   ├── services/loans.js
│   │   ├── app.js  config.js  db.js  bootstrap.js  validation.js  errors.js
│   │   └── server.js
│   ├── test/                   unit.test.js, api.test.js, helpers.js
│   └── Dockerfile
├── database/
│   ├── init.sql                schema + sample data (fresh volumes)
│   └── migrations/             changes for existing databases
├── docs/                       architecture.md, PANDUAN.md
├── compose.yml
├── .env.example
└── README.md
```

## Backend layout

| Path | Responsibility |
|---|---|
| `src/server.js` | Entry point: config, DB wait, admin and demo-borrower bootstrap, graceful shutdown |
| `src/app.js` | Express app: security headers, JSON parsing, request log, routes, error handler |
| `src/config.js` | Reads and validates environment variables |
| `src/db.js` | Connection pool and `withTransaction` helper |
| `src/middleware/auth.js` | Cookie authentication and role checks |
| `src/middleware/errors.js` | 404 and error mapping (no stack traces to clients) |
| `src/routes/*.js` | REST endpoints (`me.js` is the borrower's own data) |
| `src/services/loans.js` | Checkout, return and late-fee rules |
| `src/validation.js` | Input validation helpers |

## Access control

Access is enforced in the API by role. Borrowers have per-user data, which is isolated by member: `/api/me/*` queries always filter on `req.user.memberId`, taken from the authenticated session (never from the request), so one borrower cannot read another's loans.

| Action | Borrower | Librarian | Admin |
|---|---|---|---|
| Browse the catalog | ✔ (read-only) | ✔ | ✔ |
| Own card, loans and fees (`/api/me/*`) | ✔ own only | ✘ (403) | ✘ (403) |
| Dashboard, members, all loans | ✘ (403) | ✔ | ✔ |
| Create/edit books and members, check out, return | ✘ (403) | ✔ | ✔ |
| Give/remove borrower sign-in | ✘ (403) | ✔ | ✔ |
| Archive a book, delete a member, reports | ✘ (403) | ✘ (403) | ✔ |

The integration tests (`backend/test/api.test.js`) verify these rules, including two borrowers who each see only their own loans.

## Data model

```mermaid
erDiagram
    members ||--o| users : "may have a borrower login"
    members ||--o{ loans : borrows
    users ||--o{ loans : "processes (staff)"
    loans ||--|{ loan_items : contains
    books ||--o{ loan_items : "lent as"

    users {
        int id PK
        varchar name
        varchar email UK "case-insensitive"
        varchar password_hash "bcrypt"
        varchar role "admin | librarian | borrower"
        int member_id FK, UK "borrowers only"
        boolean is_active
    }
    members {
        int id PK
        varchar member_code UK
        varchar name
        varchar email
        varchar phone
        varchar status "active | inactive"
    }
    books {
        int id PK
        varchar isbn UK
        varchar title
        varchar author
        varchar category
        int total_copies
        int available_copies "0..total_copies"
        timestamptz archived_at "null = in catalog"
    }
    loans {
        int id PK
        int member_id FK
        int staff_id FK
        date checkout_date
        date due_date
        varchar status "active | returned"
    }
    loan_items {
        int id PK
        int loan_id FK
        int book_id FK
        timestamptz returned_at "null = still out"
        int fine_idr
    }
```

Integrity rules enforced by the database: `available_copies` between 0 and `total_copies`, unique ISBN, unique member code, unique staff email (case-insensitive), a book appears at most once per loan, and `due_date >= checkout_date`.

## Cloud deployment plan

The same images can run on a single VPS with Docker Compose (e.g. a small cloud VM) behind a TLS-terminating reverse proxy, with `COOKIE_SECURE=true`. For a managed setup, run `api` and `web` on a container service and replace the `db` container with a managed PostgreSQL instance with automated backups; only the `DB_*` variables change.
