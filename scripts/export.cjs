const { spawnSync } = require("node:child_process");
const { writeFileSync } = require("node:fs");
const demo = process.argv.includes("--demo");
const pages = process.argv.includes("--pages");
if (demo && pages) {
  console.error("The GitHub Pages export must run in production mode.");
  process.exit(1);
}
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
    env: {
      ...process.env,
      BETWEENUS_PAGES_EXPORT: pages ? "1" : "0",
      EXPO_PUBLIC_DEMO_MODE: demo ? "true" : "false",
      ...(pages ? { EXPO_NO_DOTENV: "1" } : {}),
    },
  },
);
if (pages && result.status === 0) writeFileSync("dist/.nojekyll", "");
process.exit(result.status ?? 1);
