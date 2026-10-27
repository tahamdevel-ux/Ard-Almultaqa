export type Role = "ADMIN" | "REGISTRATION" | "HOUSING" | "ACCOUNTANT" | "SUPERVISOR";

export const PERMISSIONS = [
  "dashboard.view",
  "pilgrims.view", "pilgrims.write", "pilgrims.health", "documents.view", "documents.write",
  "agents.view", "agents.write",
  "trips.view", "trips.write", "bookings.write", "seats.write",
  "prices.write", "payments.view", "payments.write",
  "hotels.view", "hotels.write", "rooming.write", "programs.write",
  "outputs.view",
  "import.run",
  "users.manage", "audit.view", "settings.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL = [...PERMISSIONS];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: ALL,
  REGISTRATION: [
    "dashboard.view", "pilgrims.view", "pilgrims.write", "pilgrims.health", "documents.view", "documents.write",
    "agents.view", "trips.view", "bookings.write", "seats.write", "outputs.view", "import.run", "hotels.view",
  ],
  HOUSING: ["dashboard.view", "pilgrims.view", "trips.view", "seats.write", "outputs.view", "hotels.view", "hotels.write", "rooming.write"],
  ACCOUNTANT: ["dashboard.view", "pilgrims.view", "agents.view", "agents.write", "trips.view", "outputs.view", "prices.write", "payments.view", "payments.write"],
  SUPERVISOR: ["pilgrims.view", "pilgrims.health", "trips.view", "outputs.view", "hotels.view"],
};

export function can(role: Role, p: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(p);
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "مدير النظام",
  REGISTRATION: "التسجيل",
  HOUSING: "التسكين",
  ACCOUNTANT: "المحاسب",
  SUPERVISOR: "المشرف",
};
