import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { triggerSoftScan } from '@karus-systems/react-native-honeywell-intent';
import { useScannerContext } from '../context';

export function AboutScreen() {
  const { scanner, runtimeMode } = useScannerContext();
  const d = scanner.diagnostics;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Section label="Runtime">
        <Row k="Mode" v={runtimeMode === 'expo' ? 'Expo managed' : 'Bare RN'} />
      </Section>

      <Section label="Claim">
        <Row k="Reader" v={d?.scanner ?? '—'} />
        <Row k="Profile" v={d?.profile ?? '—'} />
        <Row k="Scan action" v={d?.scanAction ?? '—'} />
        <Row k="DCS version" v={d?.dataCollectionVersion ?? '—'} />
      </Section>

      <Section label="Soft trigger">
        <Text style={styles.blurb}>
          Send an ACTION_CONTROL_SCANNER broadcast to start or stop the beam —
          useful for devices with a trigger-less form factor. Requires the
          scanner to be claimed first.
        </Text>
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary]}
            onPress={() => triggerSoftScan(true)}
          >
            <Text style={styles.btnTextPrimary}>Start soft scan</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.btn}
            onPress={() => triggerSoftScan(false)}
          >
            <Text style={styles.btnText}>Stop</Text>
          </TouchableOpacity>
        </View>
      </Section>

      <Section label="About">
        <Text style={styles.blurb}>
          react-native-honeywell-intent — Honeywell barcode scanning over the
          Data Collection Intent API. No Mobility SDK binary, no vendored AAR:
          claim, configure and read the scanner entirely over broadcasts.
        </Text>
      </Section>
    </ScrollView>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowKey}>{k}</Text>
      <Text style={styles.rowVal} numberOfLines={2}>
        {v}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16 },
  section: { marginBottom: 16 },
  sectionLabel: {
    fontSize: 11,
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    paddingLeft: 4,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3F4F6',
  },
  rowKey: { fontSize: 13, color: '#6B7280' },
  rowVal: {
    fontSize: 13,
    color: '#111827',
    marginLeft: 16,
    flexShrink: 1,
    textAlign: 'right',
  },
  blurb: { fontSize: 13, color: '#374151', lineHeight: 19 },
  buttonRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
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
  btnTextPrimary: { fontSize: 13, color: '#FFFFFF', fontWeight: '600' },
});
