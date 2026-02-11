import type { AnalysisResult } from '../types/analysis.js';
import type { WizardConfig, StorageConfig } from '../types/config.js';
import { toK8sName } from '../utils/k8s-names.js';

/**
 * Generate default WizardConfig from analysis without prompts.
 * Used for --non-interactive mode.
 */
export function generateDefaults(
  analysis: AnalysisResult,
  overrides: {
    outputDir?: string;
    namespace?: string;
    outputFormat?: 'plain' | 'single-file';
  } = {},
): WizardConfig {
  const selectedServices = Object.keys(analysis.services);

  // Build env classification from analysis
  const envClassification: Record<string, Record<string, 'configmap' | 'secret'>> = {};
  for (const [name, svc] of Object.entries(analysis.services)) {
    envClassification[name] = {};
    for (const envVar of svc.envVars) {
      envClassification[name][envVar.name] = envVar.sensitive ? 'secret' : 'configmap';
    }
  }

  // Build storage configs for PVC volumes
  const storageConfig: StorageConfig[] = [];
  for (const svc of Object.values(analysis.services)) {
    for (const vol of svc.volumes) {
      if (vol.classification === 'pvc') {
        const volName = toK8sName(vol.suggestedName);
        const isDb = svc.category === 'database';
        storageConfig.push({
          volumeName: volName,
          storageClass: '',
          size: isDb ? '10Gi' : '1Gi',
          accessMode: 'ReadWriteOnce',
        });
      }
    }
  }

  return {
    selectedServices,
    ingress: {
      enabled: false,
      tls: false,
      certManager: false,
      controller: 'none',
      routes: [],
    },
    envClassification,
    storageConfig,
    initContainers: 'wait-for-port',
    deploy: {
      namespace: overrides.namespace ?? 'default',
      imagePullPolicy: 'IfNotPresent',
      outputFormat: overrides.outputFormat ?? 'plain',
      outputDir: overrides.outputDir ?? './k8s',
      migrationScripts: true,
      resourceDefaults: {
        cpuRequest: '100m',
        cpuLimit: '500m',
        memoryRequest: '128Mi',
        memoryLimit: '512Mi',
      },
    },
  };
}
