const axios = require("axios");
const PHELIX_CONFIG = require("../config/phelix");

const PhelixService = {
  // Upload PDF file to Phelix Fax-AI
  async uploadFax(formData) {
    const response = await axios.post(
      `${PHELIX_CONFIG.baseURL}/fax-ai`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          "x-access-tokens": PHELIX_CONFIG.access_token,
        },
      }
    );

    return response.data;
  },

  // Get Phelix FaxAI result using task_id
  async getFaxResponse(taskId) {
    const response = await axios.get(`${PHELIX_CONFIG.baseURL}/response`, {
      params: { task_id: taskId },
      headers: { "x-access-tokens": PHELIX_CONFIG.access_token },
    });

    return response.data;
  },
};

module.exports = PhelixService;
