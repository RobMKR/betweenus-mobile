import React from "react";
import { Text, View } from "react-native";
import { validDate } from "./model";
import type { EventDateFieldProps } from "./eventDate";
import { useUi } from "./ui";
/** Browser date input is separate so native bundles never import DOM controls. */
export default function EventDateField({
  value,
  onChange,
  disabled = false,
}: EventDateFieldProps) {
  const { scheme, c, s } = useUi();
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.label}>Event date</Text>
      <input
        type="date"
        aria-label="Event date"
        value={value}
        disabled={disabled}
        onKeyUp={(event) => {
          if (event.key === "Escape") event.stopPropagation();
        }}
        onChange={(event) => {
          const next = event.target.value;
          if (next) {
            try {
              onChange(validDate(next));
            } catch {
              /* Keep the committed value until a complete valid date is chosen. */
            }
          }
        }}
        style={{
          boxSizing: "border-box",
          minWidth: 0,
          width: "100%",
          minHeight: 52,
          padding: 15,
          border: `1px solid ${c.inputBorder}`,
          borderRadius: 12,
          background: c.surface,
          colorScheme: scheme,
          color: c.ink,
          font: "inherit",
          fontSize: 16,
        }}
      />
    </View>
  );
}
