import { ApiError } from './api.ts';

/** 例外を画面に出す1行の文言に変換する。想定外の例外の中身は出さない。 */
export function toMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return '予期しないエラーが発生しました';
}
