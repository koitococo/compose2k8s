import type { ComposeProject } from '../types/compose.js';
import type { AnalysisResult, AnalyzedService, AnalyzedVolume, AnalyzedPort, AnalyzedEnvVar } from '../types/analysis.js';
import { inferServiceCategory, inferWorkloadType } from './service.js';
import { classifyVolume } from './volume.js';
import { isSensitiveEnvVar } from './secrets.js';
import { analyzeDependencies } from './dependency.js';
import { toK8sName } from '../utils/k8s-names.js';

/**
 * Analyze a parsed compose project for K8s conversion.
 */
export function analyzeProject(project: ComposeProject): AnalysisResult {
  const warnings: string[] = [];
  const services: Record<string, AnalyzedService> = {};

  for (const [name, service] of Object.entries(project.services)) {
    const category = inferServiceCategory(name, service);
    const workloadType = inferWorkloadType(name, service, category);

    // Classify volumes
    const volumes: AnalyzedVolume[] = service.volumes.map((mount) => ({
      mount,
      classification: classifyVolume(mount),
      suggestedName: toK8sName(`${name}-${mount.target.split('/').pop() || 'data'}`),
    }));

    // Analyze ports
    const ports: AnalyzedPort[] = service.ports.map((p) => ({
      containerPort: p.target,
      protocol: p.protocol ?? 'tcp',
      publishedPort: p.published,
    }));

    // Analyze env vars
    const envVars: AnalyzedEnvVar[] = Object.entries(service.environment).map(
      ([envName, value]) => ({
        name: envName,
        value,
        sensitive: isSensitiveEnvVar(envName, value),
      }),
    );

    // Warn about build-only services
    if (!service.image && service.build) {
      warnings.push(
        `Service "${name}" uses build without image. You'll need to push the image to a registry and set the image field.`,
      );
    }

    services[name] = {
      name,
      service,
      category,
      workloadType,
      volumes,
      ports,
      envVars,
      dependsOn: Object.keys(service.depends_on),
    };
  }

  const dependencyGraph = analyzeDependencies(project.services);

  if (dependencyGraph.hasCycles) {
    warnings.push('Circular dependency detected in service dependencies.');
  }

  return { services, dependencyGraph, warnings };
}
