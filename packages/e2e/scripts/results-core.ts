import type { Scenario } from './ledger-core.ts';

/** Playwright の JSON レポートのうち、ここで読む部分。 */
export interface JsonSuite {
  suites?: JsonSuite[];
  specs?: {
    tags?: string[];
    tests?: { projectName: string; status: string }[];
  }[];
}

export interface ResultSummary {
  passed: number;
  /** 再試行で通ったもの。成功に数えるが隠さない。 */
  flaky: string[];
  /** 失敗とスキップ。スキップは成功に数えない。 */
  failed: string[];
  /** 実行されなかった組み合わせ。 */
  notRun: string[];
}

/** レポートと対応表を突き合わせ、シナリオ × ビューポートの単位で数える。 */
export function summarizeResults(
  report: { suites?: JsonSuite[] },
  scenarios: readonly Scenario[],
): ResultSummary {
  const ran = new Set<string>();
  const summary: ResultSummary = { passed: 0, flaky: [], failed: [], notRun: [] };

  const visit = (suite: JsonSuite): void => {
    for (const spec of suite.specs ?? []) {
      const ids = (spec.tags ?? []).filter((tag) => /^[A-Z]+-\d{3}$/.test(tag));
      for (const test of spec.tests ?? []) {
        for (const id of ids) {
          const entry = `${id} ${test.projectName}`;
          ran.add(entry);
          if (test.status === 'expected') {
            summary.passed += 1;
          } else if (test.status === 'flaky') {
            summary.flaky.push(entry);
          } else {
            summary.failed.push(`${entry} ${test.status}`);
          }
        }
      }
    }
    (suite.suites ?? []).forEach(visit);
  };
  (report.suites ?? []).forEach(visit);

  for (const scenario of scenarios) {
    if (scenario.status === 'implemented') {
      for (const viewport of scenario.viewports) {
        if (!ran.has(`${scenario.id} ${viewport}`)) {
          summary.notRun.push(`${scenario.id} ${viewport}`);
        }
      }
    }
  }
  return summary;
}
