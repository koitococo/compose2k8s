import type { ComposeService } from '../types/compose.js';
import type { DependencyGraph } from '../types/analysis.js';

/**
 * Analyze service dependencies: build graph, topological sort, detect cycles.
 */
export function analyzeDependencies(
  services: Record<string, ComposeService>,
): DependencyGraph {
  // Build adjacency list (service → dependencies)
  const edges: Record<string, string[]> = {};
  for (const [name, service] of Object.entries(services)) {
    edges[name] = Object.keys(service.depends_on);
  }

  // Topological sort with cycle detection (Kahn's algorithm)
  const inDegree: Record<string, number> = {};
  const allNodes = Object.keys(services);

  for (const node of allNodes) {
    inDegree[node] = 0;
  }

  for (const [_node, deps] of Object.entries(edges)) {
    for (const dep of deps) {
      if (dep in inDegree) {
        inDegree[dep] = (inDegree[dep] || 0);
      }
    }
  }

  // Count incoming edges (reverse of depends_on)
  // If A depends_on B, then B must start first, so B → A in startup order
  // inDegree counts how many services depend on each service
  for (const node of allNodes) {
    inDegree[node] = 0;
  }
  for (const [node, deps] of Object.entries(edges)) {
    // node depends on each dep, so node has inDegree from deps
    inDegree[node] = deps.filter((d) => d in inDegree).length;
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

  return { edges, order, hasCycles };
}
