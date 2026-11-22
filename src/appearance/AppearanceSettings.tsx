import { Text, View } from "react-native";
import { Choice, useUi } from "../offline/ui";
import { useAppearance } from "./AppearanceProvider";
import { appearancePreferences } from "./preference";

const labels = { system: "System", light: "Light", dark: "Dark" };

export default function AppearanceSettings() {
  const { s } = useUi();
  const { preference, busy, error, changePreference } = useAppearance();
  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>Appearance</Text>
      <View style={s.row} role="group" accessibilityLabel="Appearance">
        {appearancePreferences.map((option) => (
          <Choice
            key={option}
            title={labels[option]}
            active={preference === option}
            disabled={busy}
            onPress={() => void changePreference(option)}
          />
        ))}
      </View>
      <Text style={s.small}>System follows your device appearance.</Text>
      {!!error && (
        <Text style={s.error} accessibilityRole="alert">
          {error}
        </Text>
      )}
    </View>
  );
}
