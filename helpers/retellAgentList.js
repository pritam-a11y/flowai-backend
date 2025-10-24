const axios = require("axios");
const db = require("../db/connection");
const logger = require("../utils/logger");

async function findOrgIdByAgentId(targetAgentId) {
  if (!targetAgentId) {
    logger.error("findOrgIdByAgentId called without a target agent ID.");
    return null;
  }
  try {
    // Retrieve all API keys and their corresponding org IDs from the local database
    const orgKeysQuery = "SELECT org_id, api_key FROM organisations";
    const { rows: orgs } = await db.query(orgKeysQuery);

    if (orgs.length === 0) {
      logger.warn(
        "No API keys found in the organisations table to check against."
      );
      return null;
    }

    // Iterate through each API key and check for the agent
    for (const org of orgs) {
      const apiKey = org.api_key;
      const orgId = org.org_id;

      // console.log("apiKey-->", apiKey);
      // console.log("orgId-->", orgId);

      logger.info("Attempting Retell API call to check agent ownership.", {
        orgId: orgId,
        apiKey: apiKey,
      });

      try {
        //  Call the Retell API to list agents using the current key
        const response = await axios.get(
          "https://api.retellai.com/list-agents",
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
          }
        );

        //  Check if the target agent_id exists in the list returned by Retell
        const agents = response.data;
        // console.log("targetAgentId->", targetAgentId);
        // console.log("agents--->", agents);
        // console.log("response->", response.data);

        const matchingAgent = agents.find(
          (agent) => agent.agent_id === targetAgentId
        );

        console.log("matchingAgent->", matchingAgent, "-->", targetAgentId);
        // If a match is found, return the org_id
        if (matchingAgent) {
          logger.info("Agent ownership confirmed.", {
            targetAgentId: targetAgentId,
            orgId: orgId,
          });
          return orgId;
        }
      } catch (error) {
        // Log and continue if the API key is invalid or unauthorized
        const status = error.response?.status || "N/A";
        logger.warn("Retell API key failed to validate or authorize.", {
          orgId: orgId,
          status: status,
          message: error.message,
        });
        continue;
      }
    }

    //  If loop completes without finding a match
    logger.warn("Agent ID not found under any configured API key.", {
      targetAgentId: targetAgentId,
    });
    return null;
  } catch (dbError) {
    // Handle errors in the initial database query
    logger.error("Database error while fetching organization API keys.", {
      error: dbError.message,
      stack: dbError.stack,
    });
    return null;
  }
}

module.exports = { findOrgIdByAgentId };
