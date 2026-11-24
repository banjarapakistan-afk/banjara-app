import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Chips,
  Divider,
  ErrorText,
  Field,
  Loading,
  Notice,
  Panel,
  Pill,
  ScreenTop,
  Section,
  StateCard,
  intercityStyles as t,
  useTones,
} from '@/components/intercity/IntercityUI';
import { Button } from '@/components/ui/Button';
import { TravelDesignProvider } from '@/components/ui/TravelDesignProvider';
import { useHomeDesign } from '@/constants/homeDesign';
import { Fonts } from '@/constants/typography';
import {
  getDriverBalance,
  reportCommissionPayment,
  type DriverBalance,
  type LedgerEntry,
  type PayChannel,
} from '@/services/intercity.service';
import { formatPakistanTime, formatRupees } from '@/utils/intercity';
import { safeBack } from '@/utils/navigation';

const CHANNELS: Array<{ id: PayChannel; label: string }> = [
  { id: 'easypaisa', label: 'Easypaisa' },
  { id: 'jazzcash', label: 'JazzCash' },
  { id: 'bank', label: 'Bank' },
  { id: 'raast', label: 'Raast' },
  { id: 'other', label: 'Other' },
];
const channelLabel = (value: string | null) => CHANNELS.find((ch) => ch.id === value)?.label ?? 'Payment';

/**
 * Riders pay the fare to the driver in cash; BANJARA's commission on each completed ride
 * is owed by the driver. Balance, where to pay, a form to report a payment (an admin
 * confirms it) and the history.
 */
export default function DriverCommissionScreen() {
  return (
    <TravelDesignProvider>
      <CommissionScreen />
    </TravelDesignProvider>
  );
}

function CommissionScreen() {
  const theme = useHomeDesign();
  const [data, setData] = useState<DriverBalance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await getDriverBalance());
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Your balance could not be loaded.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <ScreenTop title="BANJARA commission" onBack={() => safeBack('/(provider)/intercity' as never)} />
      {!data ? (
        <View style={t.screen}>
          {error ? (
            <StateCard icon="cloud-offline-outline" title="Your balance could not be loaded" body={error}>
              <Button title="Try again" onPress={() => void load()} />
            </StateCard>
          ) : (
            <Loading text="Loading your balance…" />
          )}
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={t.screen}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={async () => {
                  setRefreshing(true);
                  await load();
                  setRefreshing(false);
                }}
              />
            }
          >
            <BalanceView data={data} onReported={load} />
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

function BalanceView({ data, onReported }: { data: DriverBalance; onReported: () => Promise<void> }) {
  const theme = useTones();
  const unclaimed = Math.max(0, data.owed - data.pendingPayments);
  return (
    <>
      <Panel style={[styles.hero, { backgroundColor: data.blocked ? theme.dangerSoft : theme.soft, borderColor: 'transparent' }]}>
        <Text style={[styles.heroLabel, { color: theme.muted }]}>YOU OWE</Text>
        <Text style={[styles.amount, { color: data.blocked ? theme.danger : theme.text }]}>{formatRupees(data.owed)}</Text>
        <Pill
          icon={data.blocked ? 'ban-outline' : data.owed > 0 ? 'wallet-outline' : 'checkmark-circle-outline'}
          text={data.blocked ? 'Pay to take new rides' : data.owed > 0 ? 'Payment due' : 'All paid'}
          tone={data.blocked ? 'warn' : data.owed > 0 ? 'open' : 'done'}
        />
      </Panel>

      <View style={{ gap: 10, marginTop: 12 }}>
        {data.pendingPayments > 0 ? <Notice tone="warn" text={`${formatRupees(data.pendingPayments)} reported, waiting for BANJARA to confirm.`} /> : null}
        {data.blocked && data.message ? <Notice tone="danger" text={data.message} /> : null}
        <Text style={[t.body, { color: theme.muted }]}>
          Riders pay you the fare in cash. BANJARA’s commission is {data.commissionPercent}% of each completed City to City ride. Keep your balance
          under {formatRupees(data.maxDriverDue)} and pay within {data.maxDueDays} days to keep receiving requests.
          {data.dueSince ? ` Oldest unpaid ride: ${formatPakistanTime(data.dueSince)}.` : ''}
        </Text>
      </View>

      {data.owed > 0 ? (
        <Section title="How to pay">
          {data.payTo.length ? (
            data.payTo.map((account, index) => (
              <View key={`${account.channel}-${account.accountNumber}`} style={{ gap: 12 }}>
                {index ? <Divider /> : null}
                <PayAccount account={account} />
              </View>
            ))
          ) : (
            <Text style={[t.body, { color: theme.muted }]}>Contact BANJARA support for the account to pay into.</Text>
          )}
        </Section>
      ) : null}

      {data.owed > 0 ? (
        unclaimed > 0 ? (
          <ReportForm max={unclaimed} onReported={onReported} />
        ) : (
          <View style={{ marginTop: 16 }}>
            <Notice text="Your reported payments cover your balance. We’ll confirm them shortly." />
          </View>
        )
      ) : null}

      {data.entries.length ? (
        <Section title="History">
          {data.entries.map((entry, index) => (
            <View key={entry.id} style={{ gap: 12 }}>
              {index ? <Divider /> : null}
              <HistoryRow entry={entry} />
            </View>
          ))}
        </Section>
      ) : null}
    </>
  );
}

function PayAccount({ account }: { account: DriverBalance['payTo'][number] }) {
  const theme = useHomeDesign();
  const [copied, setCopied] = useState(false);
  return (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: theme.soft }]}>
        <Ionicons name="card-outline" size={17} color={theme.primary} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={[t.small, { color: theme.muted }]}>
          {channelLabel(account.channel)} · {account.accountTitle}
        </Text>
        <Text style={[t.strong, { color: theme.text, fontSize: 15 }]} selectable>
          {account.accountNumber}
        </Text>
        {account.note ? <Text style={[t.small, { color: theme.muted }]}>{account.note}</Text> : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Copy account number ${account.accountNumber}`}
        onPress={() => {
          void Clipboard.setStringAsync(account.accountNumber).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        style={[styles.copy, { backgroundColor: theme.field }]}
      >
        <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={14} color={theme.primary} />
        <Text style={[styles.copyText, { color: theme.primary }]}>{copied ? 'Copied' : 'Copy'}</Text>
      </Pressable>
    </View>
  );
}

function ReportForm({ max, onReported }: { max: number; onReported: () => Promise<void> }) {
  const theme = useHomeDesign();
  const [amount, setAmount] = useState(String(max));
  const [channel, setChannel] = useState<PayChannel>('easypaisa');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setError(null);
    setDone(false);
    const value = Math.round(Number(amount));
    if (!(value > 0) || value > max) return setError(`Enter an amount between Rs 1 and ${formatRupees(max)}.`);
    if (reference.trim().length < 4) return setError('Enter the transaction ID from your payment receipt.');
    setBusy(true);
    try {
      await reportCommissionPayment({ amount: value, channel, reference: reference.trim() });
      setDone(true);
      setReference('');
      await onReported();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The payment could not be reported.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Already paid? Tell us" subtitle="It counts once BANJARA confirms it.">
      <Field label="Amount (Rs)" icon="cash-outline" value={amount} onChangeText={(text) => setAmount(text.replace(/\D/g, ''))} keyboardType="number-pad" />
      <Text style={[styles.label, { color: theme.muted }]}>Paid with</Text>
      <Chips value={channel} onChange={setChannel} options={CHANNELS} />
      <Field
        label="Transaction ID"
        icon="receipt-outline"
        value={reference}
        onChangeText={setReference}
        placeholder="From your receipt, e.g. 0123456789"
        maxLength={80}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      {error ? <ErrorText text={error} /> : null}
      {done ? <Notice tone="ok" text="Payment reported. It counts once BANJARA confirms it." /> : null}
      <Button title="Report payment" onPress={() => void submit()} loading={busy} disabled={busy} />
    </Section>
  );
}

function HistoryRow({ entry: e }: { entry: LedgerEntry }) {
  const theme = useHomeDesign();
  const commission = e.kind === 'commission';
  return (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: theme.soft }]}>
        <Ionicons name={commission ? 'car-outline' : 'arrow-up-outline'} size={16} color={theme.primary} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={[t.strong, { color: theme.text }]} numberOfLines={1}>
          {commission ? e.route ?? 'City to City ride' : `${channelLabel(e.channel)} payment`}
        </Text>
        <Text style={[t.small, { color: theme.muted }]}>
          {formatPakistanTime(e.createdAt)}
          {commission && e.fare ? ` · ${e.percent}% of ${formatRupees(e.fare)}` : ''}
          {!commission && e.reference ? ` · ${e.reference}` : ''}
          {e.status === 'rejected' && e.rejectionReason ? ` · ${e.rejectionReason}` : ''}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={[t.strong, { color: theme.text }]}>{commission ? `+${formatRupees(e.amount)}` : `−${formatRupees(e.amount)}`}</Text>
        {!commission ? (
          <Pill
            text={e.status === 'approved' ? 'Confirmed' : e.status === 'rejected' ? 'Not verified' : 'Waiting'}
            tone={e.status === 'approved' ? 'done' : e.status === 'rejected' ? 'off' : 'warn'}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingVertical: 24, gap: 6 },
  heroLabel: { fontFamily: Fonts.bodyMedium, fontSize: 10, letterSpacing: 0.6 },
  amount: { fontFamily: Fonts.displayBold, fontSize: 32, lineHeight: 38 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  copy: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 12, minHeight: 36 },
  copyText: { fontFamily: Fonts.bodySemiBold, fontSize: 12 },
  label: { fontFamily: Fonts.bodyMedium, fontSize: 11 },
});
