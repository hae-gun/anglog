-- Password login replaces the development login in production.
-- Accounts made with the development login have no password and cannot log in this way.
ALTER TABLE users ADD COLUMN password_hash VARCHAR(100);
