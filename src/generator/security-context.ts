import type { PodSecurityStandard } from '../types/config.js';

/**
 * Build pod-level securityContext for PSS compliance.
 * Returns undefined when no pod-level context is needed.
 */
export function buildPodSecurityContext(
  pss: PodSecurityStandard,
): Record<string, unknown> | undefined {
  if (pss === 'restricted') {
    return {
      runAsNonRoot: true,
      seccompProfile: { type: 'RuntimeDefault' },
    };
  }
  return undefined;
}

/**
 * Build container-level securityContext for PSS compliance.
 * Applied to both main containers and init containers.
 * Returns undefined when no container-level context is needed.
 */
export function buildContainerSecurityContext(
  pss: PodSecurityStandard,
): Record<string, unknown> | undefined {
  if (pss === 'restricted' || pss === 'baseline') {
    return {
      allowPrivilegeEscalation: false,
      capabilities: { drop: ['ALL'] },
    };
  }
  return undefined;
}
