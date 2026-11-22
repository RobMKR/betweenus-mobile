const { withAndroidStyles } = require("expo/config-plugins");

module.exports = ({ config }) => {
  config = withAndroidStyles(config, (result) => {
    const appTheme = result.modResults.resources.style?.find(
      (style) => style.$.name === "AppTheme",
    );
    // Allow Android dialogs to resolve native colors from the app's night mode.
    if (appTheme?.$.parent === "Theme.AppCompat.Light.NoActionBar") {
      appTheme.$.parent = "Theme.AppCompat.DayNight.NoActionBar";
    }
    return result;
  });

  if (process.env.BETWEENUS_PAGES_EXPORT !== "1") return config;

  return {
    ...config,
    experiments: { ...config.experiments, baseUrl: "/betweenus-mobile" },
  };
};
