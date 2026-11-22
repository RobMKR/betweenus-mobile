import React from "react";
import { Pressable, Text, View } from "react-native";
import { Button, useUi } from "../offline/ui";
import type { SavedPerson } from "../people/model";

export default function MemberPicker({
  people,
  selectedIds,
  onChange,
  onAddPerson,
  disabled = false,
}: {
  people: SavedPerson[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onAddPerson: () => void;
  disabled?: boolean;
}) {
  const { c, s } = useUi();
  const selected = new Set(selectedIds);
  return (
    <View style={{ gap: 12 }}>
      <Text style={s.label}>Members · {selected.size} / 100 selected</Text>
      <Text style={s.small}>
        Choose saved people for this vault. You are included separately. An
        empty roster is fine; adding someone grants no account access or
        invitation.
      </Text>
      {!people.length && <Text style={s.body}>No saved people yet.</Text>}
      {people.map((person, index) => {
        const checked = selected.has(person.id);
        const blocked = disabled || (!checked && selected.size >= 100);
        const description =
          person.email || person.phone || `Saved person ${index + 1}`;
        return (
          <Pressable
            key={person.id}
            accessibilityRole="checkbox"
            accessibilityLabel={`${person.name}, ${description}, saved person ${index + 1}`}
            accessibilityState={{ checked, disabled: blocked }}
            aria-checked={checked}
            disabled={blocked}
            onPress={() =>
              onChange(
                checked
                  ? selectedIds.filter((id) => id !== person.id)
                  : [...selectedIds, person.id],
              )
            }
            style={[
              s.card,
              { minHeight: 60, borderColor: checked ? c.accent : c.line },
              blocked && { opacity: 0.5 },
            ]}
          >
            <Text style={s.cardTitle}>
              {checked ? "☑" : "☐"} {person.name}
            </Text>
            <Text style={s.small}>
              Saved person {index + 1} · {description}
            </Text>
          </Pressable>
        );
      })}
      <Button
        title="Add a person"
        secondary
        disabled={disabled}
        onPress={onAddPerson}
      />
      <Text style={s.small}>
        A person saved here stays in People even if you cancel this vault.
      </Text>
    </View>
  );
}
