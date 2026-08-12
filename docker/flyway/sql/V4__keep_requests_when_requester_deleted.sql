-- 申請者を消しても申請は残す。
--
-- V3 では requester_id を ON DELETE CASCADE にしていたため、退職者の
-- アカウントを1つ消すと、その人が出した決裁済みの申請が金額ごと消えた。
-- 決裁の記録は人事の変更より寿命が長いので、決裁者（decided_by）と同じく
-- SET NULL に揃え、行は残して名前だけを失わせる。
ALTER TABLE requests ALTER COLUMN requester_id DROP NOT NULL;

ALTER TABLE requests DROP CONSTRAINT requests_requester_id_fkey;

ALTER TABLE requests
    ADD CONSTRAINT requests_requester_id_fkey
    FOREIGN KEY (requester_id) REFERENCES users (id) ON DELETE SET NULL;
