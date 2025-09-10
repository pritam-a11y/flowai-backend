const db = require("../db/connection");
const logger = require("../utils/logger");
const {
  WORKSPACE_ACCESS_RULES,
  FEATURE_PERMISSIONS,
} = require("../constants/roles");

class AccessControlService {
  /**
   * Check if user has access to a specific workspace based on role
   * @param {number} userId - User ID
   * @param {string} userRole - User role
   * @param {number} userWorkspaceId - User's primary workspace ID
   * @param {number} requestedWorkspaceId - Workspace being accessed
   * @returns {Promise<boolean>} - True if user has access
   */
  static async checkWorkspaceAccess(
    userId,
    userRole,
    userWorkspaceId,
    requestedWorkspaceId,
  ) {
    const accessRule = WORKSPACE_ACCESS_RULES[userRole];

    if (!accessRule) {
      logger.warn("Unknown role attempted workspace access", { userRole });
      return false;
    }

    // Super-admin and observer have access to all workspaces
    if (accessRule === "all") {
      return true;
    }

    // Check if it's the user's own workspace
    if (userWorkspaceId === requestedWorkspaceId) {
      return true;
    }

    // For members, check assigned workspaces array
    if (userRole === "member" && accessRule === "own_and_assigned") {
      try {
        // Check if the requested workspace ID is in the assigned_workspace array
        const result = await db.query(
          `SELECT 1 FROM users 
           WHERE id = $1 
           AND $2 = ANY(assigned_workspace)`,
          [userId, requestedWorkspaceId],
        );

        return result.rows.length > 0;
      } catch (error) {
        logger.error("Error checking assigned workspaces", {
          error: error.message,
          userId,
          requestedWorkspaceId,
        });
        return false;
      }
    }

    // All other roles with "own" access rule can only access their own workspace
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
   * Get all accessible workspace IDs for a user
   * @param {number} userId - User ID
   * @param {string} userRole - User role
   * @param {number} userWorkspaceId - User's primary workspace ID
   * @returns {Promise<number[]>} - Array of accessible workspace IDs
   */
  static async getAccessibleWorkspaces(userId, userRole, userWorkspaceId) {
    const accessRule = WORKSPACE_ACCESS_RULES[userRole];

    if (!accessRule) {
      return [];
    }

    // Super-admin and observer can access all workspaces
    if (accessRule === "all") {
      try {
        const result = await db.query(
          "SELECT id FROM workspaces WHERE is_active = true",
        );
        return result.rows.map((row) => row.id);
      } catch (error) {
        logger.error("Error fetching all workspaces", { error: error.message });
        return [userWorkspaceId]; // Fallback to own workspace
      }
    }

    // Members can access own + assigned workspaces
    if (userRole === "member" && accessRule === "own_and_assigned") {
      try {
        const result = await db.query(
          "SELECT assigned_workspace FROM users WHERE id = $1",
          [userId],
        );

        const assignedWorkspaces = result.rows[0]?.assigned_workspace || [];
        const allWorkspaces = [userWorkspaceId, ...assignedWorkspaces];

        // Remove duplicates and return
        return [...new Set(allWorkspaces)];
      } catch (error) {
        logger.error("Error fetching assigned workspaces", {
          error: error.message,
        });
        return [userWorkspaceId]; // Fallback to own workspace
      }
    }

    // All other roles can only access their own workspace
    return [userWorkspaceId];
  }

  /**
   * Validate workspace access and get workspace details
   * @param {number} userId - User ID
   * @param {string} userRole - User role
   * @param {number} userWorkspaceId - User's primary workspace ID
   * @param {number} requestedWorkspaceId - Workspace being accessed
   * @returns {Promise<object|null>} - Workspace details if accessible, null otherwise
   */
  static async validateAndGetWorkspace(
    userId,
    userRole,
    userWorkspaceId,
    requestedWorkspaceId,
  ) {
    const hasAccess = await this.checkWorkspaceAccess(
      userId,
      userRole,
      userWorkspaceId,
      requestedWorkspaceId,
    );

    if (!hasAccess) {
      return null;
    }

    try {
      const result = await db.query("SELECT * FROM workspaces WHERE id = $1", [
        requestedWorkspaceId,
      ]);

      return result.rows[0] || null;
    } catch (error) {
      logger.error("Error fetching workspace details", {
        error: error.message,
      });
      return null;
    }
  }
}

module.exports = AccessControlService;
