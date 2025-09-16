const AccessControlService = require("../services/accessControlService");
const logger = require("../utils/logger");

/**
 * Middleware factory to create organization access validators
 * Works with the new organisations table structure
 * @param {object} options - Options for validation
 * @param {boolean} options.requireOrgId - Whether org_id param is required (default: true)
 * @param {boolean} options.allowQueryParam - Allow org_id in query params (default: false)
 * @returns {Function} Express middleware function
 */
const createOrgAccessMiddleware = (options = {}) => {
  const { requireOrgId = true, allowQueryParam = false } = options;

  return async (req, res, next) => {
    try {
      let requestedOrgId;

      // Get org ID from various sources
      if (requireOrgId) {
        requestedOrgId = parseInt(req.params.org_id);
      } else if (allowQueryParam) {
        requestedOrgId = parseInt(
          req.params.org_id ||
            req.query.org_id ||
            req.query.orgId ||
            req.body.org_id ||
            req.body.orgId,
        );
      }

      // Validate org ID
      if (!requestedOrgId || isNaN(requestedOrgId)) {
        return res.status(400).json({
          success: false,
          error: "Invalid or missing organization ID",
        });
      }

      // Get user's organization ID
      // This assumes users table has been updated with org_id column
      // Otherwise, you'll need to map workspace_id to org_id
      const userOrgId = req.user.orgId || req.user.workspaceId;

      // Check if user has access to this organization
      const hasAccess = await AccessControlService.checkOrgAccess(
        req.user.userId,
        req.user.role,
        userOrgId,
        requestedOrgId,
      );

      if (!hasAccess) {
        logger.warn("Unauthorized organization access attempt", {
          user_id: req.user.userId,
          user_role: req.user.role,
          user_org_id: userOrgId,
          requested_org_id: requestedOrgId,
          path: req.path,
        });

        return res.status(403).json({
          success: false,
          error: "Access denied: You don't have access to this organization",
        });
      }

      // Set validated org ID for downstream use
      req.orgId = requestedOrgId;

      // Log successful access
      logger.info("Organization access validated", {
        user_id: req.user.userId,
        user_role: req.user.role,
        accessed_org_id: requestedOrgId,
        is_own_org: userOrgId === requestedOrgId,
      });

      next();
    } catch (error) {
      logger.error("Error validating organization access", {
        error: error.message,
        user_id: req.user?.userId,
      });

      res.status(500).json({
        success: false,
        error: "Failed to validate organization access",
      });
    }
  };
};

// Export both the factory and a default instance
module.exports = createOrgAccessMiddleware;
module.exports.validateOrgAccess = createOrgAccessMiddleware({
  requireOrgId: true,
});
module.exports.validateOrgAccessQuery = createOrgAccessMiddleware({
  requireOrgId: false,
  allowQueryParam: true,
});
module.exports.createOrgAccessMiddleware = createOrgAccessMiddleware;
