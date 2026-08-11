import type { NewUser, UserStatus } from './types.ts';

const MAX_NAME_LENGTH = 100;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 入力値が業務ルールを満たさないときに投げられる。 */
export class ValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

/** 比較・保存用にメールアドレスを正規化する。 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * 新規ユーザー入力を検証し、正規化済みの値を返す。
 * 検証に通らない場合は最初に見つかった問題で {@link ValidationError} を投げる。
 */
export function validateNewUser(input: NewUser): Required<NewUser> {
  const email = normalizeEmail(input.email);
  if (email === '') {
    throw new ValidationError('email', 'email is required');
  }
  if (!EMAIL_PATTERN.test(email)) {
    throw new ValidationError('email', `invalid email format: ${email}`);
  }

  const name = input.name.trim();
  if (name === '') {
    throw new ValidationError('name', 'name is required');
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new ValidationError('name', `name must be ${MAX_NAME_LENGTH} characters or fewer`);
  }

  return { email, name, status: input.status ?? 'active' };
}

/** ステータス遷移が許可されているかを判定する。同一ステータスへの遷移は許可しない。 */
export function canTransition(from: UserStatus, to: UserStatus): boolean {
  return from !== to;
}
