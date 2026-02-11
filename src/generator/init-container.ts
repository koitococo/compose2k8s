import type { AnalyzedService, AnalysisResult } from '../types/analysis.js';
import type { WizardConfig } from '../types/config.js';
import { toK8sName } from '../utils/k8s-names.js';

/**
 * Default ports for common service categories.
 */
const CATEGORY_DEFAULT_PORTS: Record<string, number> = {
  database: 5432,
  cache: 6379,
  queue: 5672,
  web: 80,
  proxy: 80,
  api: 3000,
};

/**
 * Generate init containers for wait-for-port dependency strategy.
 */
export function generateInitContainers(
  analyzed: AnalyzedService,
  config: WizardConfig,
  allServices?: Record<string, AnalyzedService>,
): Record<string, unknown>[] {
  if (config.initContainers !== 'wait-for-port') return [];

  const initContainers: Record<string, unknown>[] = [];

  for (const dep of analyzed.dependsOn) {
    if (!config.selectedServices.includes(dep)) continue;

    const depName = toK8sName(dep);
    const depPort = getDepPort(dep, allServices);

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

function getDepPort(
  depName: string,
  allServices?: Record<string, AnalyzedService>,
): number {
  if (allServices) {
    const depSvc = allServices[depName];
    if (depSvc && depSvc.ports.length > 0) {
      return depSvc.ports[0].containerPort;
    }
    if (depSvc) {
      return CATEGORY_DEFAULT_PORTS[depSvc.category] ?? 80;
    }
  }
  return 80;
}
