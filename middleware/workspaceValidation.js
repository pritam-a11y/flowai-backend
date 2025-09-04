const logger = require("../utils/logger");

/**
 * Workspace validation middleware
 * Ensures the requested resource belongs to the user's workspace
 */
const validateWorkspaceAccess = (req, res, next) => {
  try {
    // Get workspace ID from various sources
    const requestWorkspaceId =
      req.body.workspace_id ||
      req.body.workspaceId ||
      req.query.workspace_id ||
      req.query.workspaceId ||
      req.params.workspaceId;

    // User's workspace from JWT (set by jwtMiddleware)
    const userWorkspaceId = req.user.workspaceId;

    // If no workspace specified in request, use user's default
    if (!requestWorkspaceId) {
      req.workspaceId = userWorkspaceId;
      return next();
    }

    // Convert to number for comparison
    const requestedId = parseInt(requestWorkspaceId);

    // Validate workspace access
    if (requestedId !== userWorkspaceId) {
      logger.warn("Unauthorized workspace access attempt", {
        userId: req.user.userId,
        userWorkspace: userWorkspaceId,
        requestedWorkspace: requestedId,
        path: req.path,
      });

      return res.status(403).json({
        success: false,
        error: "Access denied: You do not have access to this workspace",
      });
    }

    // Set validated workspace ID for downstream use
    req.workspaceId = requestedId;

    next();
  } catch (error) {
    logger.error("Workspace validation error", { error: error.message });
    res.status(500).json({
      success: false,
      error: "Workspace validation failed",
    });
  }
};

module.exports = validateWorkspaceAccess;
