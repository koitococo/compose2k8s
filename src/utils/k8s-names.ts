/**
 * Convert a compose name to a valid K8s resource name.
 * Lowercase, replace _/. with -, max 63 chars, must start/end alphanumeric.
 */
export function toK8sName(composeName: string): string {
  let name = composeName
    .toLowerCase()
    .replace(/[_.]/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-/, '')
    .replace(/-$/, '');

  if (name.length > 63) {
    name = name.slice(0, 63).replace(/-$/, '');
  }

  // Must start with alphanumeric
  if (!/^[a-z0-9]/.test(name)) {
    name = 'x' + name;
  }

  return name || 'unnamed';
}

/**
 * Generate standard K8s labels for a service.
 */
export function standardLabels(serviceName: string): Record<string, string> {
  return {
    'app.kubernetes.io/name': toK8sName(serviceName),
    'app.kubernetes.io/managed-by': 'compose2k8s',
  };
}

/**
 * Generate selector labels for matching pods.
 */
export function selectorLabels(serviceName: string): Record<string, string> {
  return {
    'app.kubernetes.io/name': toK8sName(serviceName),
  };
}
