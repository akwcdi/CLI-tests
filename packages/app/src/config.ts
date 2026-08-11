/**
 * 環境変数の読み出し。
 * このファイルは coverage.exclude の許可リストに含まれる。
 */
export const appConfig = {
  port: Number(process.env.PORT ?? 3000),
  /** SPA のビルド成果物。存在すれば静的配信する。 */
  staticRoot: process.env.STATIC_ROOT ?? '../web/dist',
} as const;
