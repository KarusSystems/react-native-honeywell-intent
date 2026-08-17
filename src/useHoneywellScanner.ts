import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addBarcodeListener,
  addClaimStateListener,
  claimScanner,
  getDiagnostics,
  releaseScanner,
  setTriggerEnabled,
} from './NativeHoneywellIntent';
import {
  applyClaimState,
  deriveScannerState,
  hasScanner,
  type ScannerPhase,
} from './scannerState';
import type { BarcodeEvent, Diagnostics, ScannerState } from './types';

export type UseHoneywellScannerOptions = {
  onBarcode?: (event: BarcodeEvent) => void;
  /**
   * Claim the scanner as soon as one is available. On by default: nothing is
   * delivered until a claim is held, so leaving it to the caller means a hook
   * that silently receives nothing.
   */
  autoStart?: boolean;
};

export type UseHoneywellScannerResult = {
  hasHardwareScanner: boolean;
  isChecking: boolean;
  isScannerReady: boolean;
  /**
   * A barcode has arrived since the current claim. `isScannerReady` is an
   * assumption — the Intent API never acknowledges a claim and cannot be
   * queried — so this is the only evidence the reader is really yours.
   */
  isScanConfirmed: boolean;
  scannerState: ScannerState;
  diagnostics: Diagnostics | null;
  startReading: () => void;
  stopReading: () => void;
  /** Hand the reader back to the device default. See [releaseReader]. */
  releaseReader: () => void;
  reconfigure: () => Promise<void>;
  refreshDiagnostics: () => Promise<Diagnostics | null>;
};

export function useHoneywellScanner(
  options: UseHoneywellScannerOptions = {}
): UseHoneywellScannerResult {
  const { onBarcode, autoStart = true } = options;
  const callbackRef = useRef(onBarcode);
  callbackRef.current = onBarcode;

  /** Whether the consumer wants barcodes right now. */
  const wantsScannerRef = useRef(false);
  /**
   * Whether we are holding the reader. Distinct from [wantsScannerRef] because
   * `stopReading` deliberately keeps the claim while wanting no barcodes; only
   * this ref knows there is still something to hand back on unmount.
   */
  const holdsClaimRef = useRef(false);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [phase, setPhase] = useState<ScannerPhase>('stopped');
  /**
   * Whether a barcode has arrived since the current claim.
   *
   * Kept here as well as in `diagnostics` so it updates live: diagnostics is a
   * snapshot taken on request, and the whole point of this flag is to stop the
   * UI asserting readiness it has no evidence for.
   */
  const [isScanConfirmed, setIsScanConfirmed] = useState(false);

  const runDiagnostics = useCallback(async () => {
    try {
      const d = await getDiagnostics();
      setDiagnostics(d);
      return d;
    } catch {
      return null;
    }
  }, []);

  // Diagnostics are synchronous device facts here, so a single query on mount
  // settles it — no cold-start race to retry around like DataWedge has.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsChecking(true);
      await runDiagnostics();
      if (!cancelled) setIsChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [runDiagnostics]);

  useEffect(() => {
    const sub = addBarcodeListener((event) => {
      if (!wantsScannerRef.current) return;
      // Proof before delivery: a barcode is the only evidence the claim is real.
      setIsScanConfirmed(true);
      callbackRef.current?.(event);
    });
    return () => sub.remove();
  }, []);

  // The claim is lost on background and retaken on resume by the native module.
  // This is the only readiness signal the Intent API affords us.
  useEffect(() => {
    const sub = addClaimStateListener((event) => {
      // A fresh claim retires the previous proof, matching the native reset.
      if (event.claimed) setIsScanConfirmed(false);
      setPhase(applyClaimState(event, wantsScannerRef.current));
    });
    return () => sub.remove();
  }, []);

  /**
   * Claim the reader and make its trigger live.
   *
   * One call rather than claim-then-enable: `setTriggerEnabled` claims if
   * needed, so this is a single broadcast and cannot leave the reader claimed
   * with a trigger still disabled from an earlier [stopReading].
   */
  const startReading = useCallback(() => {
    wantsScannerRef.current = true;
    holdsClaimRef.current = true;
    setPhase('claiming');
    setTriggerEnabled(true).catch(() => {});
  }, []);

  /**
   * Stop scanning without giving the reader back.
   *
   * Releasing would look equivalent and is not: a released reader reverts to
   * the device default, so the beam still fires and decoded data can land in
   * whatever field has focus. Disabling the trigger while holding the claim is
   * the only way to make scanning genuinely stop. Backgrounding still releases,
   * so holding on to it here does not keep the reader from other apps.
   *
   * Use [releaseReader] when the intent is "I am done with the scanner".
   */
  const stopReading = useCallback(() => {
    wantsScannerRef.current = false;
    setPhase('stopped');
    setTriggerEnabled(false).catch(() => {});
  }, []);

  /**
   * Hand the reader back to the device default.
   *
   * The trigger works again afterwards — this is not a way to stop scanning,
   * it is a way to stop *owning* the scanner.
   */
  const releaseReader = useCallback(() => {
    wantsScannerRef.current = false;
    holdsClaimRef.current = false;
    setPhase('stopped');
    releaseScanner().catch(() => {});
  }, []);

  const reconfigure = useCallback(async () => {
    try {
      await claimScanner();
    } catch {
      // swallow — diagnostics will reflect the failure state
    }
    await runDiagnostics();
  }, [runDiagnostics]);

  // Release on unmount. Without this the Data Collection Service keeps handing
  // barcodes to a dead JS listener until the app itself stops. Keyed on the
  // claim rather than on wanting barcodes: after `stopReading` the consumer
  // wants nothing but we are still holding the reader, and that is exactly the
  // case that must not leak.
  useEffect(() => {
    return () => {
      if (holdsClaimRef.current) {
        wantsScannerRef.current = false;
        holdsClaimRef.current = false;
        releaseScanner().catch(() => {});
      }
    };
  }, []);

  const hasHardwareScanner = hasScanner(diagnostics);

  useEffect(() => {
    if (autoStart && hasHardwareScanner && !wantsScannerRef.current) {
      startReading();
    }
  }, [autoStart, hasHardwareScanner, startReading]);

  return {
    hasHardwareScanner,
    isChecking,
    isScannerReady: phase === 'ready',
    isScanConfirmed,
    scannerState: deriveScannerState({ isChecking, hasHardwareScanner, phase }),
    diagnostics,
    startReading,
    stopReading,
    releaseReader,
    reconfigure,
    refreshDiagnostics: runDiagnostics,
  };
}
