import * as p from '@clack/prompts';
import type { AnalysisResult } from '../types/analysis.js';

/**
 * Step 3: Review auto-detected env var classifications (configmap vs secret).
 */
export async function configureSecrets(
  analysis: AnalysisResult,
  selectedServices: string[],
): Promise<Record<string, Record<string, 'configmap' | 'secret'>> | symbol> {
  const classification: Record<string, Record<string, 'configmap' | 'secret'>> = {};

  // Show auto-detected classifications
  const lines: string[] = [];
  for (const svcName of selectedServices) {
    const svc = analysis.services[svcName];
    if (!svc) continue;

    classification[svcName] = {};
    const sensitiveVars = svc.envVars.filter((v) => v.sensitive);
    const normalVars = svc.envVars.filter((v) => !v.sensitive);

    if (sensitiveVars.length > 0) {
      lines.push(`${svcName}:`);
      for (const v of sensitiveVars) {
        lines.push(`  [secret] ${v.name}`);
        classification[svcName][v.name] = 'secret';
      }
    }
    for (const v of normalVars) {
      classification[svcName][v.name] = 'configmap';
    }
  }

  if (lines.length > 0) {
    p.note(lines.join('\n'), 'Auto-detected secrets');

    const accept = await p.confirm({
      message: 'Accept these classifications?',
      initialValue: true,
    });
    if (p.isCancel(accept)) return accept;

    if (!accept) {
      // Let user override per service
      for (const svcName of selectedServices) {
        const svc = analysis.services[svcName];
        if (!svc || svc.envVars.length === 0) continue;

        const secretVars = await p.multiselect({
          message: `Select secret env vars for ${svcName}:`,
          options: svc.envVars.map((v) => ({
            value: v.name,
            label: v.name,
            hint: v.sensitive ? 'auto-detected' : undefined,
          })),
          initialValues: svc.envVars
            .filter((v) => v.sensitive)
            .map((v) => v.name),
          required: false,
        });
        if (p.isCancel(secretVars)) return secretVars;

        const secretSet = new Set(secretVars);
        for (const v of svc.envVars) {
          classification[svcName][v.name] = secretSet.has(v.name) ? 'secret' : 'configmap';
        }
      }
    }
  }

  return classification;
}
