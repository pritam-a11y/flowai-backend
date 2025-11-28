// Dummy auth service for precision backend
// Redox is not used in this backend
const logger = require('../utils/logger');

class AuthService {
  constructor() {
    // No authentication needed for precision backend
  }

  async getAccessToken(providedToken = null) {
    logger.debug('Dummy auth service - no token needed');
    // Return dummy token for compatibility
    return 'dummy-token-precision-backend';
  }

  async refreshToken() {
    logger.debug('Dummy auth service - no refresh needed');
    // Return dummy token for compatibility
    return 'dummy-token-precision-backend';
  }

  async validateToken(token) {
    // Always return true for precision backend
    return true;
  }
}

module.exports = AuthService;