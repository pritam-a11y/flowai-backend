const AccessControlService = require("../services/accessControlService");
const logger = require("../utils/logger");

/**
 * Middleware factory to check feature permissions
 * @param {string} feature - Feature name (e.g., 'launchpad', 'agents')
 * @param {string} action - Required action (e.g., 'read', 'write', 'delete')
 * @returns {Function} Express middleware function
 */
const requireFeaturePermission = (feature, action) => {
  return (req, res, next) => {
    const userRole = req.user?.role;

    if (!userRole) {
      return res.status(401).json({
        success: false,
        error: "User role not found",
      });
    }

    const hasPermission = AccessControlService.checkFeaturePermission(
      userRole,
      feature,
      action,
    );

    if (!hasPermission) {
      logger.warn("Feature access denied", {
        userId: req.user.userId,
        userRole: userRole,
        feature: feature,
        action: action,
        path: req.path,
      });

      return res.status(403).json({
        success: false,
        error: `Access denied: You don't have ${action} permission for ${feature}`,
      });
    }

    logger.debug("Feature access granted", {
      userId: req.user.userId,
      userRole: userRole,
      feature: feature,
      action: action,
    });

    next();
  };
};

module.exports = requireFeaturePermission;
