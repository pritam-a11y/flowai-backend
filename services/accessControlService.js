const db = require("../db/connection");
const logger = require("../utils/logger");
const {
  WORKSPACE_ACCESS_RULES,
  FEATURE_PERMISSIONS,
} = require("../constants/roles");

class AccessControlService {
  /**
   * Check if user has access to a specific organisation based on role
   * @param {number} userId - User ID
   * @param {string} userRole - User role
   * @param {number} userOrgId - User's primary organisation ID
   * @param {number} requestedOrgId - Organisation being accessed
   * @returns {Promise<boolean>} - True if user has access
   */
  static async checkOrgAccess(userId, userRole, userOrgId, requestedOrgId) {
    const accessRule = WORKSPACE_ACCESS_RULES[userRole];

    if (!accessRule) {
      logger.warn("Unknown role attempted organisation access", { userRole });
      return false;
    }

    // Super-admin and observer have access to all organisations
    if (accessRule === "all") {
      return true;
    }

    // Check if it's the user's own organisation
    if (userOrgId === requestedOrgId) {
      return true;
    }

    // For members, check assigned workspaces array (still named assigned_workspace in DB)
    if (userRole === "member" && accessRule === "own_and_assigned") {
      try {
        // Check if the requested org ID is in the assigned_workspace array
        const result = await db.query(
          `SELECT 1 FROM users 
           WHERE id = $1 
           AND $2 = ANY(assigned_workspace)`,
          [userId, requestedOrgId],
        );

        return result.rows.length > 0;
      } catch (error) {
        logger.error("Error checking assigned organisations", {
          error: error.message,
          userId,
          requestedOrgId,
        });
        return false;
      }
    }

    // All other roles with "own" access rule can only access their own organisation
    return false;
  }

  /**
   * Check if user has specific permission for a feature
   * @param {string} userRole - User role
   * @param {string} feature - Feature name (e.g., 'launchpad', 'agents')
   * @param {string} action - Action to check (e.g., 'read', 'write', 'delete')
   * @returns {boolean} - True if user has permission
   */
  static checkFeaturePermission(userRole, feature, action) {
    const featurePermissions = FEATURE_PERMISSIONS[feature];
    if (!featurePermissions) {
      logger.warn("Unknown feature permission check", { feature });
      return false;
    }

    const rolePermissions = featurePermissions[userRole];
    if (!rolePermissions) {
      logger.warn("Unknown role for feature permission", { userRole, feature });
      return false;
    }

    return rolePermissions[action] === true;
  }

  /**
   * Get all accessible organisation IDs for a user
   * @param {number} userId - User ID
   * @param {string} userRole - User role
   * @param {number} userOrgId - User's primary organisation ID
   * @returns {Promise<number[]>} - Array of accessible organisation IDs
   */
  static async getAccessibleOrgs(userId, userRole, userOrgId) {
    const accessRule = WORKSPACE_ACCESS_RULES[userRole];

    if (!accessRule) {
      return [];
    }

    // Super-admin and observer can access all organisations
    if (accessRule === "all") {
      try {
        const result = await db.query("SELECT org_id FROM organisations");
        return result.rows.map((row) => row.org_id);
      } catch (error) {
        logger.error("Error fetching all organisations", {
          error: error.message,
        });
        return [userOrgId]; // Fallback to own organisation
      }
    }

    // Members can access own + assigned organisations
    if (userRole === "member" && accessRule === "own_and_assigned") {
      try {
        const result = await db.query(
          "SELECT assigned_workspace FROM users WHERE id = $1",
          [userId],
        );

        const assignedOrgs = result.rows[0]?.assigned_workspace || [];
        const allOrgs = [userOrgId, ...assignedOrgs];

        // Remove duplicates and return
        return [...new Set(allOrgs)];
      } catch (error) {
        logger.error("Error fetching assigned organisations", {
          error: error.message,
        });
        return [userOrgId]; // Fallback to own organisation
      }
    }

    // All other roles can only access their own organisation
    return [userOrgId];
  }

  /**
   * Validate organisation access and get organisation details
   * @param {number} userId - User ID
   * @param {string} userRole - User role
   * @param {number} userOrgId - User's primary organisation ID
   * @param {number} requestedOrgId - Organisation being accessed
   * @returns {Promise<object|null>} - Organisation details if accessible, null otherwise
   */
  static async validateAndGetOrg(userId, userRole, userOrgId, requestedOrgId) {
    const hasAccess = await this.checkOrgAccess(
      userId,
      userRole,
      userOrgId,
      requestedOrgId,
    );

    if (!hasAccess) {
      return null;
    }

    try {
      const result = await db.query(
        "SELECT * FROM organisations WHERE org_id = $1",
        [requestedOrgId],
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error("Error fetching organisation details", {
        error: error.message,
      });
      return null;
    }
  }
}

module.exports = AccessControlService;
