-- 申請管理。ユーザー（一般層）を申請者・承認者として参照する。
CREATE TABLE requests (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    title        text        NOT NULL,
    amount       integer     NOT NULL,
    status       text        NOT NULL DEFAULT 'draft',
    requester_id uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    decided_by   uuid        REFERENCES users (id) ON DELETE SET NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    decided_at   timestamptz,
    CONSTRAINT requests_status_check
        CHECK (status IN ('draft', 'pending', 'approved', 'rejected')),
    CONSTRAINT requests_amount_check CHECK (amount > 0),
    -- 決裁済みなら決裁者と決裁日時が揃っていること。
    CONSTRAINT requests_decided_consistency CHECK (
        (status IN ('approved', 'rejected')) = (decided_at IS NOT NULL)
    )
);

CREATE INDEX requests_created_at_idx ON requests (created_at DESC, id DESC);
CREATE INDEX requests_status_idx ON requests (status);
CREATE INDEX requests_requester_idx ON requests (requester_id);
