import type { ComposeService } from '../types/compose.js';
import type { DependencyGraph } from '../types/analysis.js';

/**
 * Analyze service dependencies: build graph, topological sort, detect cycles.
 */
export function analyzeDependencies(
  services: Record<string, ComposeService>,
): DependencyGraph {
  const warnings: string[] = [];

  // Build adjacency list (service → dependencies), filtering out missing targets
  const edges: Record<string, string[]> = {};
  const allNodes = Object.keys(services);
  const nodeSet = new Set(allNodes);

  for (const [name, service] of Object.entries(services)) {
    const deps: string[] = [];
    for (const dep of Object.keys(service.depends_on)) {
      if (nodeSet.has(dep)) {
        deps.push(dep);
      } else {
        warnings.push(`Service "${name}" depends on "${dep}", which does not exist`);
      }
    }
    edges[name] = deps;
  }

  // Topological sort with cycle detection (Kahn's algorithm)
  // inDegree[node] = number of dependencies that node has (edges pointing into it in startup order)
  const inDegree: Record<string, number> = {};
  for (const node of allNodes) {
    inDegree[node] = edges[node].length;
  }

  const queue: string[] = [];
  for (const [node, degree] of Object.entries(inDegree)) {
    if (degree === 0) queue.push(node);
  }

  const order: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    order.push(node);

    // Find nodes that depend on this node and decrement their inDegree
    for (const [dependent, deps] of Object.entries(edges)) {
      if (deps.includes(node)) {
        inDegree[dependent]--;
        if (inDegree[dependent] === 0) {
          queue.push(dependent);
        }
      }
    }
  }

  const hasCycles = order.length !== allNodes.length;

  return { edges, order, hasCycles, warnings };
}
