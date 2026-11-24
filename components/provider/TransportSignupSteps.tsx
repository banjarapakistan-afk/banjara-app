import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/colors';
import { Radius, Spacing } from '@/constants/spacing';
import { Fonts } from '@/constants/typography';

/** The four screens a driver fills in after choosing Transportation. */
export const TRANSPORT_SIGNUP_STEPS = [
  'Your details',
  'Location',
  'Vehicle',
  'CNIC',
] as const;

/**
 * "Step 2 of 4" with a segmented bar, so drivers always know how much is left.
 * `current` is 1-based. Finished steps show a tick.
 */
export function TransportSignupSteps({
  current,
  hint,
}: {
  current: 1 | 2 | 3 | 4;
  hint?: string;
}) {
  return (
    <View style={styles.wrap} accessibilityRole="progressbar" accessibilityLabel={`Step ${current} of 4: ${TRANSPORT_SIGNUP_STEPS[current - 1]}`}>
      <View style={styles.topRow}>
        <Text style={styles.count}>
          Step {current} of {TRANSPORT_SIGNUP_STEPS.length}
        </Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <View style={styles.bar}>
        {TRANSPORT_SIGNUP_STEPS.map((label, index) => {
          const step = index + 1;
          const done = step < current;
          const active = step === current;
          return (
            <View key={label} style={styles.segment}>
              <View
                style={[
                  styles.track,
                  (done || active) && { backgroundColor: Colors.primary },
                ]}
              />
              <View style={styles.labelRow}>
                {done ? (
                  <Ionicons name="checkmark-circle" size={13} color={Colors.success} />
                ) : null}
                <Text
                  numberOfLines={1}
                  style={[
                    styles.label,
                    active && styles.labelActive,
                    done && { color: Colors.dark },
                  ]}
                >
                  {label}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.sm },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.sm },
  count: { fontFamily: Fonts.bodySemiBold, fontSize: 12, color: Colors.primary, letterSpacing: 0.4, textTransform: 'uppercase' },
  hint: { fontFamily: Fonts.body, fontSize: 12, color: Colors.muted, flexShrink: 1, textAlign: 'right' },
  bar: { flexDirection: 'row', gap: 6 },
  segment: { flex: 1, gap: 6 },
  track: { height: 4, borderRadius: Radius.full, backgroundColor: Colors.border },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  label: { fontFamily: Fonts.body, fontSize: 11, color: Colors.muted, flexShrink: 1 },
  labelActive: { fontFamily: Fonts.bodySemiBold, color: Colors.primary },
});
