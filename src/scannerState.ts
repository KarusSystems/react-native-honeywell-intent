import type { ClaimStateEvent, Diagnostics, ScannerState } from './types';

/** What the hook is currently trying to do, before availability is considered. */
export type ScannerPhase = 'stopped' | 'claiming' | 'ready';

export function deriveScannerState(input: {
  isChecking: boolean;
  hasHardwareScanner: boolean;
  phase: ScannerPhase;
}): ScannerState {
  if (input.isChecking) return 'checking';
  if (!input.hasHardwareScanner) return 'unavailable';
  return input.phase;
}

/**
 * Whether a device can scan at all.
 *
 * Note what is NOT consulted: `dataCollectionFound`. The native module probes a
 * fixed list of candidate package names for the Data Collection Service, and
 * that list is known-incomplete across Honeywell's device generations. Gating on
 * it would report a perfectly working CT60 as having no scanner because its DCS
 * lives under a package name nobody wrote down. The device being a Honeywell is
 * the fact we can actually stand behind; a missing DCS package is reported in
 * diagnostics for a human to interpret, not used to block the feature.
 */
export function hasScanner(diagnostics: Diagnostics | null): boolean {
  return !!diagnostics && diagnostics.available;
}

/**
 * Fold a claim-state event into the current phase.
 *
 * The asymmetry with the DataWedge sibling is the whole point of this function.
 * DataWedge answers SCANNER_INPUT_PLUGIN on RESULT_ACTION, so readiness there is
 * *confirmed*. Honeywell's Intent API never acknowledges a claim, so the only
 * events we get are the ones we generate ourselves plus the involuntary
 * revocation when the app backgrounds. A `paused` therefore drops us out of
 * ready — the scanner really is gone until the module re-claims on resume — but
 * it must not clear the user's intent to be scanning, which the caller tracks
 * separately as [wantsScanning].
 *
 * Holding the claim is not the same as scanning, which is why [wantsScanning]
 * decides the outcome before the event does. `stopReading` disables the trigger
 * and deliberately keeps the reader, so it produces a fresh `claimed` event for
 * a scanner that cannot scan; reporting that as ready would describe a state the
 * hardware is not in.
 */
export function applyClaimState(
  event: ClaimStateEvent,
  wantsScanning: boolean
): ScannerPhase {
  if (!wantsScanning) return 'stopped';
  // Lost the reader while the user still wants it: we are between claims, not
  // stopped. Reporting 'stopped' here would make a task switch look like the
  // user had deliberately turned the scanner off.
  return event.claimed ? 'ready' : 'claiming';
}
