export interface K8sMetadata {
  name: string;
  namespace?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

export interface K8sManifest {
  apiVersion: string;
  kind: string;
  metadata: K8sMetadata;
  spec?: Record<string, unknown>;
  data?: Record<string, string>;
  stringData?: Record<string, string>;
  type?: string;
  [key: string]: unknown;
}

export interface GeneratedManifest {
  filename: string;
  manifest: K8sManifest;
  serviceName: string;
  description: string;
}

export interface MigrationScriptOutput {
  filename: string;
  content: string;
  serviceName: string;
  description: string;
}

export interface GeneratorOutput {
  manifests: GeneratedManifest[];
  migrationScripts: MigrationScriptOutput[];
  readme: string;
  warnings: string[];
}
