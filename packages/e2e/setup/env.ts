import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

/**
 * 作業ツリーごとの識別子。worktree を並べて同時に回しても、データとポートが
 * 衝突しないようにする。パスから決めるので、プロセスが変わっても同じ値になる。
 */
const RUN_HASH = createHash('sha256').update(fileURLToPath(import.meta.url)).digest('hex');
const RUN_ID = process.env.E2E_RUN_ID ?? RUN_HASH.slice(0, 8);

/**
 * E2E 専用の接続先。
 *
 * IT（db_test / events）とは別の DB とテーブルを使う。同じものを共有すると
 * 片方の後始末がもう片方を壊すため。docker/docker-compose.yml と対になる
 * ローカル・CI 専用の固定値で、本番の認証情報を書かないこと。
 */
export const E2E_ENV = {
  CID_DB_URL: `postgres://user:pass@localhost:5432/db_e2e_${RUN_ID}`,
  CID_ADMIN_DB_URL: 'postgres://user:pass@localhost:5432/postgres',
  CID_TEST_DB_NAME: `db_e2e_${RUN_ID}`,
  EVENTS_TABLE_NAME: `events_e2e_${RUN_ID}`,
  LOCALSTACK_ENDPOINT: 'http://localhost:4566',
  AWS_REGION: 'ap-northeast-1',
  AWS_ACCESS_KEY_ID: 'test',
  AWS_SECRET_ACCESS_KEY: 'test',
} as const;

/** シードで作る管理ユーザー。global-setup がこれでログインする。 */
export const E2E_USER = {
  email: process.env.E2E_USER_EMAIL ?? 'e2e@example.com',
  password: process.env.E2E_USER_PASSWORD ?? 'password123',
  name: 'E2E Admin',
} as const;

/**
 * シードで作る一般利用者。自分の申請は決裁できないため、
 * 承認フローの検証には申請者とは別のこの利用者でサインインする。
 */
export const E2E_MEMBER = {
  email: 'member1@example.com',
  password: 'password123',
  name: 'Member 1',
} as const;

/**
 * アプリを起動するポートと URL。`pnpm dev` の 3000 と重ならない帯から選ぶ。
 * たまたま使用中なら Playwright が起動時に落ちるので、E2E_PORT で逃がす。
 */
export const APP_PORT = Number(
  process.env.E2E_PORT ?? 3100 + (Number.parseInt(RUN_HASH.slice(0, 8), 16) % 800),
);
export const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${APP_PORT}`;
