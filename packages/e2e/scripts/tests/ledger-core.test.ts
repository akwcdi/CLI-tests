import { describe, expect, it } from 'vitest';

import type { InventoryItem } from '../inventory.ts';
import { checkLedger, type LedgerInput, type Scenario } from '../ledger-core.ts';

const SAVE = 'flow:pages/A.tsx#op:save';
const API = 'api:POST /api/a';
const ROUTE = 'route:/a';
const items: InventoryItem[] = [
  { key: API, kind: 'api', file: 'a' },
  { key: SAVE, kind: 'flow', file: 'a', writes: ['POST /api/a'] },
  { key: ROUTE, kind: 'route', file: 'a' },
  { key: 'surface:pages/A.tsx', kind: 'surface', file: 'a', handlers: 2 },
];
const inventory = { items, clientWrites: [{ method: 'a', http: 'POST', path: '/api/a' }] };

const scenario = (overrides: Partial<Scenario> = {}): Scenario => ({
  id: 'A-001',
  title: 't',
  status: 'implemented',
  roles: ['member'],
  viewports: ['pc', 'mobile'],
  aspects: ['normal', 'persist', 'invalid'],
  covers: [API, SAVE, ROUTE],
  ...overrides,
});

const input = (overrides: Partial<LedgerInput> = {}): LedgerInput => ({
  generated: inventory,
  committed: inventory,
  extractionErrors: [],
  testErrors: [],
  scenarios: [scenario()],
  exceptions: [],
  baseline: { items: [], scenarios: [] },
  baseBaseline: null,
  surfaces: { 'pages/A.tsx': 2 },
  tests: [{ id: 'A-001', file: 'a.spec.ts', title: 't' }],
  ...overrides,
});

const rules = (overrides: Partial<LedgerInput>) =>
  checkLedger(input(overrides)).map((finding) => finding.rule);
const messages = (overrides: Partial<LedgerInput>) =>
  checkLedger(input(overrides))
    .map((finding) => finding.message)
    .join('\n');

describe('checkLedger', () => {
  it('実装・対応表・テストが揃っていれば何も報告しない', () => {
    expect(checkLedger(input())).toEqual([]);
  });

  it('抽出エラーを報告する', () => {
    expect(rules({ extractionErrors: ['読めない'] })).toEqual(['extract']);
    expect(rules({ testErrors: ['タグが無い'] })).toEqual(['tests']);
  });

  it('コミット済みの inventory がソースと違えば落とす', () => {
    expect(rules({ committed: null })).toEqual(['inventory']);
    expect(rules({ committed: { items: [], clientWrites: [] } })).toEqual(['inventory']);
  });

  it('必須観点の漏れを観点単位で報告する', () => {
    const text = messages({ scenarios: [scenario({ aspects: ['normal', 'persist'] })] });

    expect(text).toContain(`確かめていない: ${SAVE} の invalid`);
    expect(text).toContain(`確かめていない: ${API} の invalid`);
    expect(text).not.toContain('の persist');
  });

  it('pending のシナリオでは対象を確かめたことにしない', () => {
    const text = messages({
      scenarios: [scenario({ status: 'pending', pendingReason: '未実装' })],
      tests: [],
      baseline: { items: [], scenarios: ['A-001'] },
    });

    expect(text).toContain(`確かめていない: ${ROUTE} の normal`);
  });

  it('理由付きの例外や baseline は漏れに数えない', () => {
    const covers = [API, SAVE, ROUTE];
    const aspects = ['normal', 'persist'] as const;

    expect(
      rules({
        scenarios: [scenario({ covers, aspects: [...aspects] })],
        exceptions: [
          { key: API, aspect: 'invalid', reason: '入力が無い' },
          { key: SAVE, aspect: 'invalid', reason: '入力が無い' },
        ],
      }),
    ).toEqual([]);
    expect(
      rules({
        scenarios: [scenario({ covers, aspects: [...aspects] })],
        baseline: { items: [`${API}|invalid`, `${SAVE}|invalid`], scenarios: [] },
      }),
    ).toEqual([]);
  });

  it('消えた対象への参照を報告する', () => {
    const gone = 'flow:pages/Gone.tsx#op:x';

    expect(rules({ scenarios: [scenario({ covers: [API, SAVE, ROUTE, gone] })] })).toEqual(['dead-ref']);
    expect(rules({ exceptions: [{ key: gone, aspect: 'normal', reason: 'r' }] })).toEqual(['dead-ref']);
    expect(rules({ baseline: { items: [`${gone}|normal`], scenarios: [] } })).toEqual(['dead-ref']);
  });

  it('不要になった例外を報告する', () => {
    expect(rules({ exceptions: [{ key: API, aspect: 'normal', reason: 'r' }] })).toEqual(['stale-exception']);
    expect(rules({ exceptions: [{ key: ROUTE, aspect: 'persist', reason: 'r' }] })).toEqual(['stale-exception']);
  });

  it('理由の無い例外と pending を報告する', () => {
    expect(
      rules({
        scenarios: [scenario({ aspects: ['normal', 'persist'], covers: [ROUTE, API, SAVE] })],
        exceptions: [
          { key: API, aspect: 'invalid', reason: ' ' },
          { key: SAVE, aspect: 'invalid', reason: 'r' },
        ],
      }),
    ).toEqual(['reason']);
    expect(
      rules({
        scenarios: [scenario(), scenario({ id: 'A-002', status: 'pending' })],
        baseline: { items: [], scenarios: ['A-002'] },
      }),
    ).toEqual(['reason']);
  });

  it('満たされたのに残っている不足を報告する', () => {
    expect(rules({ baseline: { items: [`${ROUTE}|normal`], scenarios: [] } })).toEqual(['stale-baseline']);
    expect(rules({ baseline: { items: [], scenarios: ['A-001'] } })).toEqual(['stale-baseline']);
  });

  it('テストがあるのに pending のままのシナリオを報告する', () => {
    const scenarios = [
      scenario(),
      scenario({ id: 'A-002', status: 'pending', pendingReason: 'r', covers: [] }),
    ];

    expect(
      rules({
        scenarios,
        baseline: { items: [], scenarios: ['A-002'] },
        tests: [
          { id: 'A-001', file: 'a', title: 't' },
          { id: 'A-002', file: 'a', title: 't' },
        ],
      }),
    ).toEqual(['stale-baseline']);
  });

  it('ハンドラ数が確認済みの値と違えば、見直しを求める', () => {
    expect(messages({ surfaces: { 'pages/A.tsx': 1 } })).toContain('ハンドラ数が 1 から 2 に変わった');
    expect(rules({ surfaces: {} })).toEqual(['surface']);
    expect(rules({ surfaces: { 'pages/A.tsx': 2, 'pages/Gone.tsx': 1 } })).toEqual(['dead-ref']);
  });

  it('実装済みなのにテストが無いシナリオと、対応表に無いテストを報告する', () => {
    expect(messages({ tests: [] })).toContain('A-001: 実装済みなのにテストが無い');
    expect(
      messages({
        tests: [
          { id: 'A-001', file: 'a', title: 't' },
          { id: 'X-999', file: 'x.spec.ts', title: 't' },
        ],
      }),
    ).toContain('対応表に無いシナリオのテスト: X-999');
  });

  it('シナリオ ID の重複を報告する', () => {
    expect(rules({ scenarios: [scenario(), scenario()] })).toEqual(['scenario']);
  });

  it('PC とモバイルの片方しか確かめていなければ報告する', () => {
    expect(messages({ scenarios: [scenario({ viewports: ['pc'] })] })).toContain('A-001: mobile で確かめていない');
  });

  it('画面とサーバーの書き込み API の食い違いを報告する', () => {
    const generated = {
      items,
      clientWrites: [{ method: 'b', http: 'POST', path: '/api/b' }],
    };
    const text = messages({ generated, committed: generated });

    expect(text).toContain('画面が呼ぶ書き込み API がサーバーに無い: POST /api/b');
    expect(text).toContain('サーバーの書き込み API を画面が呼んでいない: POST /api/a');
  });

  it('pending を baseline に載せずに足せない', () => {
    expect(
      rules({
        scenarios: [scenario(), scenario({ id: 'A-002', status: 'pending', pendingReason: 'r', covers: [] })],
      }),
    ).toEqual(['baseline']);
  });

  it('base より不足を増やせない。1 件減らして別の 1 件を増やす形も検出する', () => {
    const scenarios = [scenario({ aspects: ['normal', 'persist'] })];
    const text = messages({
      scenarios,
      baseline: { items: [`${API}|invalid`, `${SAVE}|invalid`], scenarios: [] },
      baseBaseline: { items: [`${API}|invalid`, `${ROUTE}|persist`], scenarios: [] },
    });

    expect(text).toContain(`baseline に新しい不足を足さない: ${SAVE}|invalid`);
    expect(text).not.toContain(`足さない: ${API}|invalid`);
  });

  it('base より pending を増やせない', () => {
    expect(
      messages({
        scenarios: [scenario(), scenario({ id: 'A-002', status: 'pending', pendingReason: 'r', covers: [] })],
        baseline: { items: [], scenarios: ['A-002'] },
        baseBaseline: { items: [], scenarios: [] },
      }),
    ).toContain('baseline に新しい pending を足さない: A-002');
  });
});
