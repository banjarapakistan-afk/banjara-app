import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Input } from '@/components/ui/Input';
import { Colors } from '@/constants/colors';
import { Radius, Spacing } from '@/constants/spacing';
import { Fonts } from '@/constants/typography';

/* Small form pieces shared by the guide and tour operator setup screens. */

/** Numbered section header with a one-line explanation. */
export function Section({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <View style={styles.sectionHead}>
      <View style={styles.sectionNumber}>
        <Text style={styles.sectionNumberText}>{n}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.meta}>{sub}</Text>
      </View>
    </View>
  );
}

/** Tappable chips; selected ones show a tick. */
export function Chips({
  options,
  selected,
  onToggle,
  icon,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.chipGrid}>
      {options.map((opt) => {
        const on = selected.includes(opt.value);
        return (
          <Pressable
            key={opt.value}
            onPress={() => onToggle(opt.value)}
            style={[styles.chip, on && styles.chipOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
          >
            {on ? (
              <Ionicons name="checkmark" size={14} color={Colors.primary} />
            ) : icon ? (
              <Ionicons name={icon} size={14} color={Colors.muted} />
            ) : null}
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Multi-line input with a character counter ("12 more characters" until `min`). */
export function Counted({
  label,
  value,
  onChange,
  max,
  min,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  max: number;
  min?: number;
  placeholder?: string;
}) {
  const length = value.trim().length;
  return (
    <View style={{ gap: 4 }}>
      <Input label={label} value={value} onChangeText={onChange} multiline maxLength={max} placeholder={placeholder} />
      <Text style={[styles.counter, min != null && length >= min && { color: Colors.success }]}>
        {min != null && length < min ? `${min - length} more characters` : `${length}/${max}`}
      </Text>
    </View>
  );
}

/** Tag list: type and tap Add (or type a comma); tap a tag to remove it. */
export function Tags({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState('');
  const add = () => {
    const parts = text.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length) onChange([...values, ...parts.filter((p) => !values.some((x) => x.toLowerCase() === p.toLowerCase()))]);
    setText('');
  };
  return (
    <View style={{ gap: Spacing.sm }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {values.length ? (
        <View style={styles.chipGrid}>
          {values.map((v) => (
            <Pressable key={v} style={styles.tag} onPress={() => onChange(values.filter((x) => x !== v))} accessibilityLabel={`Remove ${v}`}>
              <Text style={styles.tagText}>{v}</Text>
              <Ionicons name="close" size={14} color={Colors.primary} />
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={styles.tagInputRow}>
        <TextInput
          style={styles.tagInput}
          value={text}
          placeholder={`${placeholder ?? 'Type'} — then tap Add`}
          placeholderTextColor={Colors.mutedLight}
          onChangeText={(v) => {
            if (v.endsWith(',')) {
              setText(v.slice(0, -1));
              setTimeout(add, 0);
            } else setText(v);
          }}
          onSubmitEditing={add}
          returnKeyType="done"
          blurOnSubmit={false}
        />
        <Pressable onPress={add} disabled={!text.trim()} style={[styles.tagAdd, !text.trim() && { opacity: 0.4 }]} accessibilityLabel={`Add to ${label}`}>
          <Text style={styles.link}>Add</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  meta: { fontFamily: Fonts.body, fontSize: 12, color: Colors.muted },
  link: { fontFamily: Fonts.bodySemiBold, fontSize: 14, color: Colors.primary },
  fieldLabel: { fontFamily: Fonts.bodySemiBold, fontSize: 14, color: Colors.dark },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
  sectionNumber: { width: 26, height: 26, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primarySoft },
  sectionNumberText: { fontFamily: Fonts.bodySemiBold, fontSize: 12, color: Colors.primary },
  sectionTitle: { fontFamily: Fonts.bodySemiBold, fontSize: 16, color: Colors.dark },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  chipOn: { borderColor: Colors.primary, backgroundColor: Colors.primarySoft },
  chipText: { fontFamily: Fonts.bodyMedium, fontSize: 13, color: Colors.dark },
  chipTextOn: { color: Colors.primary, fontFamily: Fonts.bodySemiBold },
  counter: { alignSelf: 'flex-end', fontFamily: Fonts.body, fontSize: 11, color: Colors.muted },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: Spacing.md, paddingRight: Spacing.sm, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: Colors.primarySoft },
  tagText: { fontFamily: Fonts.bodySemiBold, fontSize: 12.5, color: Colors.primary },
  tagInputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingLeft: Spacing.md, paddingRight: Spacing.sm, minHeight: 48, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.inputBg },
  tagInput: { flex: 1, fontFamily: Fonts.body, fontSize: 14, color: Colors.dark, paddingVertical: Spacing.sm },
  tagAdd: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
});
