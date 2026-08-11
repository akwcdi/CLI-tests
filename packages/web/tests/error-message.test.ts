import { describe, expect, it } from 'vitest';

import { ApiError } from '../src/api.ts';
import { toMessage } from '../src/error-message.ts';

describe('toMessage', () => {
  it('ApiError ならサーバーの文言をそのまま出す', () => {
    expect(toMessage(new ApiError(400, { code: 'validation_error', message: '重複しています' }))).toBe(
      '重複しています',
    );
  });

  it.each([
    ['素の Error', new Error('TypeError at line 42')],
    ['文字列', 'boom'],
    ['undefined', undefined],
  ])('想定外の例外は中身を出さない: %s', (_label, thrown) => {
    expect(toMessage(thrown)).toBe('予期しないエラーが発生しました');
  });
});
