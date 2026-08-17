import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addBarcodeListener,
  addClaimStateListener,
  claimScanner,
  getDiagnostics,
  releaseScanner,
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
  scannerState: ScannerState;
  diagnostics: Diagnostics | null;
  startReading: () => void;
  stopReading: () => void;
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
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [phase, setPhase] = useState<ScannerPhase>('stopped');

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
      callbackRef.current?.(event);
    });
    return () => sub.remove();
  }, []);

  // The claim is lost on background and retaken on resume by the native module.
  // This is the only readiness signal the Intent API affords us.
  useEffect(() => {
    const sub = addClaimStateListener((event) => {
      setPhase(applyClaimState(event, wantsScannerRef.current));
    });
    return () => sub.remove();
  }, []);

  const startReading = useCallback(() => {
    wantsScannerRef.current = true;
    setPhase('claiming');
    claimScanner().catch(() => {});
  }, []);

  const stopReading = useCallback(() => {
    wantsScannerRef.current = false;
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
  // barcodes to a dead JS listener until the app itself stops.
  useEffect(() => {
    return () => {
      if (wantsScannerRef.current) {
        wantsScannerRef.current = false;
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
    scannerState: deriveScannerState({ isChecking, hasHardwareScanner, phase }),
    diagnostics,
    startReading,
    stopReading,
    reconfigure,
    refreshDiagnostics: runDiagnostics,
  };
}
