import * as p from '@clack/prompts';
import type { AnalysisResult } from '../types/analysis.js';
import type { ResourceConfig } from '../types/config.js';

const DEFAULTS: ResourceConfig = {
  cpuRequest: '100m',
  cpuLimit: '500m',
  memoryRequest: '128Mi',
  memoryLimit: '512Mi',
};

/**
 * Step 6: Configure per-service resource limits.
 */
export async function configureResources(
  analysis: AnalysisResult,
  selectedServices: string[],
): Promise<Record<string, ResourceConfig> | symbol> {
  const customize = await p.confirm({
    message: 'Do you want to customize resource limits per service?',
    initialValue: false,
  });
  if (p.isCancel(customize)) return customize;

  if (!customize) return {};

  const overrides: Record<string, ResourceConfig> = {};

  for (const svcName of selectedServices) {
    const svc = analysis.services[svcName];
    if (!svc) continue;

    // Check if compose file has deploy.resources defined
    if (svc.service.deploy?.resources) {
      p.log.info(`${svcName}: using resources from compose file (deploy.resources)`);
      continue;
    }

    const edit = await p.confirm({
      message: `Configure resources for ${svcName} (${svc.category})? [default: CPU ${DEFAULTS.cpuRequest}/${DEFAULTS.cpuLimit}, Memory ${DEFAULTS.memoryRequest}/${DEFAULTS.memoryLimit}]`,
      initialValue: false,
    });
    if (p.isCancel(edit)) return edit;
    if (!edit) continue;

    const cpuRequest = await p.text({
      message: `  ${svcName} — CPU request:`,
      initialValue: DEFAULTS.cpuRequest,
    });
    if (p.isCancel(cpuRequest)) return cpuRequest;

    const cpuLimit = await p.text({
      message: `  ${svcName} — CPU limit:`,
      initialValue: DEFAULTS.cpuLimit,
    });
    if (p.isCancel(cpuLimit)) return cpuLimit;

    const memoryRequest = await p.text({
      message: `  ${svcName} — Memory request:`,
      initialValue: DEFAULTS.memoryRequest,
    });
    if (p.isCancel(memoryRequest)) return memoryRequest;

    const memoryLimit = await p.text({
      message: `  ${svcName} — Memory limit:`,
      initialValue: DEFAULTS.memoryLimit,
    });
    if (p.isCancel(memoryLimit)) return memoryLimit;

    overrides[svcName] = {
      cpuRequest: cpuRequest as string,
      cpuLimit: cpuLimit as string,
      memoryRequest: memoryRequest as string,
      memoryLimit: memoryLimit as string,
    };
  }

  return overrides;
}
