module.exports = ({ config }) => {
  if (process.env.BETWEENUS_PAGES_EXPORT !== "1") return config;

  return {
    ...config,
    experiments: { ...config.experiments, baseUrl: "/betweenus-mobile" },
  };
};
