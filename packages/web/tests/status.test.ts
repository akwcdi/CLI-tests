import { describe, expect, it } from 'vitest';

import {
  eventLabel,
  eventTone,
  formatAmount,
  formatDateTime,
  initials,
  requestLabel,
  requestTone,
  userLabel,
  userTone,
} from '../src/status.ts';

describe('ユーザーの状態', () => {
  it.each([
    ['active', 'settled', '有効'],
    ['suspended', 'stopped', '停止中'],
  ] as const)('%s は %s / %s', (status, tone, label) => {
    expect(userTone(status)).toBe(tone);
    expect(userLabel(status)).toBe(label);
  });
});

describe('申請の状態', () => {
  it.each([
    ['draft', 'neutral', '下書き'],
    ['pending', 'pending', '承認待ち'],
    ['approved', 'settled', '承認済み'],
    ['rejected', 'stopped', '却下'],
  ] as const)('%s は %s / %s', (status, tone, label) => {
    expect(requestTone(status)).toBe(tone);
    expect(requestLabel(status)).toBe(label);
  });
});

describe('イベントの表示', () => {
  it.each([
    ['user.created', 'ユーザーを作成', 'neutral'],
    ['user.status_changed', '状態を変更', 'stopped'],
    ['user.deleted', 'ユーザーを削除', 'stopped'],
    ['user.logged_in', 'サインイン', 'neutral'],
    ['request.created', '申請を作成', 'neutral'],
    ['request.submitted', '承認へ提出', 'pending'],
    ['request.approved', '承認', 'settled'],
    ['request.rejected', '却下', 'stopped'],
  ] as const)('%s は「%s」/ %s', (type, label, tone) => {
    expect(eventLabel(type)).toBe(label);
    expect(eventTone(type)).toBe(tone);
  });

  it('知らない種別はそのまま出し、質感は neutral', () => {
    expect(eventLabel('something.new')).toBe('something.new');
    expect(eventTone('something.new')).toBe('neutral');
  });
});

describe('initials', () => {
  it('先頭の1文字を返す', () => {
    expect(initials('田中 太郎')).toBe('田');
  });

  it('前後の空白は無視する', () => {
    expect(initials('  Alice ')).toBe('A');
  });

  it('サロゲートペアでも1文字として扱う', () => {
    expect(initials('𠮷田')).toBe('𠮷');
  });

  it.each([[''], ['   ']])('空なら ? を返す: %s', (name) => {
    expect(initials(name)).toBe('?');
  });
});

describe('formatDateTime', () => {
  it('分までを 0 埋めして返す', () => {
    // ローカルタイムで組むので、桁の形だけを見る。
    expect(formatDateTime('2026-03-04T05:06:07.000Z')).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/,
    );
  });

  it('日時として読めない文字列はそのまま返す', () => {
    expect(formatDateTime('not-a-date')).toBe('not-a-date');
  });
});

describe('formatAmount', () => {
  it('3 桁区切りで円記号を付ける', () => {
    expect(formatAmount(1234567)).toBe('¥1,234,567');
  });

  it('区切りが不要な額でも形は同じ', () => {
    expect(formatAmount(500)).toBe('¥500');
  });
});
