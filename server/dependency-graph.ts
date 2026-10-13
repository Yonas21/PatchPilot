import type { DependencyGraph } from '../shared/workbench.js';

// Installed-location resolution, not a source-code reachability analysis.
export function dependencyGraph(
  packages: Record<string, unknown>,
  legacy: boolean,
): DependencyGraph {
  const records = new Map(
    Object.entries(packages).map(([path, value]) => [
      path,
      value && typeof value === 'object' ? (value as Record<string, unknown>) : {},
    ]),
  );
  function resolve(from: string, name: string): string | undefined {
    let cursor = from;
    for (;;) {
      const candidate = `${cursor ? `${cursor}/` : ''}node_modules/${name}`;
      if (records.has(candidate)) return candidate;
      if (!cursor) return undefined;
      const index = cursor.lastIndexOf('/node_modules/');
      cursor = index >= 0 ? cursor.slice(0, index) : '';
    }
  }
  const edges: Record<string, string[]> = Object.create(null);
  let unresolved = 0;
  for (const [path, value] of records) {
    const dependencies = legacy ? value.requires : value.dependencies;
    const sources = [
      dependencies,
      value.optionalDependencies,
      path === '' ? value.devDependencies : undefined,
    ];
    const names = new Set(
      sources.flatMap((source) =>
        source && typeof source === 'object' && !Array.isArray(source) ? Object.keys(source) : [],
      ),
    );
    edges[path] = [];
    for (const name of names) {
      const target = resolve(path, name);
      if (target) edges[path].push(target);
      else unresolved++;
    }
    if (
      value.peerDependencies &&
      typeof value.peerDependencies === 'object' &&
      !Array.isArray(value.peerDependencies)
    ) {
      const index = path.lastIndexOf('/node_modules/');
      const parent = index >= 0 ? path.slice(0, index) : '';
      for (const name of Object.keys(value.peerDependencies)) {
        if (names.has(name)) continue;
        const target = resolve(parent, name);
        if (target) edges[path].push(target);
        else unresolved++;
      }
    }
  }
  const root = records.get('');
  const rootDeclarations =
    !legacy &&
    !!root &&
    ['dependencies', 'devDependencies', 'optionalDependencies'].some(
      (field) => root[field] && typeof root[field] === 'object',
    );
  return { roots: rootDeclarations ? (edges[''] ?? []) : [], edges, unresolved, rootDeclarations };
}
