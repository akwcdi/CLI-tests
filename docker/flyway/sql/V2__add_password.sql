-- ログインに使う資格情報。既存行が無い前提なので NOT NULL で追加する。
ALTER TABLE users ADD COLUMN password_hash text NOT NULL;

-- セッションは DB で持つ。ログアウトで即座に無効化できるようにするため。
CREATE TABLE sessions (
    token      text        PRIMARY KEY,
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);
