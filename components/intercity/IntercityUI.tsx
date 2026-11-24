import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TravelIconAction, TravelSegmentedControl, type TravelIcon } from '@/components/ui/TravelPrimitives';
import { useIsDarkMode } from '@/constants/colors';
import { useHomeDesign } from '@/constants/homeDesign';
import { Fonts } from '@/constants/typography';

/**
 * City to City building blocks, drawn with the Home design (the same tokens, fonts,
 * radii and controls as the home search and trip details screens).
 */

export type HomeTheme = ReturnType<typeof useHomeDesign>;

/** Semantic colours the Home palette doesn't name. */
export function useTones() {
  const theme = useHomeDesign();
  const dark = useIsDarkMode();
  return {
    ...theme,
    success: dark ? '#86DBB1' : '#147D53',
    successSoft: dark ? '#163D30' : '#E8F6EE',
    warning: dark ? '#F5C97A' : '#B45309',
    warningSoft: dark ? '#3D3220' : '#FEF3C7',
    danger: dark ? '#FFAA96' : '#C2410C',
    dangerSoft: dark ? '#50342E' : '#FFEDE5',
  };
}

/** Back button, centred title, optional action: the trip details header. */
export function ScreenTop({
  title,
  onBack,
  action,
}: {
  title: string;
  onBack: () => void;
  action?: { icon: TravelIcon; label: string; onPress: () => void };
}) {
  const theme = useHomeDesign();
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.top, { paddingTop: insets.top + 6, backgroundColor: theme.background, borderBottomColor: theme.border }]}>
      <TravelIconAction icon="arrow-back" label="Go back" onPress={onBack} filled />
      <Text accessibilityRole="header" numberOfLines={1} style={[s.topTitle, { color: theme.text }]}>
        {title}
      </Text>
      {action ? <TravelIconAction icon={action.icon} label={action.label} onPress={action.onPress} filled /> : <View style={s.topSpacer} />}
    </View>
  );
}

/** A titled block: heading in the display font, content in a rounded panel. */
export function Section({
  title,
  subtitle,
  accessory,
  children,
  bare = false,
}: {
  title: string;
  subtitle?: string;
  accessory?: ReactNode;
  children: ReactNode;
  /** Content without the panel around it (lists of cards). */
  bare?: boolean;
}) {
  const theme = useHomeDesign();
  return (
    <View style={s.section}>
      <View style={s.sectionHead}>
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" style={[s.sectionTitle, { color: theme.text }]}>
            {title}
          </Text>
          {subtitle ? <Text style={[s.sectionSub, { color: theme.muted }]}>{subtitle}</Text> : null}
        </View>
        {accessory}
      </View>
      {bare ? <View style={{ gap: 10 }}>{children}</View> : <Panel>{children}</Panel>}
    </View>
  );
}

export function Panel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useHomeDesign();
  return <View style={[s.panel, { backgroundColor: theme.surface, borderColor: theme.border }, style]}>{children}</View>;
}

/** Two or three options in the Home pill track, with the chosen option's hint below. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ id: T; label: string; hint?: string; disabled?: boolean }>;
  value: T;
  onChange: (id: T) => void;
}) {
  const theme = useHomeDesign();
  const hint = options.find((option) => option.id === value)?.hint;
  return (
    <View style={{ gap: 6 }}>
      <TravelSegmentedControl
        options={options}
        value={value}
        onChange={(id) => {
          if (!options.find((option) => option.id === id)?.disabled) onChange(id);
        }}
      />
      {hint ? <Text style={[s.hint, { color: theme.muted }]}>{hint}</Text> : null}
    </View>
  );
}

/** A tappable field (place, date, time) in the Home search style. */
export function PickField({
  label,
  value,
  placeholder,
  icon,
  iconColor,
  onPress,
  error,
  style,
}: {
  label: string;
  value?: string | null;
  placeholder: string;
  icon: TravelIcon;
  iconColor?: string;
  onPress: () => void;
  error?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTones();
  return (
    <View style={[{ gap: 4 }, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value || placeholder}`}
        onPress={onPress}
        style={[s.field, { backgroundColor: theme.field, borderColor: error ? theme.danger : theme.border }]}
      >
        <View style={[s.fieldIcon, { backgroundColor: theme.soft }]}>
          <Ionicons name={icon} size={17} color={iconColor ?? theme.primary} />
        </View>
        <View style={s.fieldCopy}>
          <Text style={[s.fieldLabel, { color: theme.muted }]}>{label}</Text>
          <Text style={[s.fieldValue, { color: value ? theme.text : theme.muted }]} numberOfLines={2}>
            {value || placeholder}
          </Text>
        </View>
        <Ionicons name="chevron-down" size={14} color={theme.muted} />
      </Pressable>
      {error ? <ErrorText text={error} /> : null}
    </View>
  );
}

/** A text input with its label inside the field, like the Home name search. */
export function Field({
  label,
  error,
  hint,
  icon = 'create-outline',
  style,
  ...input
}: TextInputProps & { label: string; error?: string; hint?: string; icon?: TravelIcon }) {
  const theme = useTones();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 4 }}>
      <View style={[s.field, { backgroundColor: theme.field, borderColor: error ? theme.danger : focused ? theme.primary : theme.border }]}>
        <View style={[s.fieldIcon, { backgroundColor: theme.soft }]}>
          <Ionicons name={icon} size={17} color={theme.primary} />
        </View>
        <View style={s.fieldCopy}>
          <Text style={[s.fieldLabel, { color: theme.muted }]}>{label}</Text>
          <TextInput
            placeholderTextColor={theme.muted}
            accessibilityLabel={label}
            {...input}
            onFocus={(event) => {
              setFocused(true);
              input.onFocus?.(event);
            }}
            onBlur={(event) => {
              setFocused(false);
              input.onBlur?.(event);
            }}
            style={[s.input, { color: theme.text }, style]}
          />
        </View>
      </View>
      {hint ? <Text style={[s.hint, { color: theme.muted }]}>{hint}</Text> : null}
      {error ? <ErrorText text={error} /> : null}
    </View>
  );
}

/** − value + for small whole numbers (passengers, bags, hours). */
export function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  icon,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  icon: TravelIcon;
  hint?: string;
}) {
  const theme = useHomeDesign();
  const button = (name: TravelIcon, next: number, disabled: boolean, a11y: string) => (
    <Pressable
      onPress={() => onChange(next)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      hitSlop={6}
      style={[s.stepButton, { backgroundColor: theme.surface, borderColor: theme.border, opacity: disabled ? 0.4 : 1 }]}
    >
      <Ionicons name={name} size={16} color={theme.text} />
    </Pressable>
  );
  return (
    <View style={s.stepper}>
      <View style={[s.fieldIcon, { backgroundColor: theme.soft }]}>
        <Ionicons name={icon} size={17} color={theme.primary} />
      </View>
      <View style={s.fieldCopy}>
        <Text style={[s.stepLabel, { color: theme.text }]}>{label}</Text>
        {hint ? <Text style={[s.hint, { color: theme.muted }]}>{hint}</Text> : null}
      </View>
      {button('remove', value - 1, value <= min, `Fewer: ${label}`)}
      <Text style={[s.stepValue, { color: theme.text }]} accessibilityLiveRegion="polite">
        {value}
      </Text>
      {button('add', value + 1, value >= max, `More: ${label}`)}
    </View>
  );
}

/** Thin rule between rows inside a panel. */
export function Divider() {
  const theme = useHomeDesign();
  return <View style={[s.divider, { backgroundColor: theme.border }]} />;
}

export function ErrorText({ text }: { text: string }) {
  const theme = useTones();
  return (
    <Text style={[s.hint, { color: theme.danger }]} accessibilityRole="alert">
      {text}
    </Text>
  );
}

export function Notice({ tone = 'info', icon, text }: { tone?: 'info' | 'warn' | 'danger' | 'ok'; icon?: TravelIcon; text: string }) {
  const theme = useTones();
  const palette = {
    info: { bg: theme.soft, fg: theme.primary, icon: 'information-circle-outline' as TravelIcon },
    warn: { bg: theme.warningSoft, fg: theme.warning, icon: 'time-outline' as TravelIcon },
    danger: { bg: theme.dangerSoft, fg: theme.danger, icon: 'alert-circle-outline' as TravelIcon },
    ok: { bg: theme.successSoft, fg: theme.success, icon: 'checkmark-circle-outline' as TravelIcon },
  }[tone];
  return (
    <View style={[s.notice, { backgroundColor: palette.bg }]}>
      <Ionicons name={icon ?? palette.icon} size={16} color={palette.fg} />
      <Text style={[s.body, { color: theme.text, flex: 1 }]}>{text}</Text>
    </View>
  );
}

export function Loading({ text = 'Loading…' }: { text?: string }) {
  const theme = useHomeDesign();
  return (
    <View style={s.loading} accessibilityRole="progressbar" accessibilityLabel={text}>
      <ActivityIndicator color={theme.primary} />
      <Text style={[s.body, { color: theme.muted, flex: 1 }]}>{text}</Text>
    </View>
  );
}

/** Centred message with an optional action, for empty, off and error states. */
export function StateCard({ icon = 'car-outline', title, body, children }: { icon?: TravelIcon; title: string; body: string; children?: ReactNode }) {
  const theme = useHomeDesign();
  return (
    <Panel style={s.state}>
      <View style={[s.stateIcon, { backgroundColor: theme.soft }]}>
        <Ionicons name={icon} size={26} color={theme.primary} />
      </View>
      <Text style={[s.sectionTitle, { color: theme.text, textAlign: 'center' }]}>{title}</Text>
      <Text style={[s.body, { color: theme.muted, textAlign: 'center' }]}>{body}</Text>
      {children ? <View style={{ alignSelf: 'stretch', gap: 8, marginTop: 4 }}>{children}</View> : null}
    </Panel>
  );
}

/** Label above value, both left-aligned (addresses wrap cleanly). */
export function Fact({ label, value, icon, accent }: { label: string; value: string; icon?: TravelIcon; accent?: boolean }) {
  const theme = useHomeDesign();
  return (
    <View style={s.fact}>
      <View style={s.factLabelRow}>
        {icon ? <Ionicons name={icon} size={12} color={theme.muted} /> : null}
        <Text style={[s.factLabel, { color: theme.muted }]}>{label}</Text>
      </View>
      <Text style={[s.factValue, { color: accent ? theme.primary : theme.text }]}>{value}</Text>
    </View>
  );
}

/** Small tiles two per row, like the trip details fact grid. */
export function FactGrid({ items }: { items: Array<{ label: string; value: string; icon: TravelIcon; accent?: boolean }> }) {
  const theme = useHomeDesign();
  return (
    <View style={s.grid}>
      {items.map((item) => (
        <View key={item.label} style={[s.tile, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Fact {...item} />
        </View>
      ))}
    </View>
  );
}

/** "Label ........ Rs 1,000" price line. */
export function PriceLine({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const theme = useHomeDesign();
  return (
    <View style={s.priceLine}>
      <Text style={[strong ? s.strong : s.body, { color: strong ? theme.text : theme.muted, flex: 1 }]}>{label}</Text>
      <Text style={[strong ? s.total : s.strongSmall, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

export function Pill({ text, tone = 'neutral', icon }: { text: string; tone?: 'neutral' | 'open' | 'done' | 'off' | 'warn'; icon?: TravelIcon }) {
  const theme = useTones();
  const [bg, fg] = {
    neutral: [theme.field, theme.text],
    open: [theme.soft, theme.primary],
    done: [theme.successSoft, theme.success],
    off: [theme.field, theme.muted],
    warn: [theme.warningSoft, theme.warning],
  }[tone];
  return (
    <View style={[s.pill, { backgroundColor: bg }]}>
      {icon ? <Ionicons name={icon} size={11} color={fg} /> : null}
      <Text style={[s.pillText, { color: fg }]}>{text}</Text>
    </View>
  );
}

/** A horizontal row of selectable chips (vehicle classes, radius steps, pay channels). */
export function Chips<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ id: T; label: string; sub?: string }>;
  value: T | null | undefined;
  onChange: (id: T) => void;
}) {
  const theme = useHomeDesign();
  return (
    <View style={s.chips}>
      {options.map((option) => {
        const on = option.id === value;
        return (
          <Pressable
            key={String(option.id)}
            onPress={() => onChange(option.id)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            style={[s.chip, { backgroundColor: on ? theme.soft : theme.surface, borderColor: on ? theme.primary : theme.border }]}
          >
            <Text style={[s.chipText, { color: on ? theme.primary : theme.text }]}>{option.label}</Text>
            {option.sub ? <Text style={[s.chipSub, { color: theme.muted }]}>{option.sub}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Price on the left, main action on the right, pinned to the bottom: the trip booking bar. */
export function BottomBar({ label, value, sub, children }: { label: string; value: string; sub?: string; children: ReactNode }) {
  const theme = useHomeDesign();
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.bar, { backgroundColor: theme.surface, borderTopColor: theme.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.barLabel, { color: theme.muted }]}>{label}</Text>
        <Text style={[s.barValue, { color: theme.text }]} numberOfLines={1}>
          {value}
        </Text>
        {sub ? (
          <Text style={[s.hint, { color: theme.muted }]} numberOfLines={2}>
            {sub}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** Time of day picker that matches DatePickerModal (dialog on Android, sheet on iOS). */
export function TimePickerModal({
  visible,
  title,
  value,
  onChange,
  onClose,
}: {
  visible: boolean;
  title: string;
  value: string;
  onChange: (hhmm: string) => void;
  onClose: () => void;
}) {
  const theme = useHomeDesign();
  const dark = useIsDarkMode();
  const [draft, setDraft] = useState(() => parseTime(value));
  useEffect(() => {
    if (visible) setDraft(parseTime(value));
  }, [visible, value]);

  if (Platform.OS === 'android') {
    if (!visible) return null;
    return (
      <DateTimePicker
        value={parseTime(value)}
        mode="time"
        display="default"
        onValueChange={(_: unknown, selected?: Date) => {
          onClose();
          if (selected) onChange(formatTime(selected));
        }}
        onDismiss={onClose}
      />
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.modalRoot}>
        <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[s.sheet, { backgroundColor: theme.surface }]}>
          <Text style={[s.sectionTitle, { color: theme.text, textAlign: 'center' }]}>{title}</Text>
          <DateTimePicker
            value={draft}
            mode="time"
            display="spinner"
            minuteInterval={5}
            themeVariant={dark ? 'dark' : 'light'}
            onValueChange={(_: unknown, selected?: Date) => selected && setDraft(selected)}
            style={{ width: '100%', height: 196 }}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={onClose} style={[s.sheetButton, { backgroundColor: theme.field }]} accessibilityRole="button">
              <Text style={[s.strong, { color: theme.muted }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                onChange(formatTime(draft));
                onClose();
              }}
              style={[s.sheetButton, { backgroundColor: theme.action }]}
              accessibilityRole="button"
            >
              <Text style={[s.strong, { color: '#fff' }]}>Done</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function parseTime(value: string) {
  const [h = '9', m = '0'] = (value || '09:00').split(':');
  const date = new Date();
  date.setHours(Number(h) || 0, Number(m) || 0, 0, 0);
  return date;
}

function formatTime(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** "15:30" → "3:30 pm". */
export function displayTime(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) return '';
  const [h, m] = value.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** Badge tone for a ride request's status. */
export function requestTone(status: string): 'open' | 'done' | 'off' {
  if (status === 'open') return 'open';
  if (status === 'matched') return 'done';
  return 'off';
}

export const intercityStyles = StyleSheet.create({
  /** Scroll content: same 16 px gutter as the trip details body. */
  screen: { padding: 16, paddingBottom: 40 },
  body: { fontFamily: Fonts.body, fontSize: 12, lineHeight: 19 },
  small: { fontFamily: Fonts.body, fontSize: 11, lineHeight: 16 },
  strong: { fontFamily: Fonts.bodySemiBold, fontSize: 13, lineHeight: 19 },
  title: { fontFamily: Fonts.display, fontSize: 15, lineHeight: 21 },
  price: { fontFamily: Fonts.displayBold, fontSize: 17, lineHeight: 23 },
  heroTitle: { fontFamily: Fonts.displayBold, fontSize: 24, lineHeight: 30, letterSpacing: -0.4 },
});

const s = StyleSheet.create({
  top: { paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  topTitle: { flex: 1, fontFamily: Fonts.bodySemiBold, fontSize: 14, textAlign: 'center' },
  topSpacer: { width: 44 },
  section: { marginTop: 24, gap: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontFamily: Fonts.display, fontSize: 17, lineHeight: 23, letterSpacing: -0.3 },
  sectionSub: { fontFamily: Fonts.body, fontSize: 12, lineHeight: 18, marginTop: 2 },
  panel: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 12 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 62, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 16, borderWidth: 1 },
  fieldIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  fieldCopy: { flex: 1, minWidth: 0, gap: 2 },
  fieldLabel: { fontFamily: Fonts.bodyMedium, fontSize: 10, lineHeight: 14 },
  fieldValue: { fontFamily: Fonts.bodySemiBold, fontSize: 13, lineHeight: 19 },
  input: { fontFamily: Fonts.bodySemiBold, fontSize: 13, lineHeight: 20, padding: 0, minHeight: 24, textAlignVertical: 'center' },
  hint: { fontFamily: Fonts.body, fontSize: 11, lineHeight: 16 },
  body: intercityStyles.body,
  strong: intercityStyles.strong,
  strongSmall: { fontFamily: Fonts.bodySemiBold, fontSize: 12, lineHeight: 18 },
  total: { fontFamily: Fonts.displayBold, fontSize: 19, lineHeight: 25 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  stepLabel: { fontFamily: Fonts.bodySemiBold, fontSize: 13 },
  stepButton: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepValue: { fontFamily: Fonts.bodyBold, fontSize: 15, minWidth: 22, textAlign: 'center' },
  divider: { height: StyleSheet.hairlineWidth },
  notice: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, alignItems: 'flex-start' },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  state: { alignItems: 'center', paddingVertical: 28, marginTop: 8 },
  stateIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  fact: { gap: 4, flexShrink: 1 },
  factLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  factLabel: { fontFamily: Fonts.body, fontSize: 10, lineHeight: 14 },
  factValue: { fontFamily: Fonts.bodySemiBold, fontSize: 12, lineHeight: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '48%', flexGrow: 1, minWidth: 0, borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 11 },
  priceLine: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  pillText: { fontFamily: Fonts.bodySemiBold, fontSize: 11 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { minHeight: 40, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontFamily: Fonts.bodySemiBold, fontSize: 12 },
  chipSub: { fontFamily: Fonts.body, fontSize: 10, marginTop: 1 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1 },
  barLabel: { fontFamily: Fonts.bodyMedium, fontSize: 10, lineHeight: 15, letterSpacing: 0.4 },
  barValue: { fontFamily: Fonts.displayBold, fontSize: 19, lineHeight: 25 },
  modalRoot: { flex: 1, justifyContent: 'center', paddingHorizontal: 16 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8,17,31,0.45)' },
  sheet: { borderRadius: 24, padding: 20, gap: 12 },
  sheetButton: { flex: 1, minHeight: 48, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
