import * as p from '@clack/prompts';
import type { AnalysisResult } from '../types/analysis.js';

/**
 * Step 5: Configure dependency handling and healthcheck conversion.
 */
export async function configureHealth(
  analysis: AnalysisResult,
  selectedServices: string[],
): Promise<{ initContainers: 'wait-for-port' | 'none' } | symbol> {
  // Show dependency graph
  const depLines: string[] = [];
  for (const svcName of selectedServices) {
    const svc = analysis.services[svcName];
    if (svc && svc.dependsOn.length > 0) {
      depLines.push(`${svcName} → ${svc.dependsOn.join(', ')}`);
    }
  }

  if (depLines.length > 0) {
    p.note(depLines.join('\n'), 'Service dependencies');

    const strategy = await p.select({
      message: 'How should service dependencies be handled?',
      options: [
        {
          value: 'wait-for-port' as const,
          label: 'Wait-for-port init containers',
          hint: 'Adds busybox init containers that wait for dependency ports',
        },
        {
          value: 'none' as const,
          label: 'None',
          hint: 'Skip dependency handling (use if you have other orchestration)',
        },
      ],
    });
    if (p.isCancel(strategy)) return strategy;

    return { initContainers: strategy };
  }

  return { initContainers: 'none' };
}
