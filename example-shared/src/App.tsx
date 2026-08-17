import { useMemo, useState } from 'react';
import {
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
// react-native's own SafeAreaView is a no-op on Android, which left the header
// under the status bar and the tab row under the navigation buttons.
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {
  useHoneywellScanner,
  type BarcodeEvent,
} from '@karus-systems/react-native-honeywell-intent';
import { ScanScreen } from './screens/ScanScreen';
import { DiagnosticsScreen } from './screens/DiagnosticsScreen';
import { PlaygroundScreen } from './screens/PlaygroundScreen';
import { AboutScreen } from './screens/AboutScreen';
import { ScannerContext, type ScannerContextValue } from './context';

export type RuntimeMode = 'expo' | 'bare';

type Tab = 'scan' | 'playground' | 'diagnostics' | 'about';

type Props = {
  runtimeMode: RuntimeMode;
};

export default function App({ runtimeMode }: Props) {
  return (
    <SafeAreaProvider>
      <AppContent runtimeMode={runtimeMode} />
    </SafeAreaProvider>
  );
}

function AppContent({ runtimeMode }: Props) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('scan');
  const [history, setHistory] = useState<Array<BarcodeEvent & { at: number }>>(
    []
  );

  const scanner = useHoneywellScanner({
    onBarcode: (event) => {
      setHistory((prev) =>
        [{ ...event, at: Date.now() }, ...prev].slice(0, 20)
      );
    },
  });

  const contextValue: ScannerContextValue = useMemo(
    () => ({
      scanner,
      history,
      clearHistory: () => setHistory([]),
      runtimeMode,
    }),
    [scanner, history, runtimeMode]
  );

  return (
    <ScannerContext.Provider value={contextValue}>
      <View style={styles.root}>
        <StatusBar barStyle="dark-content" />
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Text style={styles.title}>Honeywell Intent Demo</Text>
          <View
            style={[
              styles.modePill,
              runtimeMode === 'expo' ? styles.modeExpo : styles.modeBare,
            ]}
          >
            <Text style={styles.modePillText}>
              {runtimeMode === 'expo' ? 'Expo' : 'Bare RN'}
            </Text>
          </View>
        </View>
        <View style={styles.body}>
          {tab === 'scan' && <ScanScreen />}
          {tab === 'playground' && <PlaygroundScreen />}
          {tab === 'diagnostics' && <DiagnosticsScreen />}
          {tab === 'about' && <AboutScreen />}
        </View>
        <View style={[styles.tabs, { paddingBottom: insets.bottom }]}>
          <TabButton
            label="Scan"
            active={tab === 'scan'}
            onPress={() => setTab('scan')}
          />
          <TabButton
            label="API"
            active={tab === 'playground'}
            onPress={() => setTab('playground')}
          />
          <TabButton
            label="Checks"
            active={tab === 'diagnostics'}
            onPress={() => setTab('diagnostics')}
          />
          <TabButton
            label="About"
            active={tab === 'about'}
            onPress={() => setTab('about')}
          />
        </View>
      </View>
    </ScannerContext.Provider>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.tab, active && styles.tabActive]}
      onPress={onPress}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F7FA' },
  header: {
    paddingHorizontal: 16,

    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#D6DAE0',
    backgroundColor: '#FFFFFF',
  },
  title: { fontSize: 18, fontWeight: '600', color: '#111827' },
  modePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  modeExpo: { backgroundColor: '#E0E7FF' },
  modeBare: { backgroundColor: '#FEF3C7' },
  modePillText: { fontSize: 12, fontWeight: '600', color: '#1F2937' },
  body: { flex: 1 },
  tabs: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#D6DAE0',
    backgroundColor: '#FFFFFF',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabActive: { borderTopWidth: 2, borderTopColor: '#2563EB' },
  tabText: { fontSize: 14, color: '#6B7280' },
  tabTextActive: { color: '#2563EB', fontWeight: '600' },
});
