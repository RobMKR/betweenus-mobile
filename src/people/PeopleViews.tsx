import React from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button, c, s } from "../offline/ui";
import type { SavedPerson } from "./model";
export function SavedPeopleList({
  people,
  onAdd,
  onSelect,
  disabled = false,
}: {
  people: SavedPerson[];
  onAdd: () => void;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <View style={s.rowBetween}>
        <View>
          <Text style={s.title}>People</Text>
          <Text style={s.small}>People you choose to keep here.</Text>
        </View>
      </View>
      <Button title="+ Add person" onPress={onAdd} disabled={disabled} />
      <Text style={s.tag}>SAVED PEOPLE · {people.length}</Text>
      {people.map((person) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open saved person ${person.name}${person.email ? `, ${person.email}` : person.phone ? `, ${person.phone}` : ""}`}
          key={person.id}
          onPress={() => onSelect(person.id)}
          style={s.card}
        >
          <View style={s.rowBetween}>
            <Text style={[s.cardTitle, { flex: 1 }]}>{person.name}</Text>
            <Ionicons name="chevron-forward" size={18} color={c.muted} />
          </View>
          <Text style={s.small}>
            {person.email || person.phone || "Custom details"} ·{" "}
            {person.source === "contact" ? "Selected contact" : "Custom person"}
          </Text>
        </Pressable>
      ))}
      {!people.length && (
        <View style={s.card}>
          <Text style={s.cardTitle}>Start with someone you know</Text>
          <Text style={s.body}>
            Save a name, or choose a phone contact. No invitations, verified
            identity or automatic uploads.
          </Text>
        </View>
      )}
    </>
  );
}
export function SavedPersonDetails({
  person,
  onBack,
  onDebt,
  children,
}: {
  person: SavedPerson;
  onBack: () => void;
  onDebt: () => void;
  children?: React.ReactNode;
}) {
  return (
    <>
      <Pressable accessibilityRole="button" onPress={onBack}>
        <Text style={s.link}>‹ Back to People</Text>
      </Pressable>
      <Text style={s.title}>{person.name}</Text>
      <View style={s.card}>
        <Text style={s.tag}>
          {person.source === "contact" ? "SELECTED CONTACT" : "CUSTOM PERSON"}
        </Text>
        {person.email && (
          <Text selectable style={s.body}>
            {person.email}
          </Text>
        )}
        {person.phone && (
          <Text selectable style={s.body}>
            {person.phone}
          </Text>
        )}
        <Text style={s.small}>
          Saved details are not a verified account or permission to contact this
          person.
        </Text>
      </View>
      <Button title="Add debt for this person" onPress={onDebt} />
      {children}
    </>
  );
}
