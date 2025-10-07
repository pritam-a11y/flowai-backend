const WORKSPACE_ACCESS_RULES = {
  "super-admin": "all", // Access to all workspaces
  observer: "all", // Access to all workspaces
  fde: "own_and_assigned", // Own workspace + assigned workspaces (Field Deployment Engineer)
  "account-executive": "own_and_assigned", // Own workspace + assigned workspaces
  "customer-admin": "own", // Only own workspace
  "customer-user": "own", // Only own workspace
};

const FEATURE_PERMISSIONS = {
  launchpad: {
    "super-admin": { read: true, write: true },
    observer: { read: true, write: false },
    fde: { read: true, write: true },
    "account-executive": { read: true, write: true },
    "customer-admin": { read: true, write: true },
    "customer-user": { read: false, write: false },
  },
  knowledgebase: {
    "super-admin": { read: true, write: true, delete: true },
    observer: { read: true, write: false, delete: false },
    fde: { read: true, write: true, delete: true },
    "account-executive": { read: true, write: true, delete: true },
    "customer-admin": { read: true, write: true, delete: true },
    "customer-user": { read: false, write: false, delete: false },
  },
  agents: {
    "super-admin": { read: true, write: true, delete: true },
    observer: { read: true, write: false, delete: false },
    fde: { read: true, write: true, delete: false },
    "account-executive": { read: true, write: true, delete: false },
    "customer-admin": { read: true, write: true, delete: false },
    "customer-user": { read: false, write: false, delete: false },
  },
  reports: {
    "super-admin": { read: true, write: true, export: true },
    observer: { read: true, write: false, export: true },
    fde: { read: true, write: false, export: false },
    "account-executive": { read: true, write: false, export: false },
    "customer-admin": { read: true, write: false, export: true },
    "customer-user": { read: true, write: false, export: true },
  },
};

module.exports = {
  WORKSPACE_ACCESS_RULES,
  FEATURE_PERMISSIONS,
};