/** キーセット・ページングのカーソル encode / decode。 */

export type CursorKey = Record<string, unknown>;

/** カーソルが不正なときに投げられる。 */
export class InvalidCursorError extends Error {
  constructor(cursor: string) {
    super(`invalid cursor: ${cursor}`);
    this.name = 'InvalidCursorError';
  }
}

/** キーを不透明なカーソル文字列に変換する。 */
export function encodeCursor(key: CursorKey): string {
  return Buffer.from(JSON.stringify(key), 'utf8').toString('base64url');
}

/** カーソル文字列をキーに戻す。壊れている場合は null。 */
export function decodeCursor(cursor: string): CursorKey | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed as CursorKey;
  } catch {
    return null;
  }
}
