import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import type { AnalyzedService } from '../types/analysis.js';
import type { WizardConfig } from '../types/config.js';
import type { K8sManifest, GeneratedManifest } from '../types/k8s.js';
import { toK8sName, standardLabels } from '../utils/k8s-names.js';

/** Kubernetes ConfigMap size limit (1MB). */
const MAX_CONFIGMAP_SIZE = 1_048_576;

/**
 * Generate ConfigMaps for a service.
 * Two types: file-based (from volume mounts) and env-based (non-sensitive env vars).
 */
export function generateConfigMapsForService(
  serviceName: string,
  analyzed: AnalyzedService,
  config: WizardConfig,
  composeDir: string,
): { manifests: GeneratedManifest[]; warnings: string[] } {
  const manifests: GeneratedManifest[] = [];
  const warnings: string[] = [];
  const k8sName = toK8sName(serviceName);
  const labels = standardLabels(serviceName);

  // 1. File-based ConfigMaps from volume mounts classified as configmap
  for (const vol of analyzed.volumes) {
    if (vol.classification !== 'configmap') continue;

    const volName = toK8sName(vol.suggestedName);
    const sourceFile = vol.mount.source;
    const fileName = basename(vol.mount.target);
    let fileContent = `# TODO: Add content for ${fileName}`;

    if (sourceFile) {
      const fullPath = resolve(composeDir, sourceFile);
      if (existsSync(fullPath)) {
        const fileStat = statSync(fullPath);
        if (fileStat.size > MAX_CONFIGMAP_SIZE) {
          warnings.push(
            `Config file too large: ${sourceFile} (${(fileStat.size / 1024 / 1024).toFixed(1)}MB) exceeds Kubernetes 1MB ConfigMap limit. Using placeholder.`,
          );
        } else {
          const raw = readFileSync(fullPath);
          // Check for binary content (null bytes)
          if (raw.includes(0)) {
            warnings.push(
              `Config file appears to be binary: ${sourceFile} (for ${serviceName}). Using placeholder.`,
            );
          } else {
            fileContent = raw.toString('utf-8');
          }
        }
      } else {
        warnings.push(
          `Config file not found: ${sourceFile} (for ${serviceName}). Using placeholder.`,
        );
      }
    }

    const manifest: K8sManifest = {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: `${k8sName}-${volName}`,
        namespace: config.deploy.namespace || undefined,
        labels,
      },
      data: {
        [fileName]: fileContent,
      },
    };

    manifests.push({
      filename: `${k8sName}-configmap-${volName}.yaml`,
      manifest,
      serviceName,
      description: `ConfigMap for ${serviceName} file: ${fileName}`,
    });
  }

  // 2. Env-based ConfigMap (non-sensitive environment variables)
  const svcEnvClassification = config.envClassification[serviceName] ?? {};
  const envData: Record<string, string> = {};

  for (const envVar of analyzed.envVars) {
    const classification = svcEnvClassification[envVar.name] ??
      (envVar.sensitive ? 'secret' : 'configmap');
    if (classification === 'configmap') {
      envData[envVar.name] = envVar.value;
    }
  }

  if (Object.keys(envData).length > 0) {
    const manifest: K8sManifest = {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: `${k8sName}-env`,
        namespace: config.deploy.namespace || undefined,
        labels,
      },
      data: envData,
    };

    manifests.push({
      filename: `${k8sName}-configmap-env.yaml`,
      manifest,
      serviceName,
      description: `Environment ConfigMap for ${serviceName}`,
    });
  }

  return { manifests, warnings };
}
