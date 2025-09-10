const WORKSPACE_ACCESS_RULES = {
  "super-admin": "all", // Access to all workspaces
  observer: "all", // Access to all workspaces
  member: "own_and_assigned", // Own workspace + assigned workspaces
  "customer-admin": "own", // Only own workspace
  "core-team-member": "own", // Only own workspace
  "analytics-user": "own", // Only own workspace
};

const FEATURE_PERMISSIONS = {
  launchpad: {
    "super-admin": { read: true, write: true },
    observer: { read: true, write: false },
    member: { read: true, write: true },
    "customer-admin": { read: true, write: true },
    "core-team-member": { read: true, write: false },
    "analytics-user": { read: false, write: false },
  },
  agents: {
    "super-admin": { read: true, write: true, delete: true },
    observer: { read: true, write: false, delete: false },
    member: { read: true, write: true, delete: false },
    "customer-admin": { read: true, write: true, delete: false },
    "core-team-member": { read: true, write: false, delete: false },
    "analytics-user": { read: false, write: false, delete: false },
  },
  reports: {
    "super-admin": { read: true, write: true, export: true },
    observer: { read: true, write: false, export: true },
    member: { read: true, write: false, export: false },
    "customer-admin": { read: true, write: false, export: true },
    "core-team-member": { read: true, write: false, export: false },
    "analytics-user": { read: true, write: false, export: true },
  },
};

module.exports = {
  WORKSPACE_ACCESS_RULES,
  FEATURE_PERMISSIONS,
};
