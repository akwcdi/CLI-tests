import type { RequestStatus, UserStatus } from './types.ts';

/**
 * 状態レールの質感。色ではなく意味で名前を付けているので、
 * 新しい状態が増えても表示側を触らずに済む。
 *
 *   pending … 進行中（破線）
 *   settled … 確定（実線）
 *   stopped … 停止・却下（斜線）
 *   neutral … まだ動いていない
 */
export type Tone = 'pending' | 'settled' | 'stopped' | 'neutral';

export function userTone(status: UserStatus): Tone {
  return status === 'active' ? 'settled' : 'stopped';
}

export function userLabel(status: UserStatus): string {
  return status === 'active' ? '有効' : '停止中';
}

const REQUEST_TONE: Record<RequestStatus, Tone> = {
  draft: 'neutral',
  pending: 'pending',
  approved: 'settled',
  rejected: 'stopped',
};

const REQUEST_LABEL: Record<RequestStatus, string> = {
  draft: '下書き',
  pending: '承認待ち',
  approved: '承認済み',
  rejected: '却下',
};

export function requestTone(status: RequestStatus): Tone {
  return REQUEST_TONE[status];
}

export function requestLabel(status: RequestStatus): string {
  return REQUEST_LABEL[status];
}

/** 監査イベントの種別を、画面に出す日本語にする。 */
const EVENT_LABEL: Record<string, string> = {
  'user.created': 'ユーザーを作成',
  'user.status_changed': '状態を変更',
  'user.deleted': 'ユーザーを削除',
  'user.logged_in': 'サインイン',
  'request.created': '申請を作成',
  'request.submitted': '承認へ提出',
  'request.approved': '承認',
  'request.rejected': '却下',
};

const EVENT_TONE: Record<string, Tone> = {
  'user.status_changed': 'stopped',
  'user.deleted': 'stopped',
  'request.submitted': 'pending',
  'request.approved': 'settled',
  'request.rejected': 'stopped',
};

export function eventLabel(type: string): string {
  return EVENT_LABEL[type] ?? type;
}

export function eventTone(type: string): Tone {
  return EVENT_TONE[type] ?? 'neutral';
}

/**
 * アバターに出す頭文字。氏名が空でも 1 文字は返す。
 * サロゲートペアを 1 文字として扱うため、コードポイントで切る。
 */
export function initials(name: string): string {
  const [first] = [...name.trim()];
  return first ?? '?';
}

/**
 * 表示用の氏名。アカウントを消しても申請は残るので、名前だけが引けない
 * 行が出る。申請者と決裁者で同じ言い方をする。
 */
export function personName(name: string | null): string {
  return name ?? '（削除済みの利用者）';
}

/** ISO 日時を画面用に整える。等幅で並ぶことを前提に桁を固定する。 */
export function formatDateTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) {
    return iso;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/** 金額。3 桁区切り。 */
export function formatAmount(amount: number): string {
  return `¥${amount.toLocaleString('ja-JP')}`;
}
