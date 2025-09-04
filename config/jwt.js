require("dotenv").config();

const JWT_CONFIG = {
  secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production',
  expiresIn: '24h',
  refreshExpiresIn: '7d'
};

module.exports = JWT_CONFIG;