-- LibraCore initial schema.
-- Runs automatically when the PostgreSQL container creates a new data directory.
-- For later schema changes, add versioned files under database/migrations/.

BEGIN;

CREATE TABLE IF NOT EXISTS members (
    id          SERIAL PRIMARY KEY,
    member_code VARCHAR(30)  NOT NULL UNIQUE,
    name        VARCHAR(120) NOT NULL,
    email       VARCHAR(255),
    phone       VARCHAR(30),
    status      VARCHAR(20)  NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Staff (admin, librarian) and borrower accounts. A borrower account is
-- linked to exactly one member; staff accounts have no member.
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(120) NOT NULL,
    email         VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(20)  NOT NULL,
    member_id     INTEGER UNIQUE REFERENCES members (id) ON DELETE CASCADE,
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT users_role_check CHECK (role IN ('admin', 'librarian', 'borrower')),
    CONSTRAINT users_borrower_member CHECK ((role = 'borrower') = (member_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (LOWER(email));

CREATE TABLE IF NOT EXISTS books (
    id               SERIAL PRIMARY KEY,
    isbn             VARCHAR(20) UNIQUE,
    title            VARCHAR(255) NOT NULL,
    author           VARCHAR(255) NOT NULL,
    category         VARCHAR(100) NOT NULL,
    publisher        VARCHAR(255),
    publication_year INTEGER CHECK (publication_year BETWEEN 1000 AND 9999),
    total_copies     INTEGER NOT NULL CHECK (total_copies >= 0),
    available_copies INTEGER NOT NULL CHECK (available_copies >= 0),
    archived_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT books_available_lte_total CHECK (available_copies <= total_copies)
);

CREATE TABLE IF NOT EXISTS loans (
    id            SERIAL PRIMARY KEY,
    member_id     INTEGER NOT NULL REFERENCES members (id),
    staff_id      INTEGER NOT NULL REFERENCES users (id),
    checkout_date DATE    NOT NULL DEFAULT CURRENT_DATE,
    due_date      DATE    NOT NULL,
    status        VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'returned')),
    returned_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT loans_due_after_checkout CHECK (due_date >= checkout_date)
);
CREATE INDEX IF NOT EXISTS loans_member_idx ON loans (member_id);
CREATE INDEX IF NOT EXISTS loans_status_due_idx ON loans (status, due_date);

CREATE TABLE IF NOT EXISTS loan_items (
    id          SERIAL PRIMARY KEY,
    loan_id     INTEGER NOT NULL REFERENCES loans (id) ON DELETE CASCADE,
    book_id     INTEGER NOT NULL REFERENCES books (id),
    returned_at TIMESTAMPTZ,
    fine_idr    INTEGER NOT NULL DEFAULT 0 CHECK (fine_idr >= 0),
    CONSTRAINT loan_items_unique_book UNIQUE (loan_id, book_id)
);
CREATE INDEX IF NOT EXISTS loan_items_book_idx ON loan_items (book_id);

-- Sample data for demonstration. Staff accounts are NOT seeded here:
-- the API creates the first administrator from BOOTSTRAP_ADMIN_* variables,
-- and administrators create borrower logins from the Members page.
INSERT INTO books (isbn, title, author, category, publisher, publication_year, total_copies, available_copies) VALUES
    ('9786020332956', 'Laskar Pelangi', 'Andrea Hirata', 'Fiction', 'Bentang Pustaka', 2005, 4, 4),
    ('9789799731234', 'Bumi Manusia', 'Pramoedya Ananta Toer', 'Fiction', 'Hasta Mitra', 1980, 3, 3),
    ('9780132350884', 'Clean Code', 'Robert C. Martin', 'Technology', 'Prentice Hall', 2008, 2, 2),
    ('9781492078005', 'Cloud Native Patterns', 'Cornelia Davis', 'Technology', 'Manning', 2019, 2, 2),
    ('9780262033848', 'Introduction to Algorithms', 'Thomas H. Cormen', 'Technology', 'MIT Press', 2009, 1, 1),
    ('9786024246945', 'Filosofi Teras', 'Henry Manampiring', 'Philosophy', 'Kompas', 2018, 3, 3)
ON CONFLICT DO NOTHING;

INSERT INTO members (member_code, name, email, phone, status) VALUES
    ('M-0001', 'Budi Santoso', 'budi@example.com', '081200000001', 'active'),
    ('M-0002', 'Siti Rahmawati', 'siti@example.com', '081200000002', 'active'),
    ('M-0003', 'Andi Wijaya', 'andi@example.com', '081200000003', 'inactive')
ON CONFLICT DO NOTHING;

COMMIT;
