require("dotenv").config();

const PHELIX_CONFIG = {
  baseURL: process.env.PHELIX_BASE_URL,
  access_token: process.env.PHELIX_API_KEY,
};

module.exports = PHELIX_CONFIG;
