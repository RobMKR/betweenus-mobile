import React, { useEffect, useRef, useState } from "react";
import { Keyboard, Platform, Pressable, Text, View } from "react-native";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import {
  EventDateFieldProps,
  pickerDate,
  selectedCalendarDate,
} from "./eventDate";
import { useUi } from "./ui";
export default function EventDateField({
  value,
  onChange,
  onEditingChange,
  disabled = false,
}: EventDateFieldProps) {
  const { scheme, c, s } = useUi();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(() => pickerDate(value));
  const androidOpen = useRef(false);
  useEffect(
    () => () => {
      if (androidOpen.current) DateTimePickerAndroid.dismiss("date");
    },
    [],
  );
  function finish() {
    setOpen(false);
    onEditingChange?.(false);
  }
  function show() {
    Keyboard.dismiss();
    const current = pickerDate(value);
    if (Platform.OS === "android") {
      androidOpen.current = true;
      onEditingChange?.(true);
      DateTimePickerAndroid.open({
        value: current,
        mode: "date",
        onValueChange: (_event, date) => {
          androidOpen.current = false;
          const selected = selectedCalendarDate(date);
          if (selected) onChange(selected);
          onEditingChange?.(false);
        },
        onDismiss: () => {
          androidOpen.current = false;
          onEditingChange?.(false);
        },
      });
    } else {
      setDraft(current);
      setOpen(true);
      onEditingChange?.(true);
    }
  }
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.label}>Event date</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Event date"
        accessibilityValue={{ text: value }}
        accessibilityState={{ expanded: open, disabled }}
        disabled={disabled}
        onPress={show}
        style={[s.input, s.rowBetween]}
      >
        <Text style={{ fontSize: 16, color: c.ink }}>{value}</Text>
        <Ionicons name="calendar-outline" size={21} color={c.accent} />
      </Pressable>
      {open && (
        <View style={[s.card, { paddingHorizontal: 0 }]}>
          <View style={[s.rowBetween, { paddingHorizontal: 16 }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel date selection"
              style={{ minWidth: 64, minHeight: 44, justifyContent: "center" }}
              onPress={finish}
            >
              <Text style={s.link}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Use selected date"
              style={{ minWidth: 64, minHeight: 44, justifyContent: "center" }}
              onPress={() => {
                const selected = selectedCalendarDate(draft);
                if (selected) onChange(selected);
                finish();
              }}
            >
              <Text style={s.link}>Use date</Text>
            </Pressable>
          </View>
          <DateTimePicker
            value={draft}
            mode="date"
            display="spinner"
            onValueChange={(_event, date) => setDraft(date)}
            onDismiss={finish}
            themeVariant={scheme}
            accentColor={c.accent}
            style={{ alignSelf: "stretch", height: 216 }}
          />
        </View>
      )}
    </View>
  );
}
