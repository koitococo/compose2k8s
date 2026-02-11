import * as p from '@clack/prompts';
import type { AnalysisResult } from '../types/analysis.js';
import type { WizardConfig } from '../types/config.js';
import { selectServices } from './services.js';
import { configureWorkloads } from './workloads.js';
import { configureIngress } from './ingress.js';
import { configureSecrets } from './secrets.js';
import { configureStorage } from './storage.js';
import { configureHealth } from './health.js';
import { configureResources } from './resources.js';
import { configureDeploy } from './deploy.js';

/**
 * Run the interactive 8-step wizard.
 */
export async function runWizard(analysis: AnalysisResult): Promise<WizardConfig | null> {
  p.intro('compose2k8s — Docker Compose → Kubernetes');

  // Step 1: Select services
  const selectedServices = await selectServices(analysis);
  if (p.isCancel(selectedServices)) {
    p.cancel('Conversion cancelled.');
    return null;
  }

  // Step 2: Workload types & replicas
  const workloadOverrides = await configureWorkloads(analysis, selectedServices);
  if (p.isCancel(workloadOverrides)) {
    p.cancel('Conversion cancelled.');
    return null;
  }

  // Step 3: Ingress / Gateway API
  const ingress = await configureIngress(analysis, selectedServices);
  if (p.isCancel(ingress)) {
    p.cancel('Conversion cancelled.');
    return null;
  }

  // Step 4: Secrets classification
  const envClassification = await configureSecrets(analysis, selectedServices);
  if (p.isCancel(envClassification)) {
    p.cancel('Conversion cancelled.');
    return null;
  }

  // Step 5: Storage
  const storageConfig = await configureStorage(analysis, selectedServices);
  if (p.isCancel(storageConfig)) {
    p.cancel('Conversion cancelled.');
    return null;
  }

  // Step 6: Health / Dependencies
  const health = await configureHealth(analysis, selectedServices);
  if (p.isCancel(health)) {
    p.cancel('Conversion cancelled.');
    return null;
  }

  // Step 7: Resource limits
  const resourceOverrides = await configureResources(analysis, selectedServices);
  if (p.isCancel(resourceOverrides)) {
    p.cancel('Conversion cancelled.');
    return null;
  }

  // Step 8: Deploy options
  const deploy = await configureDeploy();
  if (p.isCancel(deploy)) {
    p.cancel('Conversion cancelled.');
    return null;
  }

  p.outro('Configuration complete!');

  return {
    selectedServices,
    workloadOverrides,
    ingress,
    envClassification,
    storageConfig,
    initContainers: health.initContainers,
    resourceOverrides,
    deploy,
  };
}
