/**
 * 環境変数の読み出し。
 * このファイルは coverage.exclude の許可リストに含まれる。
 * ロジック（分岐・変換）は置かず、値の受け渡しだけに留めること。
 */

export const config = {
  databaseUrl: process.env.CID_DB_URL ?? 'postgres://user:pass@localhost:5432/db',
  localstackEndpoint: process.env.LOCALSTACK_ENDPOINT,
  awsRegion: process.env.AWS_REGION ?? 'ap-northeast-1',
  eventsTableName: process.env.EVENTS_TABLE_NAME ?? 'events',
} as const;
