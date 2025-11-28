// Dummy Redox config for precision backend
// Redox is not used in this backend, but some legacy code still references it

module.exports = {
  CLIENT_ID: process.env.REDOX_CLIENT_ID || 'dummy-client-id',
  CLIENT_SECRET: process.env.REDOX_CLIENT_SECRET || 'dummy-client-secret',
  BASE_URL: 'https://api.redoxengine.com',
  AUTH_URL: 'https://api.redoxengine.com/auth/authenticate',
  SOURCE_ID: process.env.REDOX_SOURCE_ID || 'dummy-source-id',
  USE_OAUTH: process.env.REDOX_USE_OAUTH === 'true',
  STAGING_CLIENT_ID: process.env.REDOX_STAGING_CLIENT_ID || 'dummy-staging-id',
  PRODUCTION_CLIENT_ID: process.env.REDOX_PRODUCTION_CLIENT_ID || 'dummy-production-id'
};