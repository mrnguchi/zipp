import ts from 'typescript';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative, dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

export function boundaryErrors(files) {
  const errors = [];
  const graph = new Map();
  for (const [name, source] of Object.entries(files)) {
    const match = name.match(/^src\/modules\/([^/]+)\/(.*)$/);
    if (!match || name.endsWith('.spec.ts')) continue;
    const [, feature, rest] = match;
    const imports = [];
    const visit = (node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      )
        imports.push(node.moduleSpecifier.text);
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword
      ) {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteral(arg)) imports.push(arg.text);
        else errors.push(`${name}: dynamic import must have a static target`);
      }
      ts.forEachChild(node, visit);
    };
    visit(ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true));
    for (const specifier of imports) {
      const target = specifier.startsWith('.')
        ? posix.normalize(posix.join(posix.dirname(name), specifier))
        : specifier;
      if (
        rest.startsWith('domain/') &&
        (/^(@nestjs|@prisma|ioredis|bullmq|pg)(\/|$)/.test(target) ||
          /\/(application|infrastructure|presentation|platform|generated)\//.test(
            target,
          ))
      )
        errors.push(
          `${name}: domain imports forbidden dependency ${specifier}`,
        );
      if (
        rest.startsWith('application/') &&
        /\/(infrastructure|presentation|generated)\//.test(target)
      )
        errors.push(`${name}: application depends on outer layer ${specifier}`);
      if (
        rest.startsWith('presentation/') &&
        /\/(infrastructure|generated)\//.test(target)
      )
        errors.push(`${name}: presentation imports persistence ${specifier}`);
      const foreign = target.match(/^src\/modules\/([^/]+)\/(.*)$/);
      if (foreign && foreign[1] !== feature) {
        const publicTarget =
          foreign[2].startsWith('contracts/') ||
          foreign[2] === `${foreign[1]}.facade.js` ||
          (rest === `${feature}.module.ts` &&
            foreign[2] === `${foreign[1]}.module.js`);
        if (!publicTarget || rest.startsWith('domain/'))
          errors.push(`${name}: cross-module internal import ${specifier}`);
        const edges = graph.get(feature) ?? new Set();
        edges.add(foreign[1]);
        graph.set(feature, edges);
      }
    }
  }
  const walk = (node, path) => {
    if (path.includes(node)) {
      errors.push(`Module dependency cycle: ${[...path, node].join(' -> ')}`);
      return;
    }
    for (const next of graph.get(node) ?? []) walk(next, [...path, node]);
  };
  for (const key of graph.keys()) walk(key, []);
  return [...new Set(errors)];
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const files = {};
  const collect = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory() && entry.name !== 'generated') collect(path);
      else if (entry.isFile() && entry.name.endsWith('.ts'))
        files[relative(root, path).replaceAll('\\', '/')] = readFileSync(
          path,
          'utf8',
        );
    }
  };
  collect(resolve(root, 'src'));
  const errors = boundaryErrors(files);
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else console.log('Module boundaries verified');
}
