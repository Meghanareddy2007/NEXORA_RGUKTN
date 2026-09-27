export type AuthUser = {
  access_token: string;
  token_type: string;
  username: string;
  department: "SMMS" | "TMS" | "TRACTION" | "COA" | string;
  role: string;
  role_label: string;
  full_name: string;
  permissions: string[];
};

const KEY = "nexora_auth";

export function getAuth(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setAuth(user: AuthUser) {
  localStorage.setItem(KEY, JSON.stringify(user));
}

export function logout() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
  ["token", "access_token", "refresh_token", "user", "auth", "session"].forEach(k => localStorage.removeItem(k));
  sessionStorage.clear();
}

export function homeForDepartment(department?: string) {
  switch (department) {
    case "SMMS": return "/smms";
    case "TMS": return "/tms";
    case "TRACTION": return "/tdms";
    case "COA": return "/coa";
    default: return "/";
  }
}
