import { describe, expect, it } from '@jest/globals';
import {
  applyClaimState,
  deriveScannerState,
  hasScanner,
} from '../scannerState';
import type { Diagnostics } from '../types';

const diagnostics = (overrides: Partial<Diagnostics> = {}): Diagnostics => ({
  isHoneywellDevice: true,
  manufacturer: 'Honeywell',
  model: 'CT60',
  dataCollectionFound: true,
  dataCollectionPackage: 'com.intermec.datacollectionservice',
  dataCollectionVersion: '1.0.0',
  scanAction: 'com.example.app.SCAN',
  scanner: 'dcs.scanner.imager',
  profile: 'DEFAULT',
  claimRequested: false,
  claimed: false,
  triggerEnabled: true,
  available: true,
  ...overrides,
});

describe('deriveScannerState', () => {
  it('reports checking before availability is known', () => {
    expect(
      deriveScannerState({
        isChecking: true,
        hasHardwareScanner: false,
        phase: 'stopped',
      })
    ).toBe('checking');
  });

  it('reports unavailable ahead of any phase', () => {
    expect(
      deriveScannerState({
        isChecking: false,
        hasHardwareScanner: false,
        phase: 'ready',
      })
    ).toBe('unavailable');
  });

  it('passes the phase through once a scanner is available', () => {
    expect(
      deriveScannerState({
        isChecking: false,
        hasHardwareScanner: true,
        phase: 'claiming',
      })
    ).toBe('claiming');
  });
});

describe('hasScanner', () => {
  it('is false without diagnostics', () => {
    expect(hasScanner(null)).toBe(false);
  });

  it('follows `available`', () => {
    expect(hasScanner(diagnostics({ available: true }))).toBe(true);
    expect(hasScanner(diagnostics({ available: false }))).toBe(false);
  });

  it('does not require the DCS package to have been located', () => {
    // The candidate package list is known-incomplete; a miss must not report a
    // working Honeywell device as having no scanner.
    expect(
      hasScanner(
        diagnostics({
          dataCollectionFound: false,
          dataCollectionPackage: null,
          dataCollectionVersion: null,
        })
      )
    ).toBe(true);
  });
});

describe('applyClaimState', () => {
  it('is ready once the claim is held', () => {
    expect(applyClaimState({ claimed: true, reason: 'claimed' }, true)).toBe(
      'ready'
    );
  });

  it('returns to claiming when the claim is lost but still wanted', () => {
    // Backgrounding revokes the claim; the module re-claims on resume. Calling
    // this 'stopped' would make a task switch look like a deliberate stop.
    expect(applyClaimState({ claimed: false, reason: 'paused' }, true)).toBe(
      'claiming'
    );
  });

  it('is stopped when the claim is released and not wanted', () => {
    expect(applyClaimState({ claimed: false, reason: 'released' }, false)).toBe(
      'stopped'
    );
  });
});
