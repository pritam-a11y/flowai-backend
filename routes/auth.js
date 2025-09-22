const express = require("express");
const router = express.Router();
const UserAuthService = require("../services/userAuthService");
const logger = require("../utils/logger");
const db = require("../db/connection");

const userAuthService = new UserAuthService();

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Authenticate user with email and password
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User's email address
 *                 example: "chirag.gupta@myflowai.com"
 *               password:
 *                 type: string
 *                 description: User's password
 *                 example: "qwertyuiop"
 *     responses:
 *       200:
 *         description: Login successful (single organisation)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 token:
 *                   type: string
 *                   description: JWT authentication token
 *                 refreshToken:
 *                   type: string
 *                   description: JWT refresh token
 *                 user:
 *                   type: object
 *       300:
 *         description: Multiple organisations found - selection required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 requireOrgSelection:
 *                   type: boolean
 *                   example: true
 *                 email:
 *                   type: string
 *                   example: "chirag.gupta@myflowai.com"
 *                 organisations:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 1
 *                       key:
 *                         type: string
 *                         example: "key_81827a38956f6979a50fccd47183"
 *                       name:
 *                         type: string
 *                         example: "Flowai"
 *                       role:
 *                         type: string
 *                         example: "owner"
 *                       lastLogin:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Invalid credentials
 *       403:
 *         description: Account locked or deactivated
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    logger.info("Login attempt", { email });

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "Email and password are required",
      });
    }

    // Authenticate user
    const authResult = await userAuthService.authenticateUser(email, password);

    // Check if organisation selection is required
    if (authResult.requireOrgSelection) {
      logger.info("Multiple organisations found for user", {
        email,
        orgCount: authResult.organisations.length,
      });

      return res.status(300).json({
        success: false,
        requireOrgSelection: true,
        email: authResult.email,
        organisations: authResult.organisations,
      });
    }

    // Single organisation - generate tokens
    const token = userAuthService.generateJWT(authResult);
    const refreshToken = userAuthService.generateRefreshToken(
      authResult.userId,
      authResult.orgId,
    );

    logger.info("Login successful", {
      userId: authResult.userId,
      email: authResult.email,
      orgId: authResult.orgId,
    });

    res.json({
      success: true,
      token,
      refreshToken,
      user: {
        id: authResult.userId,
        username: authResult.username,
        email: authResult.email,
        role: authResult.role,
        org_id: authResult.orgId,
        org_name: authResult.orgName,
        is_active: authResult.isActive,
        last_login: authResult.lastLogin,
      },
    });
  } catch (error) {
    logger.error("Login error", {
      error: error.message,
      email: req.body.email,
    });

    if (error.message === "Invalid credentials") {
      return res.status(401).json({
        success: false,
        error: "Invalid email or password",
      });
    }

    if (
      error.message === "Account is deactivated" ||
      error.message.includes("Account locked")
    ) {
      return res.status(403).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: "An error occurred during login",
    });
  }
});

/**
 * @swagger
 * /auth/select-org:
 *   post:
 *     summary: Select organisation to switch context (for users with access to multiple organisations)
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orgId
 *             properties:
 *               orgId:
 *                 type: integer
 *                 description: Organisation ID to switch to
 *                 example: 1
 *     responses:
 *       200:
 *         description: Organisation selected successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 token:
 *                   type: string
 *                   description: JWT authentication token for the selected org
 *                 refreshToken:
 *                   type: string
 *                   description: JWT refresh token
 *                 user:
 *                   type: object
 *       400:
 *         description: Invalid request
 *       401:
 *         description: No authentication token provided or invalid token
 *       403:
 *         description: Access denied to selected organisation
 */
router.post("/select-org", async (req, res) => {
  try {
    // Extract token from Authorization header - NOW REQUIRED
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

      const { orgId } = req.body;

      logger.info("Organisation selection", {
        userId: decoded.userId,
        email: decoded.email,
        currentOrgId: decoded.orgId,
        requestedOrgId: orgId,
        role: decoded.role,
      });

      if (!orgId) {
        return res.status(400).json({
          success: false,
          error: "orgId is required",
        });
      }

      // Select organisation for authenticated user
      const userData = await userAuthService.selectOrganisationWithAuth(
        decoded.userId,
        decoded.email,
        decoded.role,
        orgId,
      );

      // Generate new tokens for the selected organisation
      const newToken = userAuthService.generateJWT(userData);
      const refreshToken = userAuthService.generateRefreshToken(
        userData.userId,
        userData.orgId,
      );

      logger.info("Organisation selected successfully", {
        userId: userData.userId,
        email: userData.email,
        fromOrgId: decoded.orgId,
        toOrgId: userData.orgId,
        role: userData.role,
      });

      res.json({
        success: true,
        token: newToken,
        refreshToken: refreshToken,
        user: {
          id: userData.userId,
          username: userData.username,
          email: userData.email,
          role: userData.role,
          org_id: userData.orgId,
          org_name: userData.orgName,
          is_active: userData.isActive,
        },
      });
    } catch (error) {
      if (error.message === "Invalid or expired token") {
        return res.status(401).json({
          success: false,
          error: error.message,
        });
      }

      if (
        error.message === "Access denied to this organisation" ||
        error.message === "Invalid organisation selection"
      ) {
        return res.status(403).json({
          success: false,
          error: error.message,
        });
      }

      throw error; // Re-throw other errors
    }
  } catch (error) {
    logger.error("Organisation selection error", { error: error.message });

    res.status(500).json({
      success: false,
      error: "An error occurred during organisation selection",
    });
  }
});


/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout user (optional cleanup)
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Logged out successfully"
 *       401:
 *         description: No authentication token provided
 *       500:
 *         description: Internal server error
 */
router.post("/logout", async (req, res) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        error: "No authentication token provided",
      });
    }

    const token = authHeader.substring(7);

    try {
      // Verify the token to get user info
      const decoded = userAuthService.verifyJWT(token);

      // Invalidate refresh token
      await userAuthService.invalidateRefreshToken(
        decoded.userId,
        decoded.orgId,
      );

      logger.info("User logout", {
        userId: decoded.userId,
        email: decoded.email,
      });

      res.json({
        success: true,
        message: "Logged out successfully",
      });
    } catch (error) {
      // Even if token is invalid, we can still return success
      res.json({
        success: true,
        message: "Logged out successfully",
      });
    }
  } catch (error) {
    logger.error("Logout error", { error: error.message });
    res.status(500).json({
      success: false,
      error: "An error occurred during logout",
    });
  }
});

/**
 * @swagger
 * /auth/validate:
 *   post:
 *     summary: Validate JWT token and get user info
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Token is valid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 valid:
 *                   type: boolean
 *                   example: true
 *                 user:
 *                   type: object
 *       401:
 *         description: Invalid or expired token
 *       500:
 *         description: Internal server error
 */
router.post("/validate", async (req, res) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        valid: false,
        error: "No authentication token provided",
      });
    }

    const token = authHeader.substring(7);

    try {
      // Verify and decode the token
      const decoded = userAuthService.verifyJWT(token);

      // Validate user is still active and get fresh data
      const userData = await userAuthService.validateAndRefreshUser(decoded);

      logger.info("Token validated successfully", {
        userId: userData.userId,
        email: userData.email,
      });

      res.json({
        valid: true,
        user: userData,
      });
    } catch (error) {
      logger.warn("Token validation failed", { error: error.message });

      return res.status(401).json({
        valid: false,
        error: error.message || "Invalid or expired token",
      });
    }
  } catch (error) {
    logger.error("Token validation error", { error: error.message });
    res.status(500).json({
      valid: false,
      error: "An error occurred during token validation",
    });
  }
});

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Refresh JWT token using refresh token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: JWT refresh token
 *                 example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *       401:
 *         description: Invalid or expired refresh token
 *       500:
 *         description: Internal server error
 */
router.post("/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: "Refresh token is required",
      });
    }

    const result = await userAuthService.refreshAccessToken(refreshToken);

    logger.info("Token refreshed successfully", {
      userId: result.userData.userId,
      email: result.userData.email,
    });

    res.json({
      success: true,
      token: result.accessToken,
      refreshToken: result.refreshToken,
    });
  } catch (error) {
    logger.warn("Token refresh failed", { error: error.message });

    return res.status(401).json({
      success: false,
      error: "Invalid or expired refresh token",
    });
  }
});

/**
 * @swagger
 * /auth/change-password:
 *   post:
 *     summary: Change user password
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 description: Current password
 *               newPassword:
 *                 type: string
 *                 description: New password
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Invalid current password
 *       500:
 *         description: Internal server error
 */
router.post("/change-password", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        error: "No authentication token provided",
      });
    }

    const token = authHeader.substring(7);
    const decoded = userAuthService.verifyJWT(token);

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: "Current password and new password are required",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        error: "New password must be at least 8 characters long",
      });
    }

    await userAuthService.changePassword(
      decoded.userId,
      currentPassword,
      newPassword,
    );

    res.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    logger.error("Change password error", { error: error.message });

    if (error.message === "Invalid current password") {
      return res.status(401).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: "An error occurred while changing password",
    });
  }
});

/**
 * @swagger
 * /auth/organisations:
 *   get:
 *     summary: Get user's organisations by email
 *     tags: [Authentication]
 *     parameters:
 *       - in: query
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *         description: User's email address
 *     responses:
 *       200:
 *         description: List of user's organisations
 *       400:
 *         description: Email is required
 *       500:
 *         description: Internal server error
 */
router.get("/organisations", async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: "Email is required",
      });
    }

    const organisations = await userAuthService.getUserOrganisations(email);

    res.json({
      success: true,
      organisations,
    });
  } catch (error) {
    logger.error("Get organisations error", { error: error.message });
    res.status(500).json({
      success: false,
      error: "An error occurred while fetching organisations",
    });
  }
});

router.get("/db-debug", async (req, res) => {
  try {
    // Check current database and user
    const dbInfo = await db.query(`
      SELECT 
        current_database() as database,
        current_user as user,
        current_schema() as schema,
        inet_server_addr() as server_ip,
        inet_server_port() as server_port
    `);

    // List all schemas
    const schemas = await db.query(`
      SELECT schema_name 
      FROM information_schema.schemata 
      ORDER BY schema_name
    `);

    // List tables in public schema
    const tables = await db.query(`
      SELECT table_schema, table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);

    // Check if we can see the specific tables
    const tableChecks = {};
    const tablesToCheck = ["users", "organisations"];

    for (const table of tablesToCheck) {
      try {
        const result = await db.query(`SELECT COUNT(*) FROM public.${table}`);
        tableChecks[table] = { exists: true, count: result.rows[0].count };
      } catch (err) {
        tableChecks[table] = { exists: false, error: err.message };
      }
    }

    res.json({
      connection: dbInfo.rows[0],
      schemas: schemas.rows.map((r) => r.schema_name),
      tablesInPublic: tables.rows.length,
      tablesList: tables.rows.slice(0, 10), // First 10 tables
      specificTableChecks: tableChecks,
      envDatabase: process.env.PGDATABASE,
      envHost: process.env.PGHOST,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      code: error.code,
      stack: error.stack,
    });
  }
});

/**
 * @swagger
 * /auth/all-orgs:
 *   get:
 *     summary: Get all organisations the authenticated user has access to based on their role
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of organisations based on user's role and access rules
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 organisations:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 1
 *                         description: Organisation ID
 *                       name:
 *                         type: string
 *                         example: "Flowai"
 *                         description: Organisation name
 *                       isCurrent:
 *                         type: boolean
 *                         example: true
 *                         description: Whether this is the user's current active organisation
 *                 currentOrgId:
 *                   type: integer
 *                   description: Currently active organisation ID
 *                 accessType:
 *                   type: string
 *                   description: Type of access (all, own, own_and_assigned)
 *       401:
 *         description: No authentication token provided or invalid token
 *       500:
 *         description: Internal server error
 */
router.get("/all-orgs", async (req, res) => {
  try {
    // Extract token from Authorization header
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

      logger.info("Fetching organisations for user based on role", {
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role,
        currentOrgId: decoded.orgId,
      });

      // Define workspace access rules
      const WORKSPACE_ACCESS_RULES = {
        "super-admin": "all",
        observer: "all",
        member: "own_and_assigned",
        "customer-admin": "own",
        "core-team-member": "own",
        "analytics-user": "own",
      };

      const accessType = WORKSPACE_ACCESS_RULES[decoded.role] || "own";
      let organisations = [];
      let orgIds = new Set(); // To track unique org IDs

      if (accessType === "all") {
        // Get ALL organizations from the organisations table
        const result = await db.query(
          `SELECT org_id as id, name, api_key, retell_workspace_id 
           FROM organisations 
           ORDER BY name ASC`,
        );

        organisations = result.rows.map((org) => ({
          id: org.id,
          name: org.name,
          isCurrent: org.id === decoded.orgId,
        }));
      } else if (accessType === "own") {
        // Get only the user's own organization
        const result = await db.query(
          `SELECT org_id as id, name, api_key, retell_workspace_id 
           FROM organisations 
           WHERE org_id = $1`,
          [decoded.orgId],
        );

        if (result.rows.length > 0) {
          organisations = [
            {
              id: result.rows[0].id,
              name: result.rows[0].name,
              isCurrent: true,
            },
          ];
        }
      } else if (accessType === "own_and_assigned") {
        // Get user's own org + assigned workspaces

        // First, get the user's assigned_workspace array
        const userResult = await db.query(
          `SELECT org_id, assigned_workspace 
           FROM users 
           WHERE id = $1`,
          [decoded.userId],
        );

        if (userResult.rows.length > 0) {
          const user = userResult.rows[0];

          // Add own org_id
          orgIds.add(user.org_id);

          // Add assigned workspace IDs if they exist
          if (
            user.assigned_workspace &&
            Array.isArray(user.assigned_workspace)
          ) {
            user.assigned_workspace.forEach((id) => {
              if (id) orgIds.add(id);
            });
          }

          // Now get all unique organizations
          if (orgIds.size > 0) {
            const orgIdsArray = Array.from(orgIds);
            const placeholders = orgIdsArray
              .map((_, idx) => `$${idx + 1}`)
              .join(", ");

            const result = await db.query(
              `SELECT org_id as id, name, api_key, retell_workspace_id 
               FROM organisations 
               WHERE org_id IN (${placeholders})
               ORDER BY name ASC`,
              orgIdsArray,
            );

            organisations = result.rows.map((org) => ({
              id: org.id,
              name: org.name,
              isCurrent: org.id === decoded.orgId,
            }));
          }
        }
      }

      logger.info("Organisations fetched successfully", {
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role,
        accessType: accessType,
        orgCount: organisations.length,
      });

      res.json({
        success: true,
        organisations: organisations,
        currentOrgId: decoded.orgId,
        currentOrgName: decoded.orgName,
        accessType: accessType,
      });
    } catch (error) {
      logger.warn("Token validation failed", { error: error.message });

      return res.status(401).json({
        success: false,
        error: error.message || "Invalid or expired token",
      });
    }
  } catch (error) {
    logger.error("Get all organisations error", { error: error.message });
    res.status(500).json({
      success: false,
      error: "An error occurred while fetching organisations",
    });
  }
});

module.exports = router;
