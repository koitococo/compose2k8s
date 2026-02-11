import { describe, it, expect } from 'vitest';
import { classifyVolume } from '../../src/analyzer/volume.js';
import type { ComposeVolumeMount } from '../../src/types/compose.js';

describe('classifyVolume', () => {
  it('classifies named volume as pvc', () => {
    const mount: ComposeVolumeMount = {
      source: 'pgdata',
      target: '/var/lib/postgresql/data',
      readOnly: false,
      type: 'volume',
    };
    expect(classifyVolume(mount)).toBe('pvc');
  });

  it('classifies config file bind mount as configmap', () => {
    const mount: ComposeVolumeMount = {
      source: './nginx.conf',
      target: '/etc/nginx/nginx.conf',
      readOnly: true,
      type: 'bind',
    };
    expect(classifyVolume(mount)).toBe('configmap');
  });

  it('classifies JSON config as configmap', () => {
    const mount: ComposeVolumeMount = {
      source: './config/app.json',
      target: '/app/config.json',
      readOnly: true,
      type: 'bind',
    };
    expect(classifyVolume(mount)).toBe('configmap');
  });

  it('classifies SSL key as secret', () => {
    const mount: ComposeVolumeMount = {
      source: './certs/ssl.key',
      target: '/etc/ssl/private/ssl.key',
      readOnly: true,
      type: 'bind',
    };
    expect(classifyVolume(mount)).toBe('secret');
  });

  it('classifies cert file as secret', () => {
    const mount: ComposeVolumeMount = {
      source: './certs/ssl.crt',
      target: '/etc/ssl/certs/ssl.crt',
      readOnly: true,
      type: 'bind',
    };
    expect(classifyVolume(mount)).toBe('secret');
  });

  it('classifies tmpfs as emptydir', () => {
    const mount: ComposeVolumeMount = {
      source: '',
      target: '/tmp/cache',
      readOnly: false,
      type: 'tmpfs',
    };
    expect(classifyVolume(mount)).toBe('emptydir');
  });

  it('classifies /tmp path as emptydir', () => {
    const mount: ComposeVolumeMount = {
      source: '/tmp/app-cache',
      target: '/tmp/cache',
      readOnly: false,
      type: 'bind',
    };
    expect(classifyVolume(mount)).toBe('emptydir');
  });

  it('classifies directory bind mount as pvc', () => {
    const mount: ComposeVolumeMount = {
      source: './data',
      target: '/app/data',
      readOnly: false,
      type: 'bind',
    };
    expect(classifyVolume(mount)).toBe('pvc');
  });
});
