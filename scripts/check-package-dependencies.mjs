import { builtinModules } from 'node:module';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const packageRoots = ['core', 'adapters', 'plugins', 'packages', 'apps'];
const sharedDevelopmentDependencies = new Set(['vitest']);
const sourceExtensions = new Set(['.js', '.cjs', '.mjs', '.ts', '.tsx']);
const builtins = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);

async function directoriesUnder(relativeRoot) {
  const absoluteRoot = path.join(root, relativeRoot);
  if (relativeRoot === 'core') return [absoluteRoot];

  return (await readdir(absoluteRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(absoluteRoot, entry.name));
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await sourceFiles(target));
    } else if (sourceExtensions.has(path.extname(entry.name))) {
      files.push(target);
    }
  }

  return files;
}

function dependencyName(specifier) {
  if (specifier.startsWith('@')) return specifier.split('/').slice(0, 2).join('/');
  return specifier.split('/')[0];
}

function isExternal(specifier) {
  return !specifier.startsWith('.')
    && !specifier.startsWith('/')
    && !specifier.startsWith('#')
    && !builtins.has(specifier);
}

function collectSpecifiers(source, file) {
  const specifiers = new Set();

  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier
      && ts.isStringLiteral(node.moduleSpecifier)
      && isExternal(node.moduleSpecifier.text)) {
      specifiers.add(node.moduleSpecifier.text);
    }

    if (ts.isCallExpression(node) && node.arguments.length === 1) {
      const [argument] = node.arguments;
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      if ((isDynamicImport || isRequire) && ts.isStringLiteral(argument) && isExternal(argument.text)) {
        specifiers.add(argument.text);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

const packageDirectories = (await Promise.all(packageRoots.map(directoriesUnder))).flat();
const failures = [];
let checkedPackages = 0;
const workspaceManifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const workspaceDevelopment = new Set(Object.keys(workspaceManifest.devDependencies || {}));

for (const dependency of sharedDevelopmentDependencies) {
  if (!workspaceDevelopment.has(dependency)) {
    failures.push(`workspace: shared development dependency ${dependency} is not declared at the root`);
  }
}

for (const directory of packageDirectories) {
  const manifestPath = path.join(directory, 'package.json');
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') continue;
    throw error;
  }
  checkedPackages += 1;

  const declaredRuntime = new Set([
    ...Object.keys(manifest.dependencies || {}),
    ...Object.keys(manifest.optionalDependencies || {}),
    ...Object.keys(manifest.peerDependencies || {}),
  ]);
  const declaredDevelopment = new Set([
    ...declaredRuntime,
    ...Object.keys(manifest.devDependencies || {}),
    ...sharedDevelopmentDependencies,
  ]);

  for (const dependency of sharedDevelopmentDependencies) {
    if (manifest.devDependencies?.[dependency]) {
      failures.push(`${manifest.name}: shared development dependency ${dependency} must be declared only at the workspace root`);
    }
  }
  const importedRuntime = new Set();
  const importSources = new Map();
  const srcDirectory = path.join(directory, 'src');

  try {
    for (const file of await sourceFiles(srcDirectory)) {
      const source = await readFile(file, 'utf8');
      for (const specifier of collectSpecifiers(source, file)) {
        const dependency = dependencyName(specifier);
        importedRuntime.add(dependency);
        if (!importSources.has(dependency)) {
          importSources.set(dependency, path.relative(root, file));
        }
      }
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  for (const dependency of importedRuntime) {
    if (!declaredRuntime.has(dependency)) {
      failures.push(`${manifest.name}: runtime import ${dependency} in ${importSources.get(dependency)} is not declared`);
    }
  }

  for (const testDirectoryName of ['test', 'tests']) {
    const testDirectory = path.join(directory, testDirectoryName);
    try {
      for (const file of await sourceFiles(testDirectory)) {
        const source = await readFile(file, 'utf8');
        for (const specifier of collectSpecifiers(source, file)) {
          const dependency = dependencyName(specifier);
          if (dependency === manifest.name) continue;
          if (!declaredDevelopment.has(dependency)) {
            failures.push(`${manifest.name}: test import ${dependency} in ${path.relative(root, file)} is not declared`);
          }
        }
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  if (manifest.name === '@baldin/core') {
    for (const dependency of importedRuntime) {
      const isFeaturePackage = dependency.startsWith('@baldin/adapter-')
        || dependency.startsWith('@baldin/plugin-');
      if (isFeaturePackage && dependency !== '@baldin/adapter-memory') {
        failures.push(`${manifest.name}: core imports feature package ${dependency}`);
      }
    }
  }

  if (manifest.name.startsWith('@baldin/adapter-')) {
    for (const dependency of importedRuntime) {
      if (dependency.startsWith('@baldin/adapter-') || dependency.startsWith('@baldin/plugin-')) {
        failures.push(`${manifest.name}: adapter imports feature package ${dependency}`);
      }
    }
  }

  for (const dependency of Object.keys(manifest.dependencies || {})) {
    const runtimeLoadedByName = importedRuntime.has(dependency);
    const runtimeLoadedByString = dependency === 'pino-pretty'
      && manifest.name === '@baldin/core';
    if (!runtimeLoadedByName && !runtimeLoadedByString) {
      failures.push(`${manifest.name}: dependency ${dependency} is unused by src`);
    }
  }
}

if (failures.length > 0) {
  console.error('Package dependency boundary audit failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Package dependency boundary audit passed for ${checkedPackages} packages.`);
}
