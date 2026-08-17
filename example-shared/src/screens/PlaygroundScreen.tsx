import { useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  addBarcodeListener,
  addClaimStateListener,
  claimScanner,
  getDiagnostics,
  openScannerSettings,
  releaseScanner,
  setScannerClaimed,
  setTriggerEnabled,
  triggerSoftScan,
} from '@karus-systems/react-native-honeywell-intent';
import { useScannerContext } from '../context';

/**
 * Every public call, invocable on its own, with what it returned.
 *
 * The Scan tab exercises the sensible combinations; this one deliberately does
 * not. Several of these calls are only distinguishable by what they *fail* to
 * do — releasing does not stop the beam, a soft scan does nothing without a
 * claim — and that is only observable by firing them one at a time and watching
 * the log against the hardware.
 */

type Entry = {
  at: number;
  label: string;
  detail: string;
  kind: 'call' | 'ok' | 'error' | 'event';
};

const MAX_ENTRIES = 60;

export function PlaygroundScreen() {
  const { scanner } = useScannerContext();
  const [log, setLog] = useState<Entry[]>([]);
  // Kept in a ref so the listener effect never needs to re-subscribe; a
  // resubscribe would drop events fired while it was torn down.
  const appendRef = useRef<(e: Omit<Entry, 'at'>) => void>(() => {});

  appendRef.current = (e) =>
    setLog((prev) => [{ ...e, at: Date.now() }, ...prev].slice(0, MAX_ENTRIES));

  const append = (e: Omit<Entry, 'at'>) => appendRef.current(e);

  /** Fire a promise-returning call and log whatever comes back. */
  const run = (label: string, fn: () => Promise<unknown>) => {
    append({ label, detail: 'called', kind: 'call' });
    fn().then(
      (value) =>
        append({ label, detail: `resolved ${format(value)}`, kind: 'ok' }),
      (err: unknown) =>
        append({
          label,
          detail: `rejected ${err instanceof Error ? err.message : String(err)}`,
          kind: 'error',
        })
    );
  };

  // These duplicate the hook's own listeners on purpose: the raw exports are
  // part of the public API and worth being able to see firing independently.
  useEffect(() => {
    const barcode = addBarcodeListener((event) =>
      appendRef.current({
        label: 'onBarcode',
        detail: `${event.data} · ${event.labelType ?? 'no labelType'}`,
        kind: 'event',
      })
    );
    const claim = addClaimStateListener((event) =>
      appendRef.current({
        label: 'onClaimStateChange',
        detail: `claimed=${event.claimed} · ${event.reason}`,
        kind: 'event',
      })
    );
    return () => {
      barcode.remove();
      claim.remove();
    };
  }, []);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Section title="Claim">
        <Row>
          <Btn
            label="claimScanner()"
            onPress={() => run('claimScanner', claimScanner)}
          />
          <Btn
            label="releaseScanner()"
            onPress={() => run('releaseScanner', releaseScanner)}
          />
        </Row>
        <Row>
          <Btn
            label="setScannerClaimed(true)"
            onPress={() =>
              run('setScannerClaimed(true)', () => setScannerClaimed(true))
            }
          />
          <Btn
            label="setScannerClaimed(false)"
            onPress={() =>
              run('setScannerClaimed(false)', () => setScannerClaimed(false))
            }
          />
        </Row>
      </Section>

      <Section
        title="Trigger"
        note="Disabling needs the claim held — it claims first if you have not."
      >
        <Row>
          <Btn
            label="setTriggerEnabled(true)"
            onPress={() =>
              run('setTriggerEnabled(true)', () => setTriggerEnabled(true))
            }
          />
          <Btn
            label="setTriggerEnabled(false)"
            onPress={() =>
              run('setTriggerEnabled(false)', () => setTriggerEnabled(false))
            }
          />
        </Row>
        <Row>
          <Btn
            label="triggerSoftScan(true)"
            onPress={() =>
              run('triggerSoftScan(true)', () => triggerSoftScan(true))
            }
          />
          <Btn
            label="triggerSoftScan(false)"
            onPress={() =>
              run('triggerSoftScan(false)', () => triggerSoftScan(false))
            }
          />
        </Row>
      </Section>

      <Section title="Query">
        <Row>
          <Btn
            label="getDiagnostics()"
            onPress={() =>
              run('getDiagnostics', async () => {
                const d = await getDiagnostics();
                return `claimed=${d.claimed} trigger=${d.triggerEnabled} confirmed=${d.scanConfirmed}`;
              })
            }
          />
          <Btn
            label="openScannerSettings()"
            onPress={() => run('openScannerSettings', openScannerSettings)}
          />
        </Row>
      </Section>

      <Section
        title="Hook"
        note="useHoneywellScanner's own methods, which compose the calls above."
      >
        <Row>
          <Btn
            label="startReading()"
            onPress={() => {
              append({ label: 'startReading', detail: 'called', kind: 'call' });
              scanner.startReading();
            }}
          />
          <Btn
            label="stopReading()"
            onPress={() => {
              append({ label: 'stopReading', detail: 'called', kind: 'call' });
              scanner.stopReading();
            }}
          />
        </Row>
        <Row>
          <Btn
            label="releaseReader()"
            onPress={() => {
              append({
                label: 'releaseReader',
                detail: 'called',
                kind: 'call',
              });
              scanner.releaseReader();
            }}
          />
          <Btn
            label="reconfigure()"
            onPress={() => run('reconfigure', scanner.reconfigure)}
          />
        </Row>
      </Section>

      <View style={styles.stateBar}>
        <Text style={styles.stateText}>
          state <Text style={styles.stateValue}>{scanner.scannerState}</Text>
          {'   '}confirmed{' '}
          <Text style={styles.stateValue}>
            {scanner.isScanConfirmed ? 'yes' : 'no'}
          </Text>
        </Text>
      </View>

      <View style={styles.logHeaderRow}>
        <Text style={styles.sectionTitle}>Log</Text>
        <TouchableOpacity onPress={() => setLog([])}>
          <Text style={styles.clearLink}>Clear</Text>
        </TouchableOpacity>
      </View>

      {log.length === 0 ? (
        <Text style={styles.empty}>Nothing yet — press something above.</Text>
      ) : (
        log.map((entry, idx) => (
          <View key={`${entry.at}-${idx}`} style={styles.logRow}>
            <View style={[styles.kindDot, KIND_STYLE[entry.kind]]} />
            <View style={styles.logBody}>
              <Text style={styles.logLabel}>{entry.label}</Text>
              <Text style={styles.logDetail}>{entry.detail}</Text>
            </View>
            <Text style={styles.logTime}>
              {new Date(entry.at).toLocaleTimeString()}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

function format(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

const KIND_STYLE: Record<Entry['kind'], object> = {
  call: { backgroundColor: '#9CA3AF' },
  ok: { backgroundColor: '#10B981' },
  error: { backgroundColor: '#EF4444' },
  event: { backgroundColor: '#2563EB' },
};

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {note && <Text style={styles.sectionNote}>{note}</Text>}
      {children}
    </View>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

function Btn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.btn} onPress={onPress}>
      <Text style={styles.btnText} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 12,
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  sectionNote: { fontSize: 12, color: '#9CA3AF', marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  btn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  btnText: { fontSize: 12, color: '#374151' },
  stateBar: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
    marginBottom: 12,
  },
  stateText: { fontSize: 12, color: '#374151' },
  stateValue: { fontWeight: '700', color: '#111827' },
  logHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  clearLink: { fontSize: 12, color: '#2563EB', fontWeight: '600' },
  empty: { fontSize: 13, color: '#9CA3AF', fontStyle: 'italic' },
  logRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  kindDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
    marginRight: 8,
  },
  logBody: { flex: 1 },
  logLabel: { fontSize: 13, color: '#111827', fontWeight: '600' },
  logDetail: { fontSize: 12, color: '#6B7280', marginTop: 1 },
  logTime: { fontSize: 10, color: '#9CA3AF', marginLeft: 8 },
});
