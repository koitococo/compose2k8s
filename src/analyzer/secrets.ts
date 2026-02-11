const SENSITIVE_NAME_PATTERNS = [
  /PASSWORD/i,
  /SECRET/i,
  /TOKEN/i,
  /API_KEY/i,
  /APIKEY/i,
  /AUTH/i,
  /CREDENTIAL/i,
  /PRIVATE_KEY/i,
  /ACCESS_KEY/i,
  /CLIENT_SECRET/i,
  /ENCRYPTION/i,
];

const CONNECTION_STRING_PATTERNS = [
  /:\/\/[^:]+:[^@]+@/,  // protocol://user:pass@host
  /password=/i,
];

/**
 * Detect if an environment variable is sensitive and should be a K8s Secret.
 */
export function isSensitiveEnvVar(name: string, value: string): boolean {
  // Check name patterns
  for (const pattern of SENSITIVE_NAME_PATTERNS) {
    if (pattern.test(name)) return true;
  }

  // Check value patterns (connection strings with embedded credentials)
  for (const pattern of CONNECTION_STRING_PATTERNS) {
    if (pattern.test(value)) return true;
  }

  return false;
}
