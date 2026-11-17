const { spawnSync } = require("node:child_process");
const demo = process.argv.includes("--demo");
if (!demo && process.env.EXPO_PUBLIC_DEMO_MODE === "true") {
  console.error(
    "Refusing production export with demo mode enabled. Use npm run export:demo for an explicitly local demo build.",
  );
  process.exit(1);
}
const result = spawnSync(
  process.execPath,
  [require.resolve("expo/bin/cli"), "export", "--platform", "web"],
  {
    stdio: "inherit",
    env: { ...process.env, EXPO_PUBLIC_DEMO_MODE: demo ? "true" : "false" },
  },
);
process.exit(result.status ?? 1);
