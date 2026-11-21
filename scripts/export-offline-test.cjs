const { spawnSync } = require("node:child_process");
// Fake configured auth deliberately proves the offline branch never restores it.
const result = spawnSync(
  process.execPath,
  [
    require.resolve("expo/bin/cli"),
    "export",
    "--platform",
    "web",
    "--output-dir",
    "dist-offline",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      EXPO_NO_DOTENV: "1",
      EXPO_PUBLIC_DEMO_MODE: "false",
      EXPO_PUBLIC_SUPABASE_URL: "https://auth-test.supabase.co",
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-test-key",
      EXPO_PUBLIC_API_URL: "https://api-test.invalid",
    },
  },
);
process.exit(result.status ?? 1);
