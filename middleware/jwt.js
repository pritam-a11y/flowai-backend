const UserAuthService = require("../services/userAuthService");
const logger = require("../utils/logger");

const userAuthService = new UserAuthService();

/**
 * JWT Authentication Middleware with Workspace Validation
 * @param {boolean} requireWorkspaceMatch - If true, validates workspace_id in request matches JWT
 */
const jwtMiddleware = (requireWorkspaceMatch = true) => {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
          success: false,
          error: "No authentication token provided",
        });
      }

      const token = authHeader.substring(7);

      try {
        // Verify and decode the token
        const decoded = userAuthService.verifyJWT(token);

        // Attach user info to request
        req.user = {
          userId: decoded.userId,
          email: decoded.email,
          username: decoded.username,
          role: decoded.role,
          workspaceId: decoded.workspaceId || decoded.orgId,
          workspaceKey: decoded.workspaceKey || decoded.orgKey,
          workspaceName: decoded.workspaceName || decoded.orgName,
          retellWorkspaceId: decoded.retellWorkspaceId,
          permissions: decoded.permissions,
          orgId: decoded.orgId || decoded.workspaceId,
          orgKey: decoded.orgKey || decoded.workspaceKey,
          orgName: decoded.orgName || decoded.workspaceName,
        };

        // Validate workspace access if required
        if (requireWorkspaceMatch) {
          const requestWorkspaceId =
            req.body.workspace_id ||
            req.body.workspaceId ||
            req.query.workspace_id ||
            req.query.workspaceId ||
            req.params.workspaceId;

          // If workspace_id is provided in request, it must match JWT workspace
          if (requestWorkspaceId) {
            const workspaceIdNum = parseInt(requestWorkspaceId);

            if (workspaceIdNum !== decoded.workspaceId) {
              logger.warn("Workspace mismatch attempt", {
                userId: decoded.userId,
                jwtWorkspace: decoded.workspaceId,
                requestedWorkspace: workspaceIdNum,
              });

              return res.status(403).json({
                success: false,
                error: "Access denied: Invalid workspace",
              });
            }
          }

          // Set workspace_id in request for downstream use
          req.workspaceId = decoded.workspaceId;
        }

        logger.debug("JWT authentication successful", {
          userId: decoded.userId,
          workspaceId: decoded.workspaceId,
        });

        next();
      } catch (error) {
        if (error.message.includes("expired")) {
          return res.status(401).json({
            success: false,
            error: "Token has expired",
            code: "TOKEN_EXPIRED",
          });
        }

        return res.status(401).json({
          success: false,
          error: "Invalid token",
        });
      }
    } catch (error) {
      logger.error("JWT middleware error", { error: error.message });
      res.status(500).json({
        success: false,
        error: "Authentication error",
      });
    }
  };
};

// Export both the function and a default instance
module.exports = jwtMiddleware();
module.exports.withOptions = jwtMiddleware;
