const appJson = require('./app.json');

module.exports = ({ config }) => ({
  ...config,
  ...appJson.expo,
  extra: {
    ...config.extra,
    appEnvironment: process.env.APP_ENV || 'development',
  },
});
