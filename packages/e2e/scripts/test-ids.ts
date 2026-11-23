/**
 * spec ファイルから、テストとシナリオ ID の対応を集める。
 *
 * タグの付いていないテスト、skip / only / fixme はここでエラーにする。
 * スキップは成功扱いにしないので、そもそも書けないようにしておく。
 */
import ts from 'typescript';

import type { SourceFile } from './inventory.ts';

export interface TestRecord {
  id: string;
  file: string;
  title: string;
}

const ID_TAG = /^@([A-Z]+-\d{3})$/;
const BANNED = new Set(['skip', 'only', 'fixme', 'fail']);

function tagsOf(details: ts.Expression | undefined): string[] {
  if (details === undefined || !ts.isObjectLiteralExpression(details)) {
    return [];
  }
  for (const property of details.properties) {
    if (ts.isPropertyAssignment(property) && property.name.getText() === 'tag') {
      const value = property.initializer;
      if (ts.isStringLiteralLike(value)) {
        return [value.text];
      }
      if (ts.isArrayLiteralExpression(value)) {
        return value.elements.filter(ts.isStringLiteralLike).map((element) => element.text);
      }
    }
  }
  return [];
}

export function extractTests(files: readonly SourceFile[]): {
  tests: TestRecord[];
  errors: string[];
} {
  const tests: TestRecord[] = [];
  const errors: string[] = [];

  for (const file of files) {
    const source = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.ES2022, true);

    for (const statement of source.statements) {
      if (
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        statement.moduleSpecifier.text === '@playwright/test' &&
        statement.importClause?.isTypeOnly !== true
      ) {
        errors.push(`${file.path}: test は ./fixtures.ts から import する（外部送信ガードが効かないため）`);
      }
    }

    const visit = (node: ts.Node): void => {
      if (
        ts.isPropertyAccessExpression(node) &&
        BANNED.has(node.name.text) &&
        node.expression.getText().split('.')[0] === 'test'
      ) {
        errors.push(`${file.path}: test.${node.name.text} は使わない`);
      }
      if (ts.isCallExpression(node) && node.expression.getText() === 'test') {
        const [titleArg, details] = node.arguments;
        const title = titleArg !== undefined && ts.isStringLiteralLike(titleArg) ? titleArg.text : '';
        const ids = tagsOf(details)
          .map((tag) => ID_TAG.exec(tag)?.[1])
          .filter((id) => id !== undefined);
        if (ids.length === 0) {
          errors.push(`${file.path}: シナリオ ID のタグが無いテスト: ${title}`);
        }
        for (const id of ids) {
          tests.push({ id, file: file.path, title });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return { tests, errors };
}
