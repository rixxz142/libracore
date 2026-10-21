-- Adds borrower (member) login accounts.
-- A borrower is a users row with role 'borrower' linked to exactly one member.
-- Safe to run more than once.

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS member_id INTEGER UNIQUE REFERENCES members (id) ON DELETE CASCADE;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'librarian', 'borrower'));

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_borrower_member;
ALTER TABLE users ADD CONSTRAINT users_borrower_member CHECK ((role = 'borrower') = (member_id IS NOT NULL));

COMMIT;
