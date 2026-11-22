/**
 * 「今の実装」「対応表」「実際のテスト」の照合規則。
 *
 * 入出力を持たない純粋な関数に閉じている。読み込みと表示は ledger.ts の担当。
 * 最初の 1 件で止めず、直すべきものをまとめて日本語で返す。
 */
import {
  normalizeParams,
  type Aspect,
  type ClientWrite,
  type Inventory,
  type InventoryItem,
} from './inventory.ts';
import type { TestRecord } from './test-ids.ts';

export const VIEWPORTS = ['pc', 'mobile'] as const;

export interface Scenario {
  id: string;
  title: string;
  status: 'implemented' | 'pending';
  pendingReason?: string;
  roles: string[];
  viewports: string[];
  aspects: Aspect[];
  covers: string[];
}

export interface LedgerException {
  key: string;
  aspect: Aspect;
  reason: string;
}

/** 導入時点で残っている不足。件数ではなく項目で持ち、増やせない。 */
export interface PendingBaseline {
  /** `<key>|<aspect>` の形。 */
  items: string[];
  /** status が pending のシナリオ ID。 */
  scenarios: string[];
}

export interface LedgerInput {
  generated: Inventory;
  committed: Inventory | null;
  extractionErrors: string[];
  testErrors: string[];
  scenarios: Scenario[];
  exceptions: LedgerException[];
  baseline: PendingBaseline;
  /** base ブランチの baseline。比較しないときは null。 */
  baseBaseline: PendingBaseline | null;
  /** 画面 → 確認済みのハンドラ数。 */
  surfaces: Record<string, number>;
  tests: TestRecord[];
}

export interface Finding {
  rule: string;
  message: string;
}

/** 種類ごとの必須観点。 */
export function requiredAspects(item: InventoryItem): Aspect[] {
  switch (item.kind) {
    case 'route':
    case 'link':
    case 'external':
      return ['normal'];
    case 'api':
      return ['normal', 'persist', 'invalid'];
    case 'flow':
      return item.writes === undefined ? ['normal'] : ['normal', 'persist', 'invalid'];
    case 'policy':
      return ['denied'];
    case 'surface':
      return [];
  }
}

const needKey = (key: string, aspect: Aspect): string => `${key}|${aspect}`;

/** 実装済みシナリオが確かめている `<key>|<aspect>` の集合。 */
function coveredNeeds(scenarios: readonly Scenario[]): Set<string> {
  const covered = new Set<string>();
  for (const scenario of scenarios) {
    if (scenario.status === 'implemented') {
      for (const key of scenario.covers) {
        for (const aspect of scenario.aspects) {
          covered.add(needKey(key, aspect));
        }
      }
    }
  }
  return covered;
}

function checkWrites(
  items: readonly InventoryItem[],
  clientWrites: readonly ClientWrite[],
): Finding[] {
  const findings: Finding[] = [];
  const server = new Set(
    items
      .filter((item) => item.kind === 'api')
      .map((item) => normalizeParams(item.key.slice('api:'.length))),
  );
  const client = new Set(
    clientWrites.map((write) => normalizeParams(`${write.http} ${write.path}`)),
  );
  for (const write of client) {
    if (!server.has(write)) {
      findings.push({ rule: 'writes', message: `画面が呼ぶ書き込み API がサーバーに無い: ${write}` });
    }
  }
  for (const write of server) {
    if (!client.has(write)) {
      findings.push({ rule: 'writes', message: `サーバーの書き込み API を画面が呼んでいない: ${write}` });
    }
  }
  return findings;
}

export function checkLedger(input: LedgerInput): Finding[] {
  const findings: Finding[] = [];
  const add = (rule: string, message: string): void => {
    findings.push({ rule, message });
  };
  const { generated, scenarios, exceptions, baseline } = input;
  const items = generated.items;
  const itemByKey = new Map(items.map((item) => [item.key, item]));

  for (const error of input.extractionErrors) {
    add('extract', error);
  }
  for (const error of input.testErrors) {
    add('tests', error);
  }

  // コミット済みの inventory が今のソースと一致するか。
  if (input.committed === null) {
    add('inventory', 'inventory.generated.json が無い。`--write` で生成してください');
  } else if (JSON.stringify(input.committed) !== JSON.stringify(generated)) {
    add('inventory', 'inventory.generated.json が古い。`--write` で生成し直し、差分に合わせて対応表を直してください');
  }

  const seen = new Set<string>();
  for (const scenario of scenarios) {
    if (seen.has(scenario.id)) {
      add('scenario', `シナリオ ID が重複している: ${scenario.id}`);
    }
    seen.add(scenario.id);
    if (scenario.status === 'pending' && (scenario.pendingReason ?? '').trim() === '') {
      add('reason', `${scenario.id}: pending の理由が空`);
    }
    if (scenario.status === 'implemented') {
      for (const viewport of VIEWPORTS) {
        if (!scenario.viewports.includes(viewport)) {
          add('viewport', `${scenario.id}: ${viewport} で確かめていない`);
        }
      }
    }
    for (const key of scenario.covers) {
      if (!itemByKey.has(key)) {
        add('dead-ref', `${scenario.id}: 実装に無い対象を指している: ${key}`);
      }
    }
  }

  const covered = coveredNeeds(scenarios);
  const excepted = new Set(exceptions.map((entry) => needKey(entry.key, entry.aspect)));
  const baselineItems = new Set(baseline.items);
  const needs = new Set<string>();

  // 対象と観点の漏れ。
  for (const item of items) {
    for (const aspect of requiredAspects(item)) {
      const need = needKey(item.key, aspect);
      needs.add(need);
      if (!covered.has(need) && !excepted.has(need) && !baselineItems.has(need)) {
        add('coverage', `確かめていない: ${item.key} の ${aspect}`);
      }
      if (covered.has(need) && baselineItems.has(need)) {
        add('stale-baseline', `もう満たしているので baseline から消す: ${need}`);
      }
    }
  }

  // 例外と baseline の後始末。
  for (const entry of exceptions) {
    const need = needKey(entry.key, entry.aspect);
    if (!itemByKey.has(entry.key)) {
      add('dead-ref', `例外が実装に無い対象を指している: ${entry.key}`);
    } else if (!needs.has(need)) {
      add('stale-exception', `必須でない観点の例外は要らない: ${need}`);
    } else if (covered.has(need)) {
      add('stale-exception', `テストで確かめているので例外は要らない: ${need}`);
    }
    if (entry.reason.trim() === '') {
      add('reason', `例外の理由が空: ${need}`);
    }
  }
  for (const need of baseline.items) {
    if (!needs.has(need)) {
      add('dead-ref', `baseline が実装に無い対象を指している: ${need}`);
    }
  }

  // ハンドラ数が変わったら、関連シナリオを見直してから数を更新する。
  for (const surface of items.filter((item) => item.kind === 'surface')) {
    const name = surface.key.slice('surface:'.length);
    const recorded = input.surfaces[name];
    if (recorded === undefined) {
      add('surface', `surfaces.json に無い画面: ${name}`);
    } else if (recorded !== surface.handlers) {
      add('surface', `${name}: ハンドラ数が ${recorded} から ${surface.handlers} に変わった。シナリオを見直して更新する`);
    }
  }
  for (const name of Object.keys(input.surfaces)) {
    if (!itemByKey.has(`surface:${name}`)) {
      add('dead-ref', `surfaces.json が実装に無い画面を指している: ${name}`);
    }
  }

  // シナリオとテストの対応。
  const scenarioIds = new Set(scenarios.map((scenario) => scenario.id));
  const testedIds = new Set(input.tests.map((test) => test.id));
  for (const scenario of scenarios) {
    if (scenario.status === 'implemented' && !testedIds.has(scenario.id)) {
      add('tests', `${scenario.id}: 実装済みなのにテストが無い`);
    }
    if (scenario.status === 'pending' && testedIds.has(scenario.id)) {
      add('stale-baseline', `${scenario.id}: テストがあるので implemented にする`);
    }
  }
  for (const test of input.tests) {
    if (!scenarioIds.has(test.id)) {
      add('tests', `対応表に無いシナリオのテスト: ${test.id}（${test.file}）`);
    }
  }

  findings.push(...checkWrites(items, generated.clientWrites));

  // baseline は減らせても増やせない。
  const pendingIds = new Set(
    scenarios.filter((scenario) => scenario.status === 'pending').map((scenario) => scenario.id),
  );
  const baselineScenarios = new Set(baseline.scenarios);
  for (const id of pendingIds) {
    if (!baselineScenarios.has(id)) {
      add('baseline', `${id}: pending は baseline に載せる必要がある`);
    }
  }
  for (const id of baselineScenarios) {
    if (!pendingIds.has(id)) {
      add('stale-baseline', `${id}: pending ではないので baseline から消す`);
    }
  }
  if (input.baseBaseline !== null) {
    const baseItems = new Set(input.baseBaseline.items);
    const baseScenarios = new Set(input.baseBaseline.scenarios);
    for (const need of baselineItems) {
      if (!baseItems.has(need)) {
        add('baseline', `baseline に新しい不足を足さない: ${need}`);
      }
    }
    for (const id of baselineScenarios) {
      if (!baseScenarios.has(id)) {
        add('baseline', `baseline に新しい pending を足さない: ${id}`);
      }
    }
  }

  return findings;
}
