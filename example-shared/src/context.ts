import { createContext, useContext } from 'react';
import type {
  BarcodeEvent,
  UseHoneywellScannerResult,
} from '@karus-systems/react-native-honeywell-intent';
import type { RuntimeMode } from './App';

export type ScannerContextValue = {
  scanner: UseHoneywellScannerResult;
  history: Array<BarcodeEvent & { at: number }>;
  clearHistory: () => void;
  runtimeMode: RuntimeMode;
};

export const ScannerContext = createContext<ScannerContextValue | null>(null);

export function useScannerContext(): ScannerContextValue {
  const value = useContext(ScannerContext);
  if (!value) throw new Error('ScannerContext missing — wrap in <App />');
  return value;
}
