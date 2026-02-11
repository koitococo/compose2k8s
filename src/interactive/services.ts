import * as p from '@clack/prompts';
import type { AnalysisResult } from '../types/analysis.js';

/**
 * Step 1: Select which services to convert.
 */
export async function selectServices(
  analysis: AnalysisResult,
): Promise<string[] | symbol> {
  const serviceNames = Object.keys(analysis.services);

  const selected = await p.multiselect({
    message: 'Which services do you want to convert?',
    options: serviceNames.map((name) => {
      const svc = analysis.services[name];
      return {
        value: name,
        label: name,
        hint: `${svc.category} → ${svc.workloadType}`,
      };
    }),
    initialValues: serviceNames,
    required: true,
  });

  return selected;
}
