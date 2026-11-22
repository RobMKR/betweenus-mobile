import React, { useEffect, useRef } from "react";
import {
  Modal,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
export const c = {
  ink: "#203b35",
  green: "#176b50",
  muted: "#71817a",
  paper: "#f7f8f3",
  line: "#dfe6dc",
  pale: "#eaf2eb",
  cream: "#e9dfc7",
};
export function Button({
  title,
  onPress,
  secondary = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[s.button, secondary && s.secondary, disabled && { opacity: 0.5 }]}
    >
      <Text style={[s.buttonText, secondary && { color: c.green }]}>
        {title}
      </Text>
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#8a938d"
        {...props}
        style={[
          s.input,
          props.multiline && { minHeight: 108, textAlignVertical: "top" },
          props.style,
        ]}
      />
    </View>
  );
}
export function Choice({
  title,
  active,
  onPress,
}: {
  title: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[s.choice, active && s.choiceActive]}
    >
      <Text style={{ fontWeight: "600", color: active ? "white" : c.green }}>
        {title}
      </Text>
    </Pressable>
  );
}
export function Sheet({
  visible,
  title,
  onClose,
  children,
  scrollKey,
  onRequestClose,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  scrollKey?: string | number;
  onRequestClose?: () => void;
}) {
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  useEffect(() => {
    if (scrollKey !== undefined)
      scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [scrollKey]);
  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onRequestClose || onClose}
    >
      <SafeAreaView style={s.safe}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView
            ref={scrollRef}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={s.sheet}
          >
            <View style={s.rowBetween}>
              <Text style={s.section}>{title}</Text>
              <Pressable
                accessibilityLabel="Close details"
                accessibilityRole="button"
                onPress={onClose}
                style={{ padding: 12, minHeight: 44, minWidth: 44 }}
              >
                <Text style={{ fontSize: 25, color: c.ink }}>×</Text>
              </Pressable>
            </View>
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
export const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.paper },
  page: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    padding: 20,
    paddingBottom: 28,
    gap: 18,
  },
  sheet: {
    width: "100%",
    maxWidth: 650,
    alignSelf: "center",
    padding: 24,
    paddingBottom: 60,
    gap: 18,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  brand: { fontSize: 24, fontWeight: "700", letterSpacing: -0.8, color: c.ink },
  eyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.6,
    color: c.green,
  },
  title: {
    fontSize: 29,
    lineHeight: 35,
    fontWeight: "600",
    letterSpacing: -1.3,
    color: c.ink,
  },
  body: { fontSize: 14, lineHeight: 22, color: c.muted },
  small: { fontSize: 12, lineHeight: 18, color: c.muted },
  section: {
    fontSize: 21,
    fontWeight: "600",
    color: c.ink,
    letterSpacing: -0.5,
  },
  label: { fontSize: 13, fontWeight: "600", color: c.ink },
  input: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#d5ded3",
    borderRadius: 12,
    padding: 15,
    fontSize: 16,
    color: c.ink,
    minHeight: 52,
  },
  button: {
    backgroundColor: c.green,
    padding: 16,
    borderRadius: 13,
    alignItems: "center",
  },
  buttonText: { color: "white", fontSize: 14, fontWeight: "600" },
  secondary: { backgroundColor: c.pale },
  choice: {
    borderRadius: 20,
    backgroundColor: c.pale,
    paddingVertical: 12,
    paddingHorizontal: 15,
    minHeight: 44,
  },
  choiceActive: { backgroundColor: c.green },
  card: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: c.line,
    gap: 9,
  },
  cardTitle: { fontSize: 16, fontWeight: "600", color: c.ink },
  line: { height: 1, backgroundColor: c.line },
  amount: {
    fontSize: 33,
    fontWeight: "600",
    letterSpacing: -0.7,
    color: c.ink,
  },
  error: {
    backgroundColor: "#fff0ed",
    padding: 15,
    borderRadius: 11,
    color: "#a33131",
    lineHeight: 22,
  },
  tag: { fontSize: 10, fontWeight: "700", letterSpacing: 1, color: c.green },
  empty: { alignItems: "center", padding: 22, gap: 12 },
  link: {
    fontSize: 13,
    fontWeight: "600",
    color: c.green,
    paddingVertical: 12,
    minHeight: 44,
  },
  history: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
    gap: 7,
  },
});
