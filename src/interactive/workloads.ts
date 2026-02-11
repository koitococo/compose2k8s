import * as p from '@clack/prompts';
import type { AnalysisResult } from '../types/analysis.js';
import type { WorkloadOverride } from '../types/config.js';

/**
 * Step 2: Review workload types and replica counts.
 * Shows auto-detected workload type per service and lets users override.
 */
export async function configureWorkloads(
  analysis: AnalysisResult,
  selectedServices: string[],
): Promise<Record<string, WorkloadOverride> | symbol> {
  const overrides: Record<string, WorkloadOverride> = {};

  // Initialize with detected values
  for (const name of selectedServices) {
    const svc = analysis.services[name];
    overrides[name] = {
      workloadType: svc.workloadType,
      replicas: svc.service.deploy?.replicas ?? 1,
    };
  }

  // Ask if user wants to review workload settings
  const review = await p.confirm({
    message: 'Review workload types and replica counts?',
    initialValue: false,
  });
  if (p.isCancel(review)) return review;

  if (!review) return overrides;

  for (const name of selectedServices) {
    const svc = analysis.services[name];
    const current = overrides[name];

    p.log.info(
      `${name}: detected as ${svc.category} → ${svc.workloadType}`,
    );

    const workloadType = await p.select({
      message: `Workload type for ${name}:`,
      options: [
        {
          value: 'Deployment' as const,
          label: 'Deployment',
          hint: current.workloadType === 'Deployment' ? 'detected' : undefined,
        },
        {
          value: 'StatefulSet' as const,
          label: 'StatefulSet',
          hint: current.workloadType === 'StatefulSet' ? 'detected' : undefined,
        },
      ],
      initialValue: current.workloadType,
    });
    if (p.isCancel(workloadType)) return workloadType;

    const replicas = await p.text({
      message: `Replica count for ${name}:`,
      initialValue: String(current.replicas),
      validate: (val) => {
        const n = Number(val);
        if (!Number.isInteger(n) || n < 1) return 'Must be a positive integer';
      },
    });
    if (p.isCancel(replicas)) return replicas;

    overrides[name] = {
      workloadType,
      replicas: Number(replicas),
    };
  }

  return overrides;
}
