import { dirname } from 'node:path';
import type { AnalysisResult } from '../types/analysis.js';
import type { WizardConfig } from '../types/config.js';
import type { GeneratedManifest, GeneratorOutput } from '../types/k8s.js';
import { generateDeployment } from './deployment.js';
import { generateStatefulSet } from './statefulset.js';
import { generateService } from './service.js';
import { generateIngress } from './ingress.js';
import { generateConfigMapsForService } from './configmap.js';
import { generateSecretsForService } from './secret.js';
import { generatePVC } from './pvc.js';
import { generateReadme } from './readme.js';

export interface GenerateInput {
  analysis: AnalysisResult;
  config: WizardConfig;
  composeFile: string;
}

/**
 * Generate all K8s manifests from analysis + config.
 */
export function generateManifests(input: GenerateInput): GeneratorOutput {
  const { analysis, config, composeFile } = input;
  const composeDir = dirname(composeFile);
  const manifests: GeneratedManifest[] = [];
  const warnings: string[] = [];

  for (const serviceName of config.selectedServices) {
    const analyzed = analysis.services[serviceName];
    if (!analyzed) {
      warnings.push(`Service "${serviceName}" not found in analysis.`);
      continue;
    }

    // Workload (Deployment or StatefulSet)
    if (analyzed.workloadType === 'StatefulSet') {
      const ssManifests = generateStatefulSet(serviceName, analyzed, config, analysis.services);
      manifests.push(...ssManifests);
    } else {
      manifests.push(generateDeployment(serviceName, analyzed, config, analysis.services));

      // PVCs for Deployments (StatefulSets use volumeClaimTemplates)
      for (const vol of analyzed.volumes) {
        if (vol.classification === 'pvc') {
          manifests.push(generatePVC(serviceName, vol, config));
        }
      }
    }

    // Service (ClusterIP)
    const svcManifest = generateService(serviceName, analyzed, config);
    if (svcManifest) {
      manifests.push(svcManifest);
    }

    // ConfigMaps
    const { manifests: cmManifests, warnings: cmWarnings } =
      generateConfigMapsForService(serviceName, analyzed, config, composeDir);
    manifests.push(...cmManifests);
    warnings.push(...cmWarnings);

    // Secrets
    manifests.push(...generateSecretsForService(serviceName, analyzed, config));
  }

  // Ingress
  const ingressManifest = generateIngress(config, analysis);
  if (ingressManifest) {
    manifests.push(ingressManifest);
  }

  // README
  const readme = generateReadme(manifests, config);

  return { manifests, readme, warnings };
}
