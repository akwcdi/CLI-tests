/**
 * E2E 専用の接続先。
 *
 * IT（db_test / events）とは別の DB とテーブルを使う。同じものを共有すると
 * 片方の後始末がもう片方を壊すため。docker/docker-compose.yml と対になる
 * ローカル・CI 専用の固定値で、本番の認証情報を書かないこと。
 */
export const E2E_ENV = {
  CID_DB_URL: 'postgres://user:pass@localhost:5432/db_e2e',
  CID_ADMIN_DB_URL: 'postgres://user:pass@localhost:5432/postgres',
  CID_TEST_DB_NAME: 'db_e2e',
  EVENTS_TABLE_NAME: 'events_e2e',
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

/** アプリを起動するポートと URL。 */
export const APP_PORT = Number(process.env.E2E_PORT ?? 3000);
export const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${APP_PORT}`;
