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

      // Validate user is still active and get fresh data with role-based logic
      const userData =
        await userAuthService.validateAndRefreshUserWithRoles(decoded);

      logger.info("Token validated successfully", {
        userId: userData.userId,
        email: userData.email,
        orgId: userData.orgId,
        role: userData.role,
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

/**
 * @swagger
 * /auth/create-organisation:
 *   post:
 *     summary: Create a new organisation
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
 *               - name
 *               - retell_workspace_id
 *               - api_key
 *             properties:
 *               name:
 *                 type: string
 *                 description: Organisation name
 *                 example: "Acme Corporation"
 *               retell_workspace_id:
 *                 type: string
 *                 description: Retell workspace ID
 *                 example: "ws_12345"
 *               api_key:
 *                 type: string
 *                 description: API key for the organisation
 *                 example: "key_81827a38956f6979a50fccd47183"
 *     responses:
 *       201:
 *         description: Organisation created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 organisation:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     name:
 *                       type: string
 *                       example: "Acme Corporation"
 *                     api_key:
 *                       type: string
 *                       example: "key_81827a38956f6979a50fccd47183"
 *                     retell_workspace_id:
 *                       type: string
 *                       example: "ws_12345"
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Invalid request - missing required fields
 *       401:
 *         description: No authentication token provided or invalid token
 *       403:
 *         description: Insufficient permissions to create organisation
 *       409:
 *         description: Organisation already exists
 *       500:
 *         description: Internal server error
 */
router.post("/create-organisation", async (req, res) => {
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

      // Check if user has permission to create organisations
      // Typically only super-admin, customer-admin, or specific roles should be able to create orgs
      const allowedRoles = ["super-admin", "customer-admin"];

      if (!allowedRoles.includes(decoded.role)) {
        logger.warn("Unauthorised organisation creation attempt", {
          userId: decoded.userId,
          email: decoded.email,
          role: decoded.role,
        });

        return res.status(403).json({
          success: false,
          error: "Insufficient permissions to create organisation",
        });
      }

      const { name, retell_workspace_id, api_key } = req.body;

      // Validate required fields
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: "Organisation name is required",
        });
      }

      if (
        !retell_workspace_id ||
        typeof retell_workspace_id !== "string" ||
        retell_workspace_id.trim().length === 0
      ) {
        return res.status(400).json({
          success: false,
          error: "Retell workspace ID is required",
        });
      }

      if (
        !api_key ||
        typeof api_key !== "string" ||
        api_key.trim().length === 0
      ) {
        return res.status(400).json({
          success: false,
          error: "API key is required",
        });
      }

      const orgName = name.trim();
      const retellWorkspaceId = retell_workspace_id.trim();
      const apiKey = api_key.trim();

      // Check if organisation with same name already exists
      const existingOrg = await db.query(
        `SELECT org_id FROM organisations WHERE LOWER(name) = LOWER($1)`,
        [orgName],
      );

      if (existingOrg.rows.length > 0) {
        logger.warn("Attempt to create duplicate organisation", {
          name: orgName,
          existingOrgId: existingOrg.rows[0].org_id,
          userId: decoded.userId,
        });

        return res.status(409).json({
          success: false,
          error: "Organisation with this name already exists",
        });
      }

      // Check if api_key already exists
      const existingApiKey = await db.query(
        `SELECT org_id FROM organisations WHERE api_key = $1`,
        [apiKey],
      );

      if (existingApiKey.rows.length > 0) {
        logger.warn("Attempt to create organisation with duplicate API key", {
          apiKey: apiKey,
          existingOrgId: existingApiKey.rows[0].org_id,
          userId: decoded.userId,
        });

        return res.status(409).json({
          success: false,
          error: "API key already exists",
        });
      }

      // Check if retell_workspace_id already exists
      const existingWorkspace = await db.query(
        `SELECT org_id FROM organisations WHERE retell_workspace_id = $1`,
        [retellWorkspaceId],
      );

      if (existingWorkspace.rows.length > 0) {
        logger.warn(
          "Attempt to create organisation with duplicate Retell workspace ID",
          {
            retellWorkspaceId: retellWorkspaceId,
            existingOrgId: existingWorkspace.rows[0].org_id,
            userId: decoded.userId,
          },
        );

        return res.status(409).json({
          success: false,
          error: "Retell workspace ID already exists",
        });
      }

      // Create the organisation
      const result = await db.query(
        `INSERT INTO organisations (name, api_key, retell_workspace_id) 
         VALUES ($1, $2, $3) 
         RETURNING org_id as id, name, api_key, retell_workspace_id`,
        [orgName, apiKey, retellWorkspaceId],
      );

      const newOrg = result.rows[0];

      logger.info("Organisation created successfully", {
        orgId: newOrg.id,
        orgName: newOrg.name,
        createdByUserId: decoded.userId,
        createdByEmail: decoded.email,
      });

      // Create default entries in agent tables
      try {
        // Create entry in org_patient_intake_agent table
        await db.query(
          `INSERT INTO org_patient_intake_agent (org_id, is_active, current_version, created_by, updated_by, created_at, updated_at) 
           VALUES ($1, true, 1, $2, $2, NOW(), NOW())`,
          [newOrg.id, decoded.userId],
        );

        // Create entry in org_customer_support_agent table
        await db.query(
          `INSERT INTO org_customer_support_agent (org_id, is_active, current_version, created_by, updated_by, created_at, updated_at) 
           VALUES ($1, true, 1, $2, $2, NOW(), NOW())`,
          [newOrg.id, decoded.userId],
        );

        // Create entry in org_scheduling_agent table
        await db.query(
          `INSERT INTO org_scheduling_agent (org_id, is_active, current_version, created_by, updated_by, created_at, updated_at) 
           VALUES ($1, true, 1, $2, $2, NOW(), NOW())`,
          [newOrg.id, decoded.userId],
        );

        logger.info("Default agent table entries created", {
          orgId: newOrg.id,
        });
      } catch (agentError) {
        logger.error("Failed to create agent table entries, rolling back", {
          orgId: newOrg.id,
          error: agentError.message,
        });

        // Rollback: delete the organisation if agent tables fail
        await db.query(`DELETE FROM organisations WHERE org_id = $1`, [
          newOrg.id,
        ]);

        throw new Error("Failed to initialize organisation configuration");
      }

      // Optional: If the creating user is a customer-admin, you might want to
      // automatically associate them with the new organisation
      if (decoded.role === "customer-admin") {
        await db.query(
          `INSERT INTO user_organisations (user_id, org_id, role, joined_at) 
           VALUES ($1, $2, $3, NOW()) 
           ON CONFLICT (user_id, org_id) DO NOTHING`,
          [decoded.userId, newOrg.id, "owner"],
        );

        logger.info("User associated with new organisation", {
          userId: decoded.userId,
          orgId: newOrg.id,
          role: "owner",
        });
      }

      res.status(201).json({
        success: true,
        organisation: {
          id: newOrg.id,
          name: newOrg.name,
          api_key: newOrg.api_key,
          retell_workspace_id: newOrg.retell_workspace_id,
        },
      });
    } catch (error) {
      if (error.message === "Invalid or expired token") {
        return res.status(401).json({
          success: false,
          error: error.message,
        });
      }
      throw error;
    }
  } catch (error) {
    logger.error("Create organisation error", {
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      success: false,
      error: "An error occurred while creating the organisation",
    });
  }
});

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Reset password for a user account
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User's email address
 *                 example: "user@example.com"
 *     responses:
 *       200:
 *         description: Password reset successful
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
 *                   example: "A new password has been sent to your email address"
 *       400:
 *         description: Invalid request
 *       403:
 *         description: Account is deactivated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Account is deactivated. Please contact support to reactivate your account"
 *       404:
 *         description: Email not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Email not found in our system"
 *       500:
 *         description: Internal server error
 */
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    logger.info("Password reset request", { email });

    // Validate email
    if (!email) {
      return res.status(400).json({
        success: false,
        error: "Email is required",
      });
    }

    // Check if user exists
    const userResult = await db.query(
      `SELECT u.id, u.username, u.email, u.first_name, u.last_name, 
              u.is_active, u.org_id, o.name as org_name
       FROM users u
       JOIN organisations o ON u.org_id = o.org_id
       WHERE u.email = $1
       LIMIT 1`,
      [email],
    );

    if (userResult.rows.length === 0) {
      logger.warn("Password reset attempted for non-existent email", { email });
      return res.status(404).json({
        success: false,
        error: "Email not found in our system",
      });
    }

    const user = userResult.rows[0];

    // Check if user is active
    if (!user.is_active) {
      logger.warn("Password reset attempted for inactive account", {
        email,
        userId: user.id,
      });
      return res.status(403).json({
        success: false,
        error:
          "Account is deactivated. Please contact support to reactivate your account",
      });
    }

    // Generate new password
    const generatePassword = () => {
      const length = 12;
      const charset =
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
      let password = "";
      for (let i = 0; i < length; i++) {
        password += charset.charAt(Math.floor(Math.random() * charset.length));
      }
      return password;
    };

    const newPassword = generatePassword();
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update password in database
    await db.query(
      `UPDATE users 
       SET password_hash = $1, 
           failed_login_attempts = 0,
           updated_at = NOW() 
       WHERE id = $2`,
      [passwordHash, user.id],
    );

    logger.info("Password reset in database", {
      userId: user.id,
      email: user.email,
    });

    // Send email with new password
    try {
      const { Resend } = require("resend");
      const resend = new Resend("re_DXtS219b_C9LEPwDvBsy2ZMmEKZGh8yYx");

      const firstName = user.first_name || user.username || "User";
      const orgName = user.org_name || "MyFlowAI";

      const emailHtml = `
<!doctype html>
<html>
  <head>
    <meta http-equiv="x-ua-compatible" content="ie=edge">
    <meta name="viewport" content="width=device-width">
    <meta charset="utf-8">
    <title>Password Reset - MyFlowAI</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f7fb;">
      <tr>
        <td align="center" style="padding:40px 20px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">

            <!-- Header -->
            <tr>
              <td style="background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);padding:30px 40px;text-align:center;">
                <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:600;">Password Reset</h1>
              </td>
            </tr>

            <!-- Content -->
            <tr>
              <td style="padding:40px;">
                <h2 style="margin:0 0 10px 0;color:#1a202c;font-size:20px;">Hi ${firstName},</h2>
                <p style="margin:0 0 20px 0;color:#4a5568;line-height:1.6;">
                  We received a request to reset your password for your <strong>${orgName}</strong> account on MyFlowAI.
                </p>
                <p style="margin:0 0 20px 0;color:#4a5568;line-height:1.6;">
                  Your password has been reset successfully. Please use the temporary password below to log in:
                </p>

                <!-- Password Box -->
                <div style="background:#f7fafc;border:2px solid #e2e8f0;border-radius:8px;padding:20px;margin:30px 0;">
                  <h3 style="margin:0 0 15px 0;color:#2d3748;font-size:16px;">Your Temporary Password</h3>
                  <div style="background:#fff;padding:12px;border-radius:4px;font-family:monospace;font-size:16px;color:#2d3748;text-align:center;letter-spacing:1px;">
                    ${newPassword}
                  </div>
                </div>

                <!-- Security Notice -->
                <div style="background:#fef5e7;border-left:4px solid #f39c12;padding:15px;margin:30px 0;border-radius:4px;">
                  <p style="margin:0;color:#856404;font-size:14px;">
                    <strong>Important Security Notice:</strong>
                  </p>
                  <ul style="margin:10px 0 0 0;padding-left:20px;color:#856404;font-size:14px;line-height:1.6;">
                    <li>Please change this temporary password immediately after logging in</li>
                    <li>Do not share this password with anyone</li>
                    <li>If you did not request this password reset, please contact our support team immediately</li>
                  </ul>
                </div>

                <!-- Login Button -->
                <div style="text-align:center;margin:30px 0;">
                  <a href="https://dev.myflowai.com/login" 
                     style="display:inline-block;background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:6px;font-weight:600;font-size:16px;">
                    Login to MyFlowAI
                  </a>
                </div>

                <!-- Next Steps -->
                <div style="margin:30px 0;">
                  <h3 style="margin:0 0 10px 0;color:#2d3748;font-size:16px;">Next Steps:</h3>
                  <ol style="margin:10px 0;padding-left:20px;color:#4a5568;line-height:1.8;">
                    <li>Click the login button above or visit <a href="https://dev.myflowai.com/login" style="color:#667eea;">https://dev.myflowai.com/login</a></li>
                    <li>Enter your email address: <strong>${email}</strong></li>
                    <li>Enter the temporary password provided above</li>
                    <li>You will be prompted to create a new password</li>
                  </ol>
                </div>

                <!-- Support -->
                <p style="margin:20px 0 0 0;color:#718096;font-size:14px;line-height:1.6;">
                  If you continue to have trouble accessing your account, please contact our support team at 
                  <a href="mailto:support@myflowai.com" style="color:#667eea;">support@myflowai.com</a>
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background:#f7fafc;padding:20px 40px;text-align:center;border-top:1px solid #e2e8f0;">
                <p style="margin:0 0 10px 0;color:#718096;font-size:12px;">
                  This password reset was requested on ${new Date().toLocaleString(
                    "en-US",
                    {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZoneName: "short",
                    },
                  )}
                </p>
                <p style="margin:0;color:#718096;font-size:12px;">
                  © 2025 MyFlowAI. All rights reserved.<br>
                  This is an automated message, please do not reply to this email.
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

      await resend.emails.send({
        from: "MyFlowAI <no-reply@myflowai.com>",
        to: email,
        subject: "Password Reset Request - MyFlowAI",
        html: emailHtml,
      });

      logger.info("Password reset email sent successfully", {
        to: email,
        userId: user.id,
      });
    } catch (emailError) {
      logger.error("Failed to send password reset email", {
        error: emailError.message,
        to: email,
        userId: user.id,
      });
      // Password was still reset, so we return success
      // but log the email failure for monitoring
    }

    res.json({
      success: true,
      message: "A new password has been sent to your email address",
    });
  } catch (error) {
    logger.error("Password reset error", {
      error: error.message,
      email: req.body.email,
    });

    res.status(500).json({
      success: false,
      error: "An error occurred during password reset. Please try again later.",
    });
  }
});

module.exports = router;
