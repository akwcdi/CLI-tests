import type { NewRequest, RequestStatus } from './types.ts';
import { ValidationError } from './user.ts';

const MAX_TITLE_LENGTH = 120;
const MAX_AMOUNT = 100_000_000;

/**
 * 申請の状態遷移。決裁済み（approved / rejected）は終端で、戻せない。
 * 取り消したい場合は新しい申請を出す運用にしている。
 */
const TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
  draft: ['pending'],
  pending: ['approved', 'rejected'],
  approved: [],
  rejected: [],
};

export function canTransitionRequest(from: RequestStatus, to: RequestStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** 決裁が済んでいるか。 */
export function isDecided(status: RequestStatus): boolean {
  return status === 'approved' || status === 'rejected';
}

/**
 * 申請の入力を検証し、正規化済みの値を返す。
 * 金額は円単位の整数のみ。小数を許すと決裁の突合せが崩れる。
 */
export function validateNewRequest(input: NewRequest): Required<NewRequest> {
  const title = input.title.trim();
  if (title === '') {
    throw new ValidationError('title', '件名を入力してください');
  }
  if (title.length > MAX_TITLE_LENGTH) {
    throw new ValidationError('title', `件名は${MAX_TITLE_LENGTH}文字以内にしてください`);
  }

  if (!Number.isInteger(input.amount)) {
    throw new ValidationError('amount', '金額は整数で入力してください');
  }
  if (input.amount <= 0) {
    throw new ValidationError('amount', '金額は1以上で入力してください');
  }
  if (input.amount > MAX_AMOUNT) {
    throw new ValidationError('amount', `金額は${MAX_AMOUNT.toLocaleString('en-US')}以下にしてください`);
  }

  if (input.requesterId === '') {
    throw new ValidationError('requesterId', '申請者が指定されていません');
  }

  return { title, amount: input.amount, requesterId: input.requesterId };
}
