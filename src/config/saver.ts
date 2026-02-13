import { writeFile } from 'node:fs/promises';
import { stringify } from 'yaml';
import type { WizardConfig } from '../types/config.js';
import type { ConfigFile } from './schema.js';

/**
 * Convert a WizardConfig back to the ConfigFile format (round-trip compatible).
 */
export function wizardConfigToConfigFile(config: WizardConfig): ConfigFile {
  const exposures: Record<string, { type: string; ingressPath?: string; nodePort?: number }> = {};
  for (const [name, exp] of Object.entries(config.serviceExposures)) {
    exposures[name] = {
      type: exp.type,
      ...(exp.ingressPath ? { ingressPath: exp.ingressPath } : {}),
      ...(exp.nodePort != null ? { nodePort: exp.nodePort } : {}),
    };
  }

  const workloads: Record<string, { workloadType: string; replicas: number; imagePullPolicy?: string }> = {};
  for (const [name, override] of Object.entries(config.workloadOverrides)) {
    workloads[name] = {
      workloadType: override.workloadType,
      replicas: override.replicas,
      ...(override.imagePullPolicy ? { imagePullPolicy: override.imagePullPolicy } : {}),
    };
  }

  const secrets: Record<string, Record<string, string>> = {};
  for (const [svcName, vars] of Object.entries(config.envClassification)) {
    secrets[svcName] = {};
    for (const [varName, classification] of Object.entries(vars)) {
      secrets[svcName][varName] = classification;
    }
  }

  const storage = config.storageConfig.map((s) => ({
    volume: s.volumeName,
    size: s.size,
    accessMode: s.accessMode,
    storageClass: s.storageClass,
  }));

  const ingress = config.ingress.enabled
    ? {
        mode: config.ingress.mode,
        ...(config.ingress.domain ? { domain: config.ingress.domain } : {}),
        tls: config.ingress.tls,
        certManager: config.ingress.certManager,
        controller: config.ingress.controller,
        ...(config.ingress.gatewayClass ? { gatewayClass: config.ingress.gatewayClass } : {}),
        routes: config.ingress.routes.map((r) => ({
          service: r.serviceName,
          path: r.path,
          port: r.port,
        })),
      }
    : undefined;

  const resources = Object.keys(config.resourceOverrides).length > 0
    ? config.resourceOverrides
    : undefined;

  return {
    services: config.selectedServices,
    ...(ingress ? { ingress } : {}),
    secrets,
    storage,
    workloads,
    exposures,
    initContainers: config.initContainers,
    podSecurityStandard: config.podSecurityStandard,
    ...(resources ? { resources } : {}),
    deploy: {
      namespace: config.deploy.namespace,
      imagePullPolicy: config.deploy.imagePullPolicy,
      imagePullSecrets: config.deploy.imagePullSecrets,
      format: config.deploy.outputFormat,
      outputDir: config.deploy.outputDir,
      migrationScripts: config.deploy.migrationScripts,
      resources: config.deploy.resourceDefaults,
    },
  } as ConfigFile;
}

/**
 * Save a WizardConfig as a YAML config file.
 */
export async function saveConfigFile(
  config: WizardConfig,
  path: string,
): Promise<void> {
  const configFile = wizardConfigToConfigFile(config);
  const yaml = stringify(configFile, {
    indent: 2,
    lineWidth: 0,
    defaultStringType: 'PLAIN',
    defaultKeyType: 'PLAIN',
    nullStr: '',
  });
  await writeFile(path, yaml, 'utf-8');
}
