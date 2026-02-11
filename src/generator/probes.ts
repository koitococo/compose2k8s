import type { ComposeHealthcheck } from '../types/compose.js';
import type { AnalyzedPort } from '../types/analysis.js';

/**
 * Parse a compose duration string like "30s", "1m", "500ms" to seconds.
 */
function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)(ms|s|m|h)?$/);
  if (!match) return 30;

  const value = parseInt(match[1], 10);
  const unit = match[2] ?? 's';

  switch (unit) {
    case 'ms': return Math.max(1, Math.round(value / 1000));
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 3600;
    default: return value;
  }
}

/**
 * Convert a compose healthcheck to K8s liveness and readiness probes.
 */
export function healthcheckToProbes(
  healthcheck: ComposeHealthcheck,
  ports: AnalyzedPort[],
): Record<string, unknown> {
  if (healthcheck.disable) return {};

  const test = healthcheck.test;
  if (!test || test.length === 0) return {};

  const probe = buildProbe(test, ports);
  if (!probe) return {};

  // Common timing fields
  if (healthcheck.interval) {
    probe.periodSeconds = parseDuration(healthcheck.interval);
  }
  if (healthcheck.timeout) {
    probe.timeoutSeconds = parseDuration(healthcheck.timeout);
  }
  if (healthcheck.retries) {
    probe.failureThreshold = healthcheck.retries;
  }

  const readinessProbe = { ...probe };
  const livenessProbe = { ...probe };

  if (healthcheck.start_period) {
    livenessProbe.initialDelaySeconds = parseDuration(healthcheck.start_period);
  }

  return { livenessProbe, readinessProbe };
}

function buildProbe(
  test: string[],
  ports: AnalyzedPort[],
): Record<string, unknown> | null {
  let command: string[];

  if (test[0] === 'CMD') {
    command = test.slice(1);
  } else if (test[0] === 'CMD-SHELL') {
    const shellCmd = test.slice(1).join(' ');

    // Try to parse curl commands into httpGet probes
    const curlMatch = shellCmd.match(/curl\s+(?:-[fs]+\s+)*(?:http:\/\/)?(?:localhost|127\.0\.0\.1)(?::(\d+))?([^\s"']*)/);
    if (curlMatch) {
      const port = curlMatch[1]
        ? parseInt(curlMatch[1], 10)
        : ports[0]?.containerPort ?? 80;
      const path = curlMatch[2] || '/';
      return {
        httpGet: { path, port },
      };
    }

    command = ['sh', '-c', shellCmd];
  } else {
    command = test;
  }

  return { exec: { command } };
}
