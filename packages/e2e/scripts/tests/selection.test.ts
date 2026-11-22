import { describe, expect, it } from 'vitest';

import type { Scenario } from '../ledger-core.ts';
import { summarizeResults } from '../results-core.ts';
import { selectScenarios } from '../select.ts';
import { extractTests } from '../test-ids.ts';

const scenario = (id: string, covers: string[], status: Scenario['status'] = 'implemented'): Scenario => ({
  id,
  title: id,
  status,
  roles: ['member'],
  viewports: ['pc', 'mobile'],
  aspects: ['normal'],
  covers,
});
const scenarios = [
  scenario('USER-001', ['flow:pages/UsersPage.tsx#op:save']),
  scenario('REQ-001', ['link:pages/RequestsPage.tsx#/requests/new']),
  scenario('AUTH-001', [], 'pending'),
];
const tests = [{ id: 'REQ-001', file: 'packages/e2e/tests/requests.spec.ts', title: 't' }];

describe('selectScenarios', () => {
  it('画面の変更は、その画面を指すシナリオだけを選ぶ', () => {
    expect(selectScenarios(['packages/web/src/pages/UsersPage.tsx'], scenarios, tests)).toEqual({
      all: false,
      ids: ['USER-001'],
      reasons: [],
    });
  });

  it('spec の変更は、その spec のシナリオを選ぶ', () => {
    expect(selectScenarios(['packages/e2e/tests/requests.spec.ts'], scenarios, tests).ids).toEqual(['REQ-001']);
  });

  it('E2E に関係しない変更では何も選ばない', () => {
    const changed = ['README.md', 'packages/core/tests/user.test.ts', 'packages/e2e/ledger/scenarios.json'];

    expect(selectScenarios(changed, scenarios, tests)).toEqual({ all: false, ids: [], reasons: [] });
  });

  it.each([
    'packages/app/src/app.ts',
    'packages/core/src/user.ts',
    'packages/web/src/api.ts',
    'packages/web/src/pages/NoScenarioPage.tsx',
    'packages/e2e/setup/env.ts',
  ])('どの画面が使うか絞れない %s では、実装済みの全シナリオを選ぶ', (file) => {
    const selection = selectScenarios([file], scenarios, tests);

    expect(selection.all).toBe(true);
    expect(selection.ids).toEqual(['USER-001', 'REQ-001']);
    expect(selection.reasons).toEqual([file]);
  });
});

describe('extractTests', () => {
  const extract = (text: string) => extractTests([{ path: 'a.spec.ts', text }]);

  it('タグからシナリオ ID を集める', () => {
    const { tests: found, errors } = extract(`
      import { test } from './fixtures.ts';
      test.describe('x', () => {
        test('t1', { tag: '@A-001' }, async () => {});
        test('t2', { tag: ['@slow', '@A-002'] }, async () => {});
      });
    `);

    expect(errors).toEqual([]);
    expect(found.map((record) => record.id)).toEqual(['A-001', 'A-002']);
  });

  it('タグの無いテストをエラーにする', () => {
    expect(extract(`test('t', async () => {});`).errors[0]).toContain('タグが無いテスト: t');
  });

  it.each(['test.skip', 'test.only', 'test.fixme', 'test.describe.skip', 'test.describe.only'])(
    '%s をエラーにする',
    (call) => {
      expect(extract(`${call}('t', { tag: '@A-001' }, async () => {});`).errors.join()).toContain('は使わない');
    },
  );

  it('テスト本体の中の test.skip() もエラーにする', () => {
    const { errors } = extract(`test('t', { tag: '@A-001' }, async () => { test.skip(); });`);

    expect(errors.join()).toContain('test.skip は使わない');
  });

  it('@playwright/test の test を直接使うとエラーにする', () => {
    expect(extract(`import { test } from '@playwright/test';`).errors.join()).toContain('fixtures.ts');
    expect(extract(`import type { Page } from '@playwright/test';`).errors).toEqual([]);
  });
});

describe('summarizeResults', () => {
  const implemented = [scenario('A-001', []), scenario('B-001', []), scenario('C-001', [], 'pending')];
  const report = (status: string, projects = ['pc', 'mobile']) => ({
    suites: [
      {
        suites: [
          {
            specs: [
              {
                tags: ['A-001'],
                tests: projects.map((projectName) => ({ projectName, status })),
              },
            ],
          },
        ],
      },
    ],
  });

  it('成功をシナリオ × ビューポートで数え、未実施を分ける', () => {
    const summary = summarizeResults(report('expected'), implemented);

    expect(summary.passed).toBe(2);
    expect(summary.failed).toEqual([]);
    expect(summary.notRun).toEqual(['B-001 pc', 'B-001 mobile']);
  });

  it('スキップは成功に数えない', () => {
    const summary = summarizeResults(report('skipped'), implemented);

    expect(summary.passed).toBe(0);
    expect(summary.failed).toEqual(['A-001 pc skipped', 'A-001 mobile skipped']);
  });

  it('再試行で通ったものを flaky として残す', () => {
    expect(summarizeResults(report('flaky', ['pc']), implemented).flaky).toEqual(['A-001 pc']);
  });

  it('片方のビューポートだけ実行したら、もう片方を未実施にする', () => {
    expect(summarizeResults(report('expected', ['pc']), implemented).notRun).toContain('A-001 mobile');
  });
});
