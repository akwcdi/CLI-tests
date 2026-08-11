CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    email      text        NOT NULL,
    name       text        NOT NULL,
    status     text        NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT users_email_key UNIQUE (email),
    CONSTRAINT users_status_check CHECK (status IN ('active', 'suspended'))
);

CREATE INDEX users_created_at_idx ON users (created_at DESC, id DESC);
