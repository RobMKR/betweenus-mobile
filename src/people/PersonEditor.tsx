import React, { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { Button, Choice, Field, Sheet, s } from "../offline/ui";
import { choosePhoneContact, type PhoneContact } from "./phoneContacts";
import { personFields, type PersonInput, type PersonSource } from "./model";
export default function PersonEditor({
  visible,
  onClose,
  onSave,
  busy = false,
  error = "",
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (input: PersonInput) => Promise<boolean>;
  busy?: boolean;
  error?: string;
}) {
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [phone, setPhone] = useState("");
  const [source, setSource] = useState<PersonSource>("custom");
  const [contact, setContact] = useState<PhoneContact | null>(null);
  const [selecting, setSelecting] = useState(false),
    [message, setMessage] = useState("");
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    if (visible) {
      setName("");
      setEmail("");
      setPhone("");
      setSource("custom");
      setContact(null);
      setMessage("");
      setSelecting(false);
    }
  }, [visible]);
  async function pick() {
    setSelecting(true);
    setMessage("");
    const current = generation.current;
    const result = await choosePhoneContact();
    if (current !== generation.current) return;
    setSelecting(false);
    if (result.status === "selected") {
      setContact(result.contact);
      setName(result.contact.name);
      setEmail("");
      setPhone("");
      setSource("contact");
      setMessage(
        "Review this contact. Choose only the optional details you want to save.",
      );
    } else
      setMessage(
        result.message ||
          "No contact selected. You can enter details yourself.",
      );
  }
  async function save() {
    try {
      const fields = personFields({ name, email, phone, source });
      setMessage("");
      await onSave(fields);
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  return (
    <Sheet
      visible={visible}
      title="Add a person"
      onClose={() => {
        if (!busy) {
          generation.current++;
          onClose();
        }
      }}
    >
      <Text style={s.body}>
        A name is enough. Optional contact details stay in the mode you are
        using. Nothing is sent to this person.
      </Text>
      <Button
        title={selecting ? "Opening phone contacts…" : "Choose phone contact"}
        secondary
        disabled={selecting || busy}
        onPress={() => void pick()}
      />
      {!!message && (
        <Text accessibilityRole="status" style={s.body}>
          {message}
        </Text>
      )}
      <Field
        label="Person name"
        value={name}
        onChangeText={setName}
        maxLength={100}
      />
      {contact ? (
        <>
          <Text style={s.label}>Email to save · optional</Text>
          <View style={s.row}>
            <Choice
              title="No email"
              active={!email}
              onPress={() => setEmail("")}
            />
            {contact.emails.map((item) => (
              <Choice
                key={item}
                title={item}
                active={email === item}
                onPress={() => setEmail(item)}
              />
            ))}
          </View>
          <Text style={s.label}>Phone to save · optional</Text>
          <View style={s.row}>
            <Choice
              title="No phone"
              active={!phone}
              onPress={() => setPhone("")}
            />
            {contact.phones.map((item) => (
              <Choice
                key={item}
                title={item}
                active={phone === item}
                onPress={() => setPhone(item)}
              />
            ))}
          </View>
          <Button
            title="Use custom entry instead"
            secondary
            onPress={() => {
              setSource("custom");
              setContact(null);
              setEmail("");
              setPhone("");
            }}
          />
        </>
      ) : (
        <>
          <Field
            label="Email · optional"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            maxLength={254}
          />
          <Field
            label="Phone · optional"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            maxLength={40}
          />
        </>
      )}
      <Text style={s.small}>
        Only your selected name and at most one email/phone are saved. Device
        contact IDs, photos and the address book are never stored or uploaded.
      </Text>
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      <Button
        title={busy ? "Saving person…" : "Save person"}
        disabled={busy || selecting}
        onPress={() => void save()}
      />
    </Sheet>
  );
}
