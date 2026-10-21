# LibraCore — Library Management System

A full-stack library administration application built with **React (Create React App), Node.js + Express, PostgreSQL, and Docker Compose**. This README documents the intended architecture, setup workflow, application structure, authentication, API, testing, and GitHub publishing process.

> **Panduan lengkap (Bahasa Indonesia):** [docs/PANDUAN.md](docs/PANDUAN.md) covers everything from installing Docker to the presentation demo. Architecture, request-flow and database diagrams are in [docs/architecture.md](docs/architecture.md).

## Table of contents

- [Project overview](#project-overview)
- [Features](#features)
- [Technology stack](#technology-stack)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Quick start with Docker](#quick-start-with-docker)
- [First administrator account](#first-administrator-account)
- [How to use](#how-to-use)
- [Running without Docker](#running-without-docker)
- [Project structure](#project-structure)
- [Database design](#database-design)
- [Authentication and authorization](#authentication-and-authorization)
- [API reference](#api-reference)
- [Testing and verification](#testing-and-verification)
- [Environment variables](#environment-variables)
- [Common workflows](#common-workflows)
- [UI/UX principles](#uiux-principles)
- [Docker commands](#docker-commands)
- [Troubleshooting](#troubleshooting)
- [Security checklist](#security-checklist)
- [GitHub repository setup](#github-repository-setup)
- [Suggested development roadmap](#suggested-development-roadmap)

## Project overview

**LibraCore** is a web-based administration system for managing a library's catalog, members, loans, and returns. It is designed as a practical full-stack project that can be run locally with Docker Compose and developed further for coursework or a software engineering portfolio.

The project uses a three-tier architecture:

1. **Presentation tier:** React frontend served by Nginx.
2. **Application tier:** Node.js and Express REST API.
3. **Data tier:** PostgreSQL relational database.

Docker Compose runs the services together and provides a private network between them. PostgreSQL data is stored in a named Docker volume so it persists when containers are stopped or recreated.

## Features

### Authentication and staff access

- Login and logout.
- Passwords stored as bcrypt hashes, never as plaintext.
- Signed authentication token stored in an `HttpOnly` cookie.
- Protected frontend pages and authenticated API endpoints.
- Staff roles `admin` and `librarian`, plus a `borrower` role for library members.
- Server-side role checks for privileged actions.
- Login rate limiting and security headers.
- Configurable initial administrator account for first-time setup.

### Borrower access

- An administrator or librarian can give any member with an email address a sign-in.
- Borrowers see their library card, the books they have out, due dates, late fees and their loan history.
- Borrowers can browse the catalog read-only.
- Each borrower sees only their own loans. The API scopes these queries to the signed-in member, and staff endpoints return `403` to borrowers.
- Every user can change their own password.

### Appearance

- Light and dark themes, following the device setting by default. The choice is saved per browser.

### Book catalog

- Create, view, search, and edit book records.
- Store ISBN, title, author, category, publisher, publication year, and copy counts.
- Track total copies and currently available copies.
- Archive books instead of deleting historical records.
- Search, filtering, and pagination.

### Member management

- Register, edit and delete library members (delete is admin-only and only for members without loan history; otherwise set them inactive).
- Store member code, name, email, phone, and membership status.
- Search the member directory.
- Prevent inactive members from borrowing books.

### Borrowing and returns

- Create a loan for a member with one or more book titles.
- Record checkout date and due date.
- Validate book availability before checkout.
- Update inventory inside a database transaction.
- Return individual items and calculate late fees.
- Track active, returned, and overdue loans.
- Prevent the same item from being returned twice.

### Dashboard and reporting

- Total catalog titles and available copies.
- Active members.
- Current loans and overdue items.
- Loan history and operational summaries.

### Infrastructure

- Dockerfiles for frontend and backend.
- Docker Compose configuration for `web`, `api`, and `db`.
- Nginx reverse proxy for `/api` requests.
- PostgreSQL named volume for persistent data.
- Database initialization script.
- Health checks and container restart policies.
- Automated backend tests as the project evolves.

## Technology stack

| Layer | Technology | Responsibility |
|---|---|---|
| Frontend | React + Create React App | Admin interface and client-side navigation |
| Styling | CSS or a chosen component system | Responsive layout and design system |
| Web server | Nginx | Serve the React build and proxy API requests |
| Backend | Node.js + Express | REST endpoints, authentication, validation, and business rules |
| Database | PostgreSQL | Persistent relational data |
| Database client | `pg` | PostgreSQL connection pooling and parameterized SQL |
| Authentication | bcrypt + signed token cookie | Password hashing and authenticated requests |
| Containers | Docker | Package each service into an isolated environment |
| Orchestration | Docker Compose | Run services, network, health checks, and volumes |
| Testing | Node.js test runner / integration tests | Validate application behavior |

## Architecture

```text
                         Browser
                            |
                            | http://localhost:8080
                            v
                  +----------------------+
                  | web: Nginx + React   |
                  | static frontend      |
                  +----------------------+
                            |
                            | /api/* via internal Docker DNS
                            v
                  +----------------------+
                  | api: Express         |
                  | port 3000            |
                  +----------------------+
                            |
                            | PostgreSQL connection pool
                            v
                  +----------------------+
                  | db: PostgreSQL       |
                  | port 5432 (internal) |
                  +----------------------+
                            |
                            v
                  +----------------------+
                  | Docker volume        |
                  | db_data              |
                  +----------------------+
```

The web service publishes port `8080`. The API stays on the private Compose network. The database is published on `127.0.0.1:5433` only (not reachable from other machines) so tools such as pgAdmin can connect locally; change it with `DB_HOST_PORT`. Nginx forwards browser requests beginning with `/api/` to the API service.

### Why use three services?

- **Frontend:** can be rebuilt and served independently.
- **Backend:** owns authorization, validation, and business rules; the browser must not be trusted to enforce them.
- **Database:** persists application data independently of the lifecycle of the API container.
- **Compose network:** lets services communicate by service name, such as `api` and `db`, rather than hard-coded container IP addresses.

## Requirements

For the Docker setup:

- Docker Desktop on Windows/macOS, or Docker Engine with the Compose plugin on Linux.
- Git, if you plan to clone or publish the repository.
- A modern browser.

For local development without Docker:

- Node.js 20 or newer.
- npm.
- PostgreSQL 16 or newer.
- A terminal such as PowerShell, Bash, or Zsh.

Check installations:

```bash
docker --version
docker compose version
git --version
node --version
npm --version
```

## Quick start with Docker

### 1. Obtain the project

If you downloaded or extracted the project archive, open a terminal in the project root. If the project has already been published to GitHub, clone it:

```bash
git clone https://github.com/rixxz142/libracore.git
cd libracore
```

The repository is private; your GitHub account needs access to it.

### 2. Create the local environment file

Copy the example environment file:

**Linux/macOS/WSL**

```bash
cp .env.example .env
```

**Windows PowerShell**

```powershell
Copy-Item .env.example .env
```

Edit `.env` and replace the example secrets with unique values. Example:

```dotenv
POSTGRES_USER=libracore_app
POSTGRES_PASSWORD=replace-with-a-strong-local-database-password
POSTGRES_DB=libracore

JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRES_IN=8h
COOKIE_SECURE=false

BOOTSTRAP_ADMIN_NAME=Library Admin
BOOTSTRAP_ADMIN_EMAIL=admin@example.local
BOOTSTRAP_ADMIN_PASSWORD=replace-with-a-long-unique-password
```

Generate a secret on Linux/macOS/WSL:

```bash
openssl rand -base64 48
```

Keep `.env` private. It should be ignored by Git and must never be committed.

### 3. Build and start the services

From the project root:

```bash
docker compose up --build -d
```

Inspect the services:

```bash
docker compose ps
```

Wait for the database and API health checks to pass. Then open:

**http://localhost:8080**

### 4. Sign in

Use the administrator email and password configured in `.env`, provided the application implements the documented first-run bootstrap behavior.

Do not assume a default account exists. A secure project should not ship with a universal, hard-coded administrator password.

### 5. Check application health

```bash
curl -i http://localhost:8080/api/health
```

In PowerShell:

```powershell
Invoke-WebRequest http://localhost:8080/api/health
```

A healthy API should return HTTP `200` with a small JSON response. The endpoint should also verify database connectivity if it is intended to represent readiness, not just process liveness.

### 6. Inspect logs

```bash
docker compose logs -f
docker compose logs -f api
docker compose logs -f web
docker compose logs -f db
```

Press `Ctrl+C` to stop following logs; this does not stop the containers.

## First administrator account

The initial administrator should be created through a controlled bootstrap process:

1. On a fresh database, check whether a staff user already exists.
2. If no staff user exists and the bootstrap variables are configured, create the account.
3. Hash the password with bcrypt before inserting it.
4. Never log the password or store it in plaintext.
5. Do not silently reset an existing administrator's password on every container restart.

If the database already contains users, changing `BOOTSTRAP_ADMIN_PASSWORD` should not automatically overwrite an existing password. Use a deliberate password-reset procedure instead.

For a public deployment, create the initial administrator securely, then remove or disable bootstrap credentials.

## How to use

Open **http://localhost:8080**. Staff and borrowers use the same sign-in page; what you see depends on your role.

### Accounts

| Role | Email | Password |
|---|---|---|
| Administrator | `BOOTSTRAP_ADMIN_EMAIL` in `.env` | `BOOTSTRAP_ADMIN_PASSWORD` in `.env` |
| Borrower (demo) | `BOOTSTRAP_BORROWER_EMAIL` in `.env` (sample member Budi Santoso, `budi@example.com`) | `BOOTSTRAP_BORROWER_PASSWORD` in `.env` |

Both accounts are created when the API starts, but only if they do not exist yet. Changing these values later does **not** change an existing password; use **Account → Password** or, for borrowers, **Members → Access** instead. More borrowers are added from the Members page (see below).

### As an administrator

| Page | What you do there |
|---|---|
| **Daybook** | Today's figures (copies on the shelf, out on loan, overdue, active members), overdue loans to chase up, and the latest loans. |
| **Loans** | **Check out books**: pick a member with an active card, pick books that are on the shelf, confirm the due date. Use the tabs (All / Open / Overdue / Closed) to filter, and **Check in** next to a book to return it; a late fee is calculated automatically. |
| **Catalog** | **New record** adds a book; **Edit** changes details or the number of copies owned; **Archive** removes a book from lending while keeping its loan history. |
| **Members** | **Issue a card** registers a member; **Edit** changes details or sets the card inactive (inactive members cannot borrow); **Delete** removes a member without loan history; **Give access** creates a borrower sign-in (the member needs an email), and **Access** resets the password or removes access. |
| **Reports** | Loans per month, most borrowed titles, late returns and fees, holdings per category. |
| **Account** | Change your password and pick a light, dark or device theme. |

A typical demo flow: issue a card → give access → check out a book to that member → sign in as the member and see the loan → sign back in as admin and check the book in.

### As a borrower

| Page | What you do there |
|---|---|
| **My loans** | Your library card, a one-line summary (books out, next due date, any overdue fees), and a slip for each book with its due date. **History** lists books you have returned and any fees charged. |
| **Catalog** | Search what the library holds and how many copies are on the shelf. Borrowing happens at the desk: staff check books out to you. |
| **Account** | Change your password and theme. To change your name or email, ask the library staff. |

Borrowers only ever see their own loans; the API refuses staff pages with `403 Forbidden`.

## Running without Docker

This mode is useful when working on the frontend and backend with hot reload.

### 1. Prepare PostgreSQL

Start PostgreSQL and create a database and user. Apply the project's schema file using a database administrator account:

```bash
psql -U YOUR_POSTGRES_ADMIN -d postgres
```

Then create the application database and user using SQL appropriate for your environment. Avoid reusing a superuser account as the application's database login.

Apply the schema:

```bash
psql -U YOUR_APP_USER -d libracore -f database/init.sql
```

Run this from the repository root. Adjust connection flags as needed for your local PostgreSQL setup.

### 2. Configure the backend

Create `backend/.env` or export the backend variables in your terminal. At minimum, configure:

```dotenv
NODE_ENV=development
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=YOUR_APP_USER
DB_PASSWORD=YOUR_LOCAL_DB_PASSWORD
DB_NAME=libracore
JWT_SECRET=your-long-random-secret
JWT_EXPIRES_IN=8h
COOKIE_SECURE=false
CLIENT_ORIGIN=http://localhost:3001
BOOTSTRAP_ADMIN_NAME=Library Admin
BOOTSTRAP_ADMIN_EMAIL=admin@example.local
BOOTSTRAP_ADMIN_PASSWORD=your-long-unique-password
```

Install dependencies and run the API:

```bash
cd backend
npm install
npm run dev
```

### 3. Configure the frontend

In another terminal, install dependencies:

```bash
cd frontend
npm install
```

For local development, configure the frontend API base URL if the implementation uses one:

```dotenv
REACT_APP_API_BASE_URL=http://localhost:3000/api
```

Start React:

```bash
npm start
```

Create React App usually uses port `3000` by default. Because the API also uses port `3000`, start the frontend on another port when prompted (for example, `3001`) or configure the API to use a different port. Make sure `CLIENT_ORIGIN` matches the actual frontend origin.

> Note: environment variables prefixed with `REACT_APP_` are embedded into the browser bundle. Never put secrets in frontend environment variables.

## Project structure

The exact files may vary slightly as implementation evolves. A recommended layout is:

```text
libracore/
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/       # Buttons, tables, dialogs, form controls
│   │   ├── layouts/          # Authenticated app shell and navigation
│   │   ├── pages/            # Login, dashboard, catalog, members, loans
│   │   ├── services/         # API client and request helpers
│   │   ├── App.js            # Routes and app composition
│   │   ├── index.js
│   │   └── styles.css        # Design tokens and global styles
│   ├── nginx.conf            # SPA fallback and API reverse proxy
│   ├── Dockerfile
│   └── package.json
├── backend/
│   ├── src/
│   │   ├── middleware/       # Authentication, role checks, error handling
│   │   ├── routes/           # REST API route handlers
│   │   ├── services/         # Loan and inventory business rules
│   │   ├── app.js            # Express app (middleware and routes)
│   │   ├── config.js         # Environment variable validation
│   │   ├── db.js             # PostgreSQL connection pool
│   │   ├── bootstrap.js      # First-run administrator setup
│   │   └── server.js         # Express application entry point
│   ├── test/                 # Unit and integration tests
│   ├── Dockerfile
│   └── package.json
├── database/
│   ├── init.sql              # Initial schema
│   └── migrations/           # Versioned schema changes (recommended)
├── docs/
│   ├── architecture.md
│   └── screenshots/
├── .env.example
├── .gitignore
├── compose.yml
└── README.md
```

### Folder responsibilities

- `frontend/src/pages`: full-page screens and route-level UI.
- `frontend/src/components`: reusable interface elements; avoid duplicating table, dialog, or form implementations.
- `frontend/src/services`: centralize API requests, credentials, and response handling.
- `backend/src/routes`: map HTTP methods and URLs to handlers.
- `backend/src/middleware`: authenticate requests and enforce permissions.
- `backend/src/services`: keep business rules out of UI components and, where practical, separate them from HTTP-specific code.
- `database/migrations`: store schema changes over time. Initialization SQL is convenient for an empty local database, but it is not a replacement for migrations in an established environment.

## Database design

A practical relational model includes the following tables:

| Table | Purpose |
|---|---|
| `users` | Staff and borrower accounts, password hashes, roles, linked member for borrowers |
| `members` | Library members and membership status |
| `books` | Catalog metadata and copy inventory |
| `loans` | Checkout transaction, member, staff, and due date |
| `loan_items` | Individual books attached to a loan, return timestamps, fine amounts |

`database/init.sql` also inserts a few sample books and members for demonstration. It does not create staff accounts.

### Main relationships

- One member can have many loans.
- One staff user can process many loans.
- One loan can contain multiple loan items.
- Each loan item references one book.
- A book's inventory counts track the number of physical copies, not the number of titles.

### Data integrity rules

- `available_copies` must never be negative.
- `available_copies` must not exceed `total_copies`.
- A checkout must fail if the member is inactive or a selected book has no available copies.
- Checkout should run inside a PostgreSQL transaction.
- Lock relevant book rows during checkout to prevent two simultaneous requests from borrowing the final copy.
- Returning an item should update its return timestamp and inventory exactly once.
- A loan should be marked returned only after all its items are returned.
- Historical loan records should be retained even when a book is archived.

### Late fee policy

A demonstration policy might charge IDR 2,000 for each overdue calendar day. The daily amount and loan duration should be configurable and documented. Confirm the real library's policy before using the application operationally.

### Why not automatically use Row Level Security?

RLS is useful when data must be isolated at the database level, for example in a multi-tenant application. A typical library admin system has shared catalog and loan records, with access controlled by staff roles. Backend authorization is necessary either way; if RLS is introduced, design the database roles and user context deliberately. PostgreSQL's `CURRENT_USER` identifies the database role, not automatically the person logged into the web app.

## Authentication and authorization

The browser must never be treated as the authority for access decisions.

### Login flow

1. The user submits email and password to `POST /api/auth/login`.
2. The backend validates the input and looks up the staff account.
3. bcrypt compares the supplied password with the stored password hash.
4. The backend creates a signed authentication token.
5. The token is sent in an `HttpOnly` cookie.
6. The browser includes the cookie in same-origin API requests.
7. Protected API routes validate the token and check the user's role.

### Cookie guidance

- `HttpOnly` prevents frontend JavaScript from reading the cookie.
- `Secure` should be enabled over HTTPS.
- `SameSite=Lax` provides useful baseline cross-site request protection, but it is not a complete CSRF strategy for every deployment.
- Use a strong secret and a sensible expiration.
- For higher-security deployments, evaluate server-side sessions, token revocation, CSRF defenses, and account/session management.

### Roles

A starting role model:

- **Admin:** all library operations and privileged administrative/reporting actions.
- **Librarian:** daily catalog, member, checkout, and return workflows.
- **Borrower:** a library member who can sign in to see their own loans and browse the catalog. A borrower account is linked to exactly one member (`users.member_id`).

The backend must enforce role permissions even if the frontend hides buttons or routes. Frontend route protection is a usability feature, not a security boundary.

## API reference

All endpoints use the `/api` prefix and JSON request/response bodies unless otherwise noted. The exact endpoint list must be kept in sync with the implementation.

| Method | Endpoint | Authentication | Purpose |
|---|---|---|---|
| `GET` | `/api/health` | Public | Service/database health |
| `POST` | `/api/auth/login` | Public | Sign in |
| `POST` | `/api/auth/logout` | Cookie | Clear session cookie |
| `GET` | `/api/auth/me` | Required | Current user profile |
| `POST` | `/api/auth/password` | Required | Change own password |
| `GET` | `/api/me/summary` | Borrower | Own card, books out, fees |
| `GET` | `/api/me/loans` | Borrower | Own loans only |
| `GET` | `/api/dashboard` | Staff | Dashboard metrics |
| `GET` | `/api/books` | Required | Search and paginate catalog |
| `POST` | `/api/books` | Staff | Create a book |
| `PATCH` | `/api/books/:id` | Staff | Update book metadata/stock |
| `DELETE` | `/api/books/:id` | Admin | Archive a book |
| `GET` | `/api/members` | Staff | Search and paginate members |
| `POST` | `/api/members` | Staff | Register a member |
| `PATCH` | `/api/members/:id` | Staff | Update member details/status |
| `DELETE` | `/api/members/:id` | Admin | Delete a member with no loan history |
| `PUT` | `/api/members/:id/account` | Staff | Give or reset borrower sign-in |
| `DELETE` | `/api/members/:id/account` | Staff | Remove borrower sign-in |
| `GET` | `/api/loans` | Staff | View loan history |
| `POST` | `/api/loans` | Staff | Check out books |
| `POST` | `/api/loans/:loanId/items/:itemId/return` | Staff | Return a loan item |
| `GET` | `/api/reports/overview` | Admin | Operational report |

### Example: health check

```bash
curl -i http://localhost:8080/api/health
```

### Example: sign in

Use your own configured credentials:

```bash
curl -i -c cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.local","password":"YOUR_PASSWORD"}' \
  http://localhost:8080/api/auth/login
```

### Example: call an authenticated endpoint

```bash
curl -b cookies.txt http://localhost:8080/api/auth/me
```

`cookies.txt` contains an authentication cookie. Keep it private and remove it when you finish testing:

```bash
rm -f cookies.txt
```

PowerShell:

```powershell
Remove-Item cookies.txt
```

### Expected error conventions

Use consistent HTTP status codes and safe error messages:

- `400 Bad Request`: malformed identifier or request.
- `401 Unauthorized`: missing or invalid authentication.
- `403 Forbidden`: authenticated user lacks permission.
- `404 Not Found`: resource does not exist.
- `409 Conflict`: duplicate ISBN/member code or unavailable inventory.
- `422 Unprocessable Entity`: well-formed request with invalid values.
- `429 Too Many Requests`: rate limit exceeded.
- `500 Internal Server Error`: unexpected server failure; do not expose stack traces to clients.

## Testing and verification

Testing should be part of the project, not an afterthought.

### Backend tests

From the backend directory:

```bash
npm install
npm test
```

The integration tests start a throwaway PostgreSQL server automatically (the `embedded-postgres` dev dependency downloads PostgreSQL binaries on `npm install`), so neither Docker nor a local PostgreSQL installation is needed to run them.

The test suite covers:

- Valid and invalid login attempts.
- Protected routes reject requests without a valid cookie.
- Role-restricted routes reject unauthorized roles.
- Book and member input validation.
- Duplicate ISBN and member code handling.
- Checkout fails when a member is inactive.
- Checkout fails when inventory is unavailable.
- Concurrent checkout cannot reduce inventory below zero.
- Returning an item twice does not increment stock twice.
- Late fee calculations for on-time and overdue returns.
- Database transaction rollback when a checkout fails partway through.

### Docker smoke tests

```bash
docker compose up --build -d
docker compose ps
curl -i http://localhost:8080/api/health
docker compose logs --tail=100 api
```

Then verify manually:

1. The login page loads.
2. Invalid credentials show a clear error.
3. Valid credentials open the dashboard.
4. Refreshing a protected page preserves a valid session.
5. Logging out prevents access to protected data.
6. A librarian can create a book and member.
7. A loan decreases available inventory.
8. Returning the item restores inventory.
9. Restarting containers does not erase database data.

### Persistence test

Create a test record in the application, then run:

```bash
docker compose down
docker compose up -d
```

Confirm the record still exists. This should preserve data because the named volume remains attached.

Do **not** use `docker compose down -v` for this test; that command removes named volumes and deletes the local database contents.

## Environment variables

Keep secrets in `.env`, which should not be committed. `.env.example` should contain placeholders only.

| Variable | Purpose |
|---|---|
| `POSTGRES_USER` | PostgreSQL application role |
| `POSTGRES_PASSWORD` | PostgreSQL password |
| `POSTGRES_DB` | Database name |
| `DB_HOST` | Database hostname (`db` inside Compose) |
| `DB_PORT` | PostgreSQL port, normally `5432` |
| `PORT` | API listening port, normally `3000` |
| `JWT_SECRET` | Secret used to sign authentication tokens |
| `JWT_EXPIRES_IN` | Token lifetime, for example `8h` |
| `COOKIE_SECURE` | Set to `true` when served over HTTPS |
| `CLIENT_ORIGIN` | Frontend origin for local development CORS |
| `BOOTSTRAP_ADMIN_NAME` | Initial admin's display name |
| `BOOTSTRAP_ADMIN_EMAIL` | Initial admin's email |
| `BOOTSTRAP_ADMIN_PASSWORD` | Initial admin password; use a strong unique value |
| `BOOTSTRAP_BORROWER_EMAIL` | Optional demo borrower: email of an existing member to give sign-in access |
| `BOOTSTRAP_BORROWER_PASSWORD` | Optional demo borrower password, at least 10 characters |
| `DAILY_FINE_IDR` | Late fee per overdue day |
| `MAX_LOAN_ITEMS` | Maximum different titles allowed per loan |
| `LOAN_PERIOD_DAYS` | Default checkout period |
| `DB_TIMEZONE` | Timezone used for due dates and late fees, default `Asia/Jakarta` |
| `DB_HOST_PORT` | Host port for pgAdmin/psql, bound to `127.0.0.1`, default `5433` |
| `LOGIN_RATE_LIMIT` | Optional: login attempts allowed per IP per 15 minutes, default `10` |

Do not put secrets in `REACT_APP_*` variables. Anything embedded in a React bundle can be read by users in the browser.

## Common workflows

### Add a book

1. Open **Catalog**.
2. Choose **Add book**.
3. Enter the title, author, category, and total copies; ISBN and publisher may be optional according to the form.
4. Save and confirm the new book appears in the catalog.
5. Verify the available-copy count matches the total-copy count for a new item.

### Register a member

1. Open **Members**.
2. Choose **Add member**.
3. Enter a unique member code and the member's name.
4. Save and verify the member is active.

### Check out books

1. Open **Loans** and choose **New loan**.
2. Select an active member.
3. Select available books.
4. Confirm the due date.
5. Submit and verify that inventory counts decrease.

### Give a member sign-in access

1. Open **Members** and make sure the member has an email address.
2. Choose **Give access** and set a password of at least 10 characters.
3. Share the password with the member in person. They sign in with their email at the same login page.
4. Use **Access → Remove access** to revoke it; their card and loan history stay.

### Return a book

1. Find the active loan.
2. Choose the item being returned.
3. Confirm the return.
4. Verify the item is marked returned, inventory increases once, and any late fee is shown.

## UI/UX principles

LibraCore should feel like a focused administrative tool for a real library—not a template filled with decorative cards.

### Visual direction

- Use a restrained, warm-neutral canvas with one consistent accent color.
- Use a clear typographic hierarchy and readable line lengths.
- Keep spacing, border radii, shadows, and control heights consistent.
- Prefer strong alignment and useful whitespace over decorative gradients.
- Use icons consistently and pair unfamiliar icons with text labels.
- Use color to communicate state, not as the only way to convey information.

### Layout and navigation

- Persistent sidebar on desktop with clear active-page state.
- Compact top bar with page title, search access, and staff account menu.
- Responsive navigation on smaller screens.
- Tables designed for scanning: clear column headings, predictable alignment, and restrained row separators.
- Keep primary actions—such as **Add book** or **New loan**—in consistent positions.

### Interaction states

Every data-driven screen should support:

- Loading and skeleton states.
- Empty states with a useful next action.
- Search results with a clear no-results state.
- Inline field validation and actionable server error messages.
- Disabled submit buttons while a request is in progress.
- Confirmation dialogs for destructive or irreversible actions.
- Success feedback after saving or completing a transaction.
- Keyboard navigation, visible focus indicators, and properly associated form labels.

### Accessibility and responsive behavior

- Maintain sufficient contrast.
- Do not use color alone to indicate overdue, active, or inactive status.
- Use semantic headings, buttons, labels, and tables.
- Ensure forms and dialogs work with a keyboard.
- Check layouts at narrow mobile, tablet, and desktop widths.
- Avoid horizontal scrolling where practical; where data tables need it, make the scroll behavior intentional.

## Docker commands

Start and build:

```bash
docker compose up --build -d
```

View status:

```bash
docker compose ps
```

Follow logs:

```bash
docker compose logs -f
```

Restart one service:

```bash
docker compose restart api
```

Rebuild after changing source code:

```bash
docker compose up --build -d
```

Stop containers but keep data:

```bash
docker compose down
```

Stop containers and remove volumes (**destructive**):

```bash
docker compose down -v
```

Open a PostgreSQL shell:

```bash
docker compose exec db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

The command above assumes the variables are exported in your shell. An alternative is to read the configured values from `.env` and pass them explicitly. Do not paste database passwords into shared terminals or public logs.

## Troubleshooting

### Docker says a required variable is missing

- Confirm `.env` exists at the repository root.
- Confirm the required variable names match `.env.example`.
- Re-run `docker compose config` to validate Compose configuration. Be careful: resolved configuration may display secrets in your terminal.

### Frontend loads but API calls fail

- Inspect `docker compose logs web api`.
- Verify Nginx proxies `/api/` to `http://api:3000`.
- Verify the API exposes the matching route.
- In Docker, use the Compose service name `api`; do not use `localhost` to reach another container.

### Login does not work after editing the bootstrap password

- Bootstrap creation is intended for an empty user table.
- Changing the bootstrap environment variable should not reset an existing user's password.
- Use a documented password-reset process. For a disposable local database only, deleting the volume and initializing from scratch will erase all database data.

### Schema changes do not appear

Initialization scripts normally run only when PostgreSQL creates a new data directory. Existing volumes are not automatically reinitialized. Apply versioned migrations from `database/migrations/` to an existing database instead, for example the borrower-account migration:

```bash
docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < database/migrations/002_borrower_accounts.sql
```

Migrations are written to be safe to run more than once. A fresh volume does not need them because `init.sql` already contains the current schema. Recreate a disposable development volume only if you are willing to lose its contents.

### Port 8080 is already in use

Change the host port mapping in `compose.yml`, for example from `8080:80` to `8081:80`, then rebuild/restart and open `http://localhost:8081`.

### Container is unhealthy

```bash
docker compose ps
docker compose logs --tail=150 api
docker compose logs --tail=150 db
```

Check database credentials, startup errors, healthcheck URLs, and whether the database initialization completed successfully.

## Security checklist

Before making the service available outside your local machine:

- [ ] Use HTTPS and set secure cookies.
- [ ] Replace every example password and secret.
- [ ] Keep `.env` and credentials out of Git.
- [ ] Disable or remove first-run bootstrap variables after provisioning.
- [ ] Use a least-privilege database role.
- [ ] Enforce authentication and role authorization in the backend.
- [ ] Review CSRF protection for cookie-based authentication.
- [ ] Validate all input server-side and use parameterized SQL.
- [ ] Keep dependencies updated and scan for vulnerabilities.
- [ ] Add integration tests for loan and inventory transactions.
- [ ] Configure backups and test restoration.
- [ ] Avoid exposing PostgreSQL publicly.
- [ ] Review privacy requirements for member information.
- [ ] Do not log passwords, tokens, or sensitive member data.
- [ ] Configure production logging, monitoring, and rate limits.

## GitHub repository setup

This section explains how to publish the project when you are ready. **These steps do not push anything automatically.**

### 1. Create the repository on GitHub

1. Sign in to GitHub.
2. Create a new repository named `libracore`.
3. Choose public or private according to your preference.
4. If you already have the project files locally, do not initialize the remote with a second README, license, or `.gitignore`; that avoids an unnecessary initial-history conflict.

### 2. Initialize Git locally

Run these commands from the project root:

```bash
git init
git add .
git status
git commit -m "feat: initialize LibraCore library management system"
git branch -M main
```

Before committing, inspect `git status` and ensure `.env`, credentials, tokens, and local database files are not included.

### 3. Connect the remote

Replace `YOUR_USERNAME` with your GitHub username:

```bash
git remote add origin https://github.com/YOUR_USERNAME/libracore.git
git push -u origin main
```

Authenticate with GitHub CLI (`gh auth login`) or your Git credential manager. Do not put a personal access token directly in the remote URL.

If `origin` already exists, inspect it before changing anything:

```bash
git remote -v
```

### 4. Keep the repository presentable

Recommended repository description:

> Full-stack library management system built with React, Express, PostgreSQL, and Docker Compose.

Before sharing the repository:

- Add screenshots captured from the actual running application.
- Verify the README's commands match the current files.
- Run tests and a clean Docker build.
- Add a license only after choosing terms that fit your project.
- Enable secret scanning and dependency alerts where available.
- Consider a CI workflow to run tests and build containers on pull requests.

## Suggested development roadmap

- [ ] Finish and verify all catalog workflows.
- [ ] Finish and verify member management.
- [ ] Finish loan creation, returns, stock consistency, and late fees.
- [ ] Add PostgreSQL-backed integration tests.
- [ ] Add staff account management and password change/reset flows.
- [ ] Add audit logs for sensitive administrative actions.
- [ ] Add CSV export and printable reports.
- [ ] Add CI for backend tests and Docker image builds.
- [ ] Add production deployment instructions for a chosen VPS.
- [ ] Add automated database backups and verify restoration.

---

LibraCore is intended as a maintainable learning project. Keep the implementation, tests, and documentation aligned as the application evolves.
