import type { AnalyzedService } from '../types/analysis.js';
import type { WizardConfig } from '../types/config.js';
import { toK8sName } from '../utils/k8s-names.js';

/**
 * Default ports for common service categories.
 */
const DEFAULT_PORTS: Record<string, number> = {
  database: 5432,
  cache: 6379,
  queue: 5672,
};

/**
 * Generate init containers for wait-for-port dependency strategy.
 */
export function generateInitContainers(
  analyzed: AnalyzedService,
  config: WizardConfig,
): Record<string, unknown>[] {
  if (config.initContainers !== 'wait-for-port') return [];

  const initContainers: Record<string, unknown>[] = [];

  for (const dep of analyzed.dependsOn) {
    if (!config.selectedServices.includes(dep)) continue;

    const depName = toK8sName(dep);

    // Determine port to wait on — use first published port of the dependency, or fallback
    const depPort = getDepPort(dep, config);

    initContainers.push({
      name: `wait-for-${depName}`,
      image: 'busybox:1.36',
      command: [
        'sh',
        '-c',
        `until nc -z ${depName} ${depPort}; do echo "Waiting for ${dep}..."; sleep 2; done`,
      ],
    });
  }

  return initContainers;
}

function getDepPort(depName: string, _config: WizardConfig): number {
  // This would ideally look up the analysis result for the dependency
  // For now, use well-known default ports
  return DEFAULT_PORTS[depName] ?? 80;
}
