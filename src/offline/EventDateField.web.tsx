import React from "react";
import { Text, View } from "react-native";
import { validDate } from "./model";
import type { EventDateFieldProps } from "./eventDate";
import { s } from "./ui";
/** Browser date input is separate so native bundles never import DOM controls. */
export default function EventDateField({
  value,
  onChange,
  disabled = false,
}: EventDateFieldProps) {
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
          border: "1px solid #d5ded3",
          borderRadius: 12,
          background: "white",
          color: "#203b35",
          font: "inherit",
          fontSize: 16,
        }}
      />
    </View>
  );
}
