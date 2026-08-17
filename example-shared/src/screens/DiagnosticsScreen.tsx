import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  openScannerSettings,
  type Diagnostics,
} from '@karus-systems/react-native-honeywell-intent';
import { useScannerContext } from '../context';

type Row = {
  label: string;
  ok: boolean;
  value: string;
  hint?: string;
};

/**
 * Shorter than the DataWedge equivalent, and that is the honest outcome rather
 * than an unfinished screen. Honeywell's Data Collection Service is firmware
 * with no query surface on the Intent API — there is no "is the service
 * enabled", no profile list, no version handshake to ask for. What is left is
 * device facts plus the claim state this library owns.
 */
function diagnosticsToRows(d: Diagnostics | null): Row[] {
  if (!d) return [];
  return [
    {
      label: 'Honeywell device',
      ok: d.isHoneywellDevice,
      value: d.isHoneywellDevice ? `${d.manufacturer} ${d.model}` : 'No',
      hint: d.isHoneywellDevice
        ? undefined
        : 'The Data Collection Intent API only exists on Honeywell/Intermec handhelds (CT40, CT60, CK65, EDA series).',
    },
    {
      label: 'Data Collection Service',
      // A miss here is inconclusive, not a failure — the candidate package list
      // is known-incomplete, so don't paint it red.
      ok: true,
      value: d.dataCollectionFound ? (d.dataCollectionPackage ?? 'Found') : '—',
      hint: d.dataCollectionFound
        ? undefined
        : 'No known DCS package matched. Scanning may still work: this probe is a hint, not a requirement.',
    },
    {
      label: 'DCS version',
      ok: true,
      value: d.dataCollectionVersion ?? '—',
    },
    {
      label: 'Claim requested',
      ok: d.claimRequested,
      value: d.claimRequested ? 'Yes' : 'No',
      hint: d.claimRequested
        ? undefined
        : 'Nothing is delivered until the scanner is claimed. Start scanning on the Scan tab.',
    },
    {
      label: 'Scanner claimed',
      ok: d.claimed,
      value: d.claimed ? 'Yes' : 'No',
      hint: d.claimed
        ? 'Optimistic — the Intent API never acknowledges a claim. A barcode arriving is the only real proof.'
        : 'The claim is released whenever the app backgrounds and retaken on resume.',
    },
    {
      label: 'Reader',
      ok: true,
      value: d.scanner,
    },
    {
      label: 'Profile',
      ok: true,
      value: d.profile,
    },
    {
      label: 'Scan intent action',
      ok: true,
      value: d.scanAction,
    },
  ];
}

export function DiagnosticsScreen() {
  const { scanner } = useScannerContext();
  const rows = diagnosticsToRows(scanner.diagnostics);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.summary}>
        <View
          style={[
            styles.summaryDot,
            scanner.hasHardwareScanner ? styles.dotOk : styles.dotBad,
          ]}
        />
        <Text style={styles.summaryText}>
          {scanner.isChecking
            ? 'Checking…'
            : scanner.hasHardwareScanner
              ? 'Everything looks good'
              : 'Scanner not ready — review failing rows'}
        </Text>
      </View>

      {rows.map((row) => (
        <View key={row.label} style={styles.row}>
          <View style={styles.rowHeader}>
            <Text style={styles.rowLabel}>{row.label}</Text>
            <View
              style={[styles.pill, row.ok ? styles.pillOk : styles.pillBad]}
            >
              <Text style={styles.pillText}>{row.value}</Text>
            </View>
          </View>
          {row.hint && <Text style={styles.rowHint}>{row.hint}</Text>}
        </View>
      ))}

      <View style={styles.actions}>
        <ActionBtn label="Refresh" onPress={scanner.refreshDiagnostics} />
        <ActionBtn
          label="Re-claim scanner"
          onPress={scanner.reconfigure}
          primary
        />
        <ActionBtn
          label="Open Data Collection settings"
          onPress={() => openScannerSettings()}
        />
      </View>
    </ScrollView>
  );
}

function ActionBtn({
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
      style={[styles.actionBtn, primary && styles.actionBtnPrimary]}
      onPress={onPress}
    >
      <Text style={[styles.actionText, primary && styles.actionTextPrimary]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  summaryDot: { width: 12, height: 12, borderRadius: 6, marginRight: 10 },
  summaryText: { fontSize: 14, color: '#111827', fontWeight: '500' },
  dotOk: { backgroundColor: '#10B981' },
  dotBad: { backgroundColor: '#EF4444' },
  row: {
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLabel: { fontSize: 13, color: '#374151', flex: 1, marginRight: 8 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pillOk: { backgroundColor: '#D1FAE5' },
  pillBad: { backgroundColor: '#FEE2E2' },
  pillText: { fontSize: 12, fontWeight: '600', color: '#111827' },
  rowHint: { fontSize: 12, color: '#6B7280', marginTop: 6 },
  actions: { marginTop: 16, gap: 8 },
  actionBtn: {
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  actionBtnPrimary: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  actionText: { fontSize: 14, color: '#374151' },
  actionTextPrimary: { color: '#FFFFFF', fontWeight: '600' },
});
