/**
 * 変更ファイルから、回すべきシナリオを選ぶ。
 *
 * 普段は変更に関係するものだけ回す。どの画面が使うか絞れない共通処理や
 * API を触ったときは、見落とすより全部回す方を選ぶ。
 */
import type { Scenario } from './ledger-core.ts';
import type { TestRecord } from './test-ids.ts';

const WEB_SRC = 'packages/web/src/';
const SCREEN_FILES = /^packages\/web\/src\/(pages|components)\//;
/** E2E の結果に影響しないファイル。 */
const UNRELATED = [
  /\.md$/,
  /^\.claude\//,
  /^\.github\//,
  /^it-tests\//,
  /^packages\/[^/]+\/tests\/.*\.test\.tsx?$/,
  /^packages\/e2e\/(ledger|scripts)\//,
  /^vitest\.config/,
];

export interface Selection {
  all: boolean;
  ids: string[];
  /** 全件に倒した理由になったファイル。 */
  reasons: string[];
}

export function selectScenarios(
  changed: readonly string[],
  scenarios: readonly Scenario[],
  tests: readonly TestRecord[],
): Selection {
  const implemented = scenarios.filter((scenario) => scenario.status === 'implemented');
  const ids = new Set<string>();
  const reasons: string[] = [];

  for (const file of changed) {
    if (UNRELATED.some((pattern) => pattern.test(file))) {
      continue;
    }
    if (file.startsWith('packages/e2e/tests/') && file.endsWith('.spec.ts')) {
      for (const test of tests) {
        if (test.file === file) {
          ids.add(test.id);
        }
      }
      continue;
    }
    const short = file.slice(WEB_SRC.length);
    const related = SCREEN_FILES.test(file)
      ? implemented.filter((scenario) =>
          scenario.covers.some(
            (key) => key.startsWith(`flow:${short}#`) || key.startsWith(`link:${short}#`),
          ),
        )
      : [];
    if (related.length === 0) {
      reasons.push(file);
    }
    for (const scenario of related) {
      ids.add(scenario.id);
    }
  }

  if (reasons.length > 0) {
    return { all: true, ids: implemented.map((scenario) => scenario.id), reasons };
  }
  return { all: false, ids: [...ids].sort(), reasons };
}
