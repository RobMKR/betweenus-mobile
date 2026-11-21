import React from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import type { Ledger, LocalRecord, Vault } from "./model";
import { totals } from "./model";
import { money } from "../api";
import { Button, c, s } from "./ui";
export default function OfflineOverview({
  ledger,
  ready,
  busy,
  onAddDebt,
  onCreateVault,
  onPeople,
  onVaults,
  recordRow,
  vaultRow,
}: {
  ledger: Ledger;
  ready: boolean;
  busy: boolean;
  onAddDebt: () => void;
  onCreateVault: () => void;
  onPeople: () => void;
  onVaults: () => void;
  recordRow: (r: LocalRecord) => React.ReactNode;
  vaultRow: (v: Vault) => React.ReactNode;
}) {
  const balance = totals(ledger);
  const narrow = useWindowDimensions().width < 360;
  return (
    <>
      <View style={{ gap: 7 }}>
        <Text style={s.eyebrow}>YOUR DAY, A LITTLE CLEARER</Text>
        <Text style={s.title}>Good times. Clear balances.</Text>
      </View>
      <View
        style={[
          s.card,
          {
            backgroundColor: c.ink,
            borderColor: c.ink,
            padding: 22,
            gap: 18,
          },
        ]}
      >
        <Text style={[s.tag, { color: "#bdd4c2" }]}>
          REMAINING ON YOUR RECORDS
        </Text>
        <View
          style={[
            s.rowBetween,
            {
              alignItems: "flex-start",
              flexDirection: narrow ? "column" : "row",
            },
          ]}
        >
          <View style={{ gap: 8, flex: 1 }}>
            <Text style={{ color: "#bfd1c5", fontSize: 12 }}>Owed to you</Text>
            <Text
              accessibilityLabel="Offline receivable"
              style={{ fontSize: 24, fontWeight: "600", color: "white" }}
            >
              {ready ? money(balance.receivableMinor) : "—"}
            </Text>
          </View>
          <View style={{ gap: 8, flex: 1 }}>
            <Text style={{ color: "#bfd1c5", fontSize: 12 }}>You owe</Text>
            <Text style={{ fontSize: 24, fontWeight: "600", color: "white" }}>
              {ready ? money(balance.payableMinor) : "—"}
            </Text>
          </View>
        </View>
        <Text style={{ fontSize: 11, lineHeight: 17, color: "#b2c9b8" }}>
          Includes archived vaults. Your own notes, not confirmations from
          others.
        </Text>
      </View>
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <Button
            title="+ Add debt"
            disabled={!ready || busy}
            onPress={onAddDebt}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title="Create vault"
            secondary
            disabled={!ready || busy}
            onPress={onCreateVault}
          />
        </View>
      </View>
      <View style={s.rowBetween}>
        <Text style={s.section}>Recent records</Text>
        <Pressable accessibilityRole="button" onPress={onPeople}>
          <Text style={s.link}>All people</Text>
        </Pressable>
      </View>
      {ledger.records.slice(0, 3).map(recordRow)}
      {!ledger.records.length && (
        <View style={s.card}>
          <Text style={s.cardTitle}>Remember the little loans</Text>
          <Text style={s.body}>
            Add money you lent or borrowed. A name is all you need.
          </Text>
        </View>
      )}
      <View style={s.rowBetween}>
        <Text style={s.section}>Your vaults</Text>
        <Pressable accessibilityRole="button" onPress={onVaults}>
          <Text style={s.link}>View all vaults</Text>
        </Pressable>
      </View>
      {ledger.vaults
        .filter((v) => !v.archived)
        .slice(0, 2)
        .map(vaultRow)}
      {!ledger.vaults.some((v) => !v.archived) && (
        <Text style={s.body}>
          Trips, games, and shared moments. Create a vault to keep each event
          together.
        </Text>
      )}
    </>
  );
}
