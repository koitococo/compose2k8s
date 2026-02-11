import type { ComposeService, ComposeVolumeMount } from './compose.js';

export type ServiceCategory =
  | 'web'
  | 'api'
  | 'database'
  | 'cache'
  | 'queue'
  | 'worker'
  | 'proxy'
  | 'other';

export type WorkloadType = 'Deployment' | 'StatefulSet';

export type VolumeClassification = 'configmap' | 'secret' | 'pvc' | 'emptydir';

export interface AnalyzedVolume {
  mount: ComposeVolumeMount;
  classification: VolumeClassification;
  suggestedName: string;
}

export interface AnalyzedPort {
  containerPort: number;
  protocol: 'tcp' | 'udp';
  publishedPort?: number;
}

export interface AnalyzedEnvVar {
  name: string;
  value: string;
  sensitive: boolean;
}

export interface AnalyzedService {
  name: string;
  service: ComposeService;
  category: ServiceCategory;
  workloadType: WorkloadType;
  volumes: AnalyzedVolume[];
  ports: AnalyzedPort[];
  envVars: AnalyzedEnvVar[];
  dependsOn: string[];
}

export interface DependencyGraph {
  edges: Record<string, string[]>;
  order: string[];
  hasCycles: boolean;
  warnings: string[];
}

export interface AnalysisResult {
  services: Record<string, AnalyzedService>;
  dependencyGraph: DependencyGraph;
  warnings: string[];
}
