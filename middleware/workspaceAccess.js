const AccessControlService = require("../services/accessControlService");
const logger = require("../utils/logger");

/**
 * Middleware factory to create workspace access validators
 * @param {object} options - Options for validation
 * @param {boolean} options.requireOrgId - Whether org_id param is required (default: true)
 * @param {boolean} options.allowQueryParam - Allow workspace_id in query params (default: false)
 * @returns {Function} Express middleware function
 */
const createWorkspaceAccessMiddleware = (options = {}) => {
  const { requireOrgId = true, allowQueryParam = false } = options;

  return async (req, res, next) => {
    try {
      let requestedWorkspaceId;

      // Get workspace ID from various sources
      if (requireOrgId) {
        requestedWorkspaceId = parseInt(req.params.org_id);
      } else if (allowQueryParam) {
        requestedWorkspaceId = parseInt(
          req.params.org_id ||
            req.query.workspace_id ||
            req.query.workspaceId ||
            req.body.workspace_id ||
            req.body.workspaceId,
        );
      }

      // Validate workspace ID
      if (!requestedWorkspaceId || isNaN(requestedWorkspaceId)) {
        return res.status(400).json({
          success: false,
          error: "Invalid or missing workspace/organization ID",
        });
      }

      // Check if user has access to this workspace
      const hasAccess = await AccessControlService.checkWorkspaceAccess(
        req.user.userId,
        req.user.role,
        req.user.workspaceId,
        requestedWorkspaceId,
      );

      if (!hasAccess) {
        logger.warn("Unauthorized workspace access attempt", {
          userId: req.user.userId,
          userRole: req.user.role,
          userWorkspace: req.user.workspaceId,
          requestedWorkspace: requestedWorkspaceId,
          path: req.path,
        });

        return res.status(403).json({
          success: false,
          error: "Access denied: You don't have access to this workspace",
        });
      }

      // Set validated workspace ID for downstream use
      req.workspaceId = requestedWorkspaceId;

      // Log successful access
      logger.info("Workspace access validated", {
        userId: req.user.userId,
        userRole: req.user.role,
        accessedWorkspace: requestedWorkspaceId,
        isOwnWorkspace: req.user.workspaceId === requestedWorkspaceId,
      });

      next();
    } catch (error) {
      logger.error("Error validating workspace access", {
        error: error.message,
        userId: req.user?.userId,
      });

      res.status(500).json({
        success: false,
        error: "Failed to validate workspace access",
      });
    }
  };
};

// Export both the factory and a default instance
module.exports = createWorkspaceAccessMiddleware;
module.exports.validateOrgAccess = createWorkspaceAccessMiddleware({
  requireOrgId: true,
});
module.exports.validateWorkspaceAccess = createWorkspaceAccessMiddleware({
  requireOrgId: false,
  allowQueryParam: true,
});
