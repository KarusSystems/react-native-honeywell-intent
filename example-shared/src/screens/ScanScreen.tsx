import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { ScannerState } from '@karus-systems/react-native-honeywell-intent';
import { useScannerContext } from '../context';

export function ScanScreen() {
  const { scanner, history, clearHistory } = useScannerContext();
  const latest = history[0];

  return (
    <View style={styles.root}>
      {/*
        "Ready" is an assumption until a barcode proves it — the Intent API never
        acknowledges a claim and offers nothing to query — so the ready state is
        split in two rather than overstating what is known.
      */}
      <View style={styles.statusBlock}>
        <View
          style={[
            styles.statusDot,
            scanner.scannerState === 'ready' && !scanner.isScanConfirmed
              ? styles.dotUnconfirmed
              : STATUS[scanner.scannerState].dot,
          ]}
        />
        <Text style={styles.statusText}>
          {scanner.scannerState === 'ready' && !scanner.isScanConfirmed
            ? 'Claimed — unconfirmed until a scan arrives'
            : scanner.scannerState === 'ready'
              ? 'Scanning confirmed'
              : STATUS[scanner.scannerState].label}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Latest scan</Text>
        {latest ? (
          <>
            <Text style={styles.bigData} numberOfLines={3}>
              {latest.data}
            </Text>
            <Text style={styles.meta}>
              {latest.labelType ?? 'unknown type'} ·{' '}
              {new Date(latest.at).toLocaleTimeString()}
            </Text>
          </>
        ) : (
          <Text style={styles.empty}>Pull the scanner trigger to test.</Text>
        )}
      </View>

      {/*
        Stop reading disables the trigger and keeps the claim, so the scanner
        genuinely stops. Release hands the reader back instead — after which the
        beam fires again under the device default, which is the whole reason the
        two are separate buttons.
      */}
      <View style={styles.buttonRow}>
        <Btn label="Start reading" onPress={scanner.startReading} primary />
        <Btn label="Stop reading" onPress={scanner.stopReading} />
      </View>

      <View style={styles.buttonRow}>
        <Btn label="Release scanner" onPress={scanner.releaseReader} />
        <Btn label="Clear" onPress={clearHistory} />
      </View>

      <Text style={styles.sectionHeader}>History</Text>
      <FlatList
        data={history.slice(1)}
        keyExtractor={(item, idx) => `${item.at}-${idx}`}
        ListEmptyComponent={
          <Text style={styles.empty}>No prior scans this session.</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.rowData} numberOfLines={1}>
              {item.data}
            </Text>
            <Text style={styles.rowMeta}>
              {item.labelType ?? '—'} · {new Date(item.at).toLocaleTimeString()}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

function Btn({
  label,
  onPress,
  primary,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.btn, primary && styles.btnPrimary]}
      onPress={onPress}
    >
      <Text style={[styles.btnText, primary && styles.btnTextPrimary]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const STATUS: Record<ScannerState, { label: string; dot: object }> = {
  checking: { label: 'Checking scanner…', dot: { backgroundColor: '#F59E0B' } },
  unavailable: {
    label: 'Scanner unavailable — see Diagnostics tab',
    dot: { backgroundColor: '#EF4444' },
  },
  stopped: {
    label: 'Scanner stopped — press Start reading',
    dot: { backgroundColor: '#9CA3AF' },
  },
  claiming: {
    label: 'Claiming scanner…',
    dot: { backgroundColor: '#F59E0B' },
  },
  ready: { label: 'Scanner ready', dot: { backgroundColor: '#10B981' } },
};

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16 },
  statusBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },

  statusText: { fontSize: 14, color: '#374151' },
  dotUnconfirmed: { backgroundColor: '#F59E0B' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  cardLabel: {
    fontSize: 11,
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  bigData: { fontSize: 22, fontWeight: '600', color: '#111827' },
  meta: { fontSize: 12, color: '#6B7280', marginTop: 6 },
  empty: { fontSize: 13, color: '#9CA3AF', fontStyle: 'italic' },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  btn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  btnPrimary: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  btnText: { fontSize: 13, color: '#374151' },
  btnTextPrimary: { color: '#FFFFFF', fontWeight: '600' },
  sectionHeader: {
    fontSize: 12,
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  row: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  rowData: { fontSize: 14, color: '#111827' },
  rowMeta: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
});
