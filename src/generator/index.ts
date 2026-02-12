import type { AnalysisResult } from '../types/analysis.js';
import type { WizardConfig } from '../types/config.js';
import type { GeneratedManifest, GeneratorOutput } from '../types/k8s.js';
import { generateDeployment } from './deployment.js';
import { generateStatefulSet } from './statefulset.js';
import { generateService } from './service.js';
import { generateIngress } from './ingress.js';
import { generateGatewayAPI } from './gateway.js';
import { generateConfigMapsForService } from './configmap.js';
import { generateSecretsForService } from './secret.js';
import { generatePVC } from './pvc.js';
import { generateReadme } from './readme.js';
import { generateMigrationScripts } from './migration-script.js';

export interface GenerateInput {
  analysis: AnalysisResult;
  config: WizardConfig;
  workingDir: string;
}

/**
 * Generate all K8s manifests from analysis + config.
 */
export function generateManifests(input: GenerateInput): GeneratorOutput {
  const { analysis, config, workingDir } = input;
  const composeDir = workingDir;
  const manifests: GeneratedManifest[] = [];
  const warnings: string[] = [];

  for (const serviceName of config.selectedServices) {
    const analyzed = analysis.services[serviceName];
    if (!analyzed) {
      warnings.push(`Service "${serviceName}" not found in analysis.`);
      continue;
    }

    // Workload (Deployment or StatefulSet) — use override if present
    const workloadType =
      config.workloadOverrides?.[serviceName]?.workloadType ?? analyzed.workloadType;

    if (workloadType === 'StatefulSet') {
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

  // External traffic routing (Ingress or Gateway API)
  if (config.ingress.mode === 'gateway-api') {
    manifests.push(...generateGatewayAPI(config, analysis));
  } else {
    const ingressManifest = generateIngress(config, analysis);
    if (ingressManifest) {
      manifests.push(ingressManifest);
    }
  }

  // Migration scripts
  const migrationScripts = config.deploy.migrationScripts
    ? generateMigrationScripts(
        analysis,
        config.selectedServices,
        config.deploy.namespace,
      )
    : [];

  // README
  const readme = generateReadme(manifests, config);

  return { manifests, migrationScripts, readme, warnings };
}
