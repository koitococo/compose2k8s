import { describe, it, expect } from 'vitest';
import { buildPodSecurityContext, buildContainerSecurityContext } from '../../src/generator/security-context.js';

describe('buildPodSecurityContext', () => {
  it('returns runAsNonRoot and seccompProfile for restricted', () => {
    const ctx = buildPodSecurityContext('restricted');
    expect(ctx).toEqual({
      runAsNonRoot: true,
      seccompProfile: { type: 'RuntimeDefault' },
    });
  });

  it('returns undefined for baseline', () => {
    expect(buildPodSecurityContext('baseline')).toBeUndefined();
  });

  it('returns undefined for none', () => {
    expect(buildPodSecurityContext('none')).toBeUndefined();
  });
});

describe('buildContainerSecurityContext', () => {
  it('returns allowPrivilegeEscalation and capabilities for restricted', () => {
    const ctx = buildContainerSecurityContext('restricted');
    expect(ctx).toEqual({
      allowPrivilegeEscalation: false,
      capabilities: { drop: ['ALL'] },
    });
  });

  it('returns allowPrivilegeEscalation and capabilities for baseline', () => {
    const ctx = buildContainerSecurityContext('baseline');
    expect(ctx).toEqual({
      allowPrivilegeEscalation: false,
      capabilities: { drop: ['ALL'] },
    });
  });

  it('returns undefined for none', () => {
    expect(buildContainerSecurityContext('none')).toBeUndefined();
  });
});
