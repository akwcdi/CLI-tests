/**
 * 「E2E で確かめる対象」をソースから抜き出す。
 *
 * 型情報は使わず構文木だけを見る。読めない式を黙って飛ばすと検査をすり抜ける
 * 穴になるので、認識できないものは必ず errors に積む。
 */
import ts from 'typescript';

export type Aspect = 'normal' | 'persist' | 'invalid' | 'denied';

export interface InventoryItem {
  key: string;
  kind: 'route' | 'api' | 'flow' | 'link' | 'policy' | 'surface' | 'external';
  file: string;
  /** flow から呼ばれる書き込み API。 */
  writes?: string[];
  /** surface のハンドラ数。 */
  handlers?: number;
}

/** 画面側（api.ts）が呼ぶ書き込み API。サーバー側の定義と突き合わせる。 */
export interface ClientWrite {
  method: string;
  http: string;
  path: string;
}

export interface Inventory {
  items: InventoryItem[];
  clientWrites: ClientWrite[];
}

export interface SourceFile {
  /** リポジトリのルートからのパス。 */
  path: string;
  text: string;
}

const WEB_SRC = 'packages/web/src/';
const APP_SRC = 'packages/app/src/';
const CLIENT_FILE = `${WEB_SRC}api.ts`;
const WRITE_VERBS = new Set(['post', 'put', 'patch', 'delete']);
/** テキストで名付けられる要素。form や div の中身は操作の名前にならない。 */
const LABELLED_TAGS = new Set(['button', 'a']);
/** 入力欄の下書き更新。保存操作ではないので flow にせず surface でだけ数える。 */
const DRAFT_EVENTS = new Set(['onChange', 'onInput']);

const parse = (file: SourceFile): ts.SourceFile =>
  ts.createSourceFile(
    file.path,
    file.text,
    ts.ScriptTarget.ES2022,
    true,
    file.path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

/** 文字列かテンプレートを、`${...}` を `:p` に置き換えたパスにする。読めなければ null。 */
function toPathPattern(node: ts.Node): string | null {
  if (ts.isStringLiteralLike(node)) {
    return node.text;
  }
  if (ts.isTemplateExpression(node)) {
    return [node.head.text, ...node.templateSpans.map((span) => `:p${span.literal.text}`)].join('');
  }
  return null;
}

/** `/users/:id` と `/users/:p` を同じ形にする。 */
export const normalizeParams = (path: string): string => path.replace(/:[^/ ]+/g, ':p');

function findRoute(path: string, routes: readonly string[]): string | undefined {
  const target = normalizeParams(path.split(/[?#]/)[0] ?? path);
  // /requests/new と /requests/:id が両方当たるときは静的な方を優先する。
  return (
    routes.find((route) => route === target) ??
    routes.find((route) => route !== '*' && normalizeParams(route) === target)
  );
}

function jsxAttribute(
  opening: ts.JsxOpeningLikeElement,
  name: string,
): ts.Expression | undefined {
  for (const property of opening.attributes.properties) {
    if (ts.isJsxAttribute(property) && property.name.getText() === name && property.initializer) {
      return ts.isJsxExpression(property.initializer)
        ? property.initializer.expression
        : property.initializer;
    }
  }
  return undefined;
}

/** 要素に直接書かれた表示文字列。aria-hidden の中は読み上げられないので数えない。 */
function staticText(element: ts.JsxElement): string {
  const parts: string[] = [];
  for (const child of element.children) {
    if (ts.isJsxText(child)) {
      parts.push(child.text.trim());
    } else if (ts.isJsxExpression(child) && child.expression !== undefined) {
      const expression = child.expression;
      if (ts.isStringLiteralLike(expression)) {
        parts.push(expression.text);
      } else if (
        ts.isConditionalExpression(expression) &&
        ts.isStringLiteralLike(expression.whenTrue) &&
        ts.isStringLiteralLike(expression.whenFalse)
      ) {
        parts.push(`${expression.whenTrue.text}|${expression.whenFalse.text}`);
      }
    } else if (ts.isJsxElement(child)) {
      const hidden = jsxAttribute(child.openingElement, 'aria-hidden');
      if (hidden === undefined || !ts.isStringLiteralLike(hidden) || hidden.text !== 'true') {
        parts.push(staticText(child));
      }
    }
  }
  return parts.filter((part) => part !== '').join(' ');
}

/** ハンドラが呼ぶ関数の名前。`handleX` / `() => void handleX(y)` の形だけを読む。 */
function handlerName(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  if (!ts.isArrowFunction(expression) && !ts.isFunctionExpression(expression)) {
    return null;
  }
  let body: ts.Node = expression.body;
  if (ts.isBlock(body)) {
    const only = body.statements.length === 1 ? body.statements[0] : undefined;
    if (only === undefined || !ts.isExpressionStatement(only)) {
      return null;
    }
    body = only.expression;
  }
  if (ts.isVoidExpression(body)) {
    body = body.expression;
  }
  return ts.isCallExpression(body) && ts.isIdentifier(body.expression)
    ? body.expression.text
    : null;
}

/** ハンドラの中から呼ばれる `api.xxx` を、同じファイルの関数を辿りながら集める。 */
function apiCalls(root: ts.Node, source: ts.SourceFile): Set<string> {
  const functions = new Map<string, ts.Node>();
  walk(source, (node) => {
    if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
      functions.set(node.name.text, node);
    }
  });

  const calls = new Set<string>();
  const seen = new Set<ts.Node>();
  const visit = (start: ts.Node): void => {
    if (seen.has(start)) {
      return;
    }
    seen.add(start);
    walk(start, (node) => {
      if (
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'api'
      ) {
        calls.add(node.name.text);
      }
      if (ts.isIdentifier(node)) {
        const target = functions.get(node.text);
        if (target !== undefined) {
          visit(target);
        }
      }
    });
  };
  visit(root);
  return calls;
}

function readHttpMethod(init: ts.Expression): string | null {
  if (
    ts.isCallExpression(init) &&
    init.expression.getText() === 'jsonInit' &&
    init.arguments[0] !== undefined &&
    ts.isStringLiteralLike(init.arguments[0])
  ) {
    return init.arguments[0].text;
  }
  if (ts.isObjectLiteralExpression(init)) {
    for (const property of init.properties) {
      if (
        ts.isPropertyAssignment(property) &&
        property.name.getText() === 'method' &&
        ts.isStringLiteralLike(property.initializer)
      ) {
        return property.initializer.text;
      }
    }
  }
  return null;
}

function extractClientWrites(file: SourceFile, errors: string[]): ClientWrite[] {
  const writes: ClientWrite[] = [];
  walk(parse(file), (node) => {
    // 第2引数の無い request() は GET。
    if (!ts.isCallExpression(node) || node.expression.getText() !== 'request') {
      return;
    }
    const [pathArg, init] = node.arguments;
    if (pathArg === undefined || init === undefined) {
      return;
    }
    const http = readHttpMethod(init);
    const path = toPathPattern(pathArg);
    let owner: ts.Node = node;
    while (!ts.isMethodDeclaration(owner) && owner.parent !== undefined) {
      owner = owner.parent;
    }
    if (http === null || path === null || !ts.isMethodDeclaration(owner)) {
      errors.push(`${file.path}: 読めない API 呼び出し: ${node.getText()}`);
      return;
    }
    writes.push({ method: owner.name.getText(), http, path });
  });
  return writes;
}

function extractServerRoutes(file: SourceFile, items: InventoryItem[], errors: string[]): void {
  walk(parse(file), (node) => {
    if (
      !ts.isCallExpression(node) ||
      !ts.isPropertyAccessExpression(node.expression) ||
      node.expression.expression.getText() !== 'app'
    ) {
      return;
    }
    const verb = node.expression.name.text;
    const pathArg = node.arguments[0];
    if (verb === 'all' || verb === 'on') {
      errors.push(`${file.path}: app.${verb} は書き込みかどうか判定できない: ${node.getText()}`);
      return;
    }
    if (verb === 'use') {
      const guard = node.arguments[1];
      if (
        pathArg !== undefined &&
        ts.isStringLiteralLike(pathArg) &&
        guard !== undefined &&
        ts.isCallExpression(guard) &&
        guard.expression.getText() === 'requireSession'
      ) {
        items.push({ key: `policy:api#${pathArg.text}`, kind: 'policy', file: file.path });
      }
      return;
    }
    if (!WRITE_VERBS.has(verb)) {
      return;
    }
    if (pathArg === undefined || !ts.isStringLiteralLike(pathArg)) {
      errors.push(`${file.path}: パスを読めない API 定義: ${node.getText().slice(0, 80)}`);
      return;
    }
    items.push({
      key: `api:${verb.toUpperCase()} ${pathArg.text}`,
      kind: 'api',
      file: file.path,
    });
  });
}

function extractRoutes(file: SourceFile, items: InventoryItem[], errors: string[]): void {
  walk(parse(file), (node) => {
    if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) {
      return;
    }
    if (node.tagName.getText() !== 'Route') {
      return;
    }
    const path = jsxAttribute(node, 'path');
    if (path === undefined || !ts.isStringLiteralLike(path)) {
      errors.push(`${file.path}: パスを読めない Route: ${node.getText()}`);
      return;
    }
    items.push({ key: `route:${path.text}`, kind: 'route', file: file.path });
    const element = jsxAttribute(node, 'element');
    if (
      element !== undefined &&
      ts.isCallExpression(element) &&
      element.expression.getText() === 'guarded'
    ) {
      items.push({ key: `policy:route#${path.text}`, kind: 'policy', file: file.path });
    }
  });
}

function extractScreen(
  file: SourceFile,
  routes: readonly string[],
  clientWrites: readonly ClientWrite[],
  items: InventoryItem[],
  errors: string[],
): void {
  const short = file.path.slice(WEB_SRC.length);
  const source = parse(file);
  const writeByMethod = new Map(clientWrites.map((write) => [write.method, write]));

  const addLink = (target: ts.Node): void => {
    const path = toPathPattern(target);
    if (path === null) {
      errors.push(`${file.path}: リンク先を読めない: ${target.getText()}`);
      return;
    }
    // 外部 URL は extractExternals が拾う。
    if (/^https?:/.test(path)) {
      return;
    }
    const route = findRoute(path, routes);
    if (route === undefined) {
      errors.push(`${file.path}: リンク先のルートが無い: ${path}`);
      return;
    }
    items.push({ key: `link:${short}#${route}`, kind: 'link', file: file.path });
  };

  const addFlow = (node: ts.JsxOpeningLikeElement, tag: string, event: string): void => {
    const handler = jsxAttribute(node, event);
    if (handler === undefined) {
      errors.push(`${file.path}: 読めないハンドラ: <${tag} ${event}>`);
      return;
    }
    const text =
      LABELLED_TAGS.has(tag) && ts.isJsxOpeningElement(node) ? staticText(node.parent) : '';
    const testId = jsxAttribute(node, 'data-testid');
    const name = handlerName(handler);
    let label: string;
    if (text !== '') {
      label = `ui:${text}`;
    } else if (testId !== undefined && ts.isStringLiteralLike(testId)) {
      label = `testid:${testId.text}`;
    } else if (name !== null) {
      label = `op:${name}`;
    } else {
      errors.push(`${file.path}: 名付けられない操作: ${handler.getText()}`);
      return;
    }
    const writes = [...apiCalls(handler, source)]
      .map((method) => writeByMethod.get(method))
      .filter((write) => write !== undefined)
      .map((write) => `${write.http} ${write.path}`)
      .sort();
    items.push({
      key: `flow:${short}#${label}`,
      kind: 'flow',
      file: file.path,
      ...(writes.length > 0 ? { writes } : {}),
    });
  };

  let handlers = 0;
  walk(source, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'addEventListener'
    ) {
      errors.push(`${file.path}: JSX の外のイベント登録は抽出できない: ${node.getText()}`);
    }
    if (ts.isCallExpression(node) && node.expression.getText() === 'navigate' && node.arguments[0]) {
      addLink(node.arguments[0]);
    }
    if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) {
      return;
    }
    const tag = node.tagName.getText();
    if (tag === 'Link' || tag === 'Navigate' || tag === 'a') {
      const target = jsxAttribute(node, tag === 'a' ? 'href' : 'to');
      if (target !== undefined) {
        addLink(target);
      }
    }
    for (const property of node.attributes.properties) {
      if (!ts.isJsxAttribute(property) || !/^on[A-Z]/.test(property.name.getText())) {
        continue;
      }
      handlers += 1;
      // 大文字のタグは props の受け渡しで、操作の実体は渡した先の要素にある。
      if (!DRAFT_EVENTS.has(property.name.getText()) && !/^[A-Z]/.test(tag)) {
        addFlow(node, tag, property.name.getText());
      }
    }
  });

  if (handlers > 0) {
    items.push({ key: `surface:${short}`, kind: 'surface', file: file.path, handlers });
  }
}

/** ブラウザやサーバーの外へ出ていく口。今は 1 つも無いことを含めて検査する。 */
function extractExternals(file: SourceFile, items: InventoryItem[]): void {
  const add = (what: string): void => {
    items.push({ key: `external:${file.path}#${what}`, kind: 'external', file: file.path });
  };
  if (file.path.endsWith('.html')) {
    for (const match of file.text.matchAll(/(?:src|href)="(https?:[^"]+)"/g)) {
      add(match[1] as string);
    }
    return;
  }
  walk(parse(file), (node) => {
    if (ts.isStringLiteralLike(node) && /^https?:\/\//.test(node.text)) {
      add(node.text);
    }
    if (
      ts.isNewExpression(node) &&
      /^(WebSocket|EventSource|XMLHttpRequest)$/.test(node.expression.getText())
    ) {
      add(node.expression.getText());
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText();
      if (callee === 'navigator.sendBeacon' || (callee === 'fetch' && file.path !== CLIENT_FILE)) {
        add(callee);
      }
    }
  });
}

const byKey = (a: InventoryItem, b: InventoryItem): number =>
  a.key < b.key ? -1 : a.key > b.key ? 1 : 0;

export function extractInventory(files: readonly SourceFile[]): {
  inventory: Inventory;
  errors: string[];
} {
  const errors: string[] = [];
  const items: InventoryItem[] = [];
  const isSource = (file: SourceFile): boolean => /\.tsx?$/.test(file.path);

  const client = files.find((file) => file.path === CLIENT_FILE);
  if (client === undefined) {
    errors.push(`${CLIENT_FILE} が無い`);
  }
  const clientWrites = client === undefined ? [] : extractClientWrites(client, errors);

  const webFiles = files.filter((file) => file.path.startsWith(WEB_SRC) && isSource(file));
  for (const file of webFiles) {
    extractRoutes(file, items, errors);
  }
  const routes = items
    .filter((item) => item.kind === 'route')
    .map((item) => item.key.slice('route:'.length));
  if (routes.length === 0) {
    errors.push('ルートを 1 つも抽出できなかった');
  }

  for (const file of webFiles) {
    extractScreen(file, routes, clientWrites, items, errors);
  }
  for (const file of files) {
    if (file.path.startsWith(APP_SRC) && isSource(file)) {
      extractServerRoutes(file, items, errors);
    }
    extractExternals(file, items);
  }

  // 同じ操作が複数箇所にあっても対応表上は 1 件。実数は surface が持つ。
  const unique = new Map<string, InventoryItem>();
  for (const item of items) {
    const existing = unique.get(item.key);
    if (existing === undefined) {
      unique.set(item.key, item);
    } else if (item.writes !== undefined) {
      existing.writes = [...new Set([...(existing.writes ?? []), ...item.writes])].sort();
    }
  }
  return {
    inventory: {
      items: [...unique.values()].sort(byKey),
      clientWrites: [...clientWrites].sort((a, b) => (a.method < b.method ? -1 : 1)),
    },
    errors,
  };
}
