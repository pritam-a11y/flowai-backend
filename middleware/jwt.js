const jwt = require("jsonwebtoken");
const JWT_CONFIG = require("../config/jwt");
const logger = require("../utils/logger");

const jwtMiddleware = async (req, res, next) => {
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
      const decoded = jwt.verify(token, JWT_CONFIG.secret);

      // Attach user info to request
      req.user = {
        userId: decoded.userId,
        email: decoded.email,
        username: decoded.username,
        role: decoded.role,
        workspaceId: decoded.workspaceId,
        workspaceKey: decoded.workspaceKey,
        workspaceName: decoded.workspaceName,
        permissions: decoded.permissions,
      };

      next();
    } catch (error) {
      if (error.name === "TokenExpiredError") {
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

module.exports = jwtMiddleware;
