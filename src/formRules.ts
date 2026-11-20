import { normalizeConnectionCode } from "./ux.ts";

export type AuthValues = { login: string; username: string; email: string; password: string; confirm: string; consent: boolean };
export type AuthField = keyof AuthValues;
export type AuthErrors = Partial<Record<AuthField, string>>;

export function validateAuthField(field: AuthField, values: AuthValues, mode: "signin" | "register"): string {
  switch (field) {
    case "login": return values.login.trim() ? "" : "请输入用户名或邮箱。";
    case "username": return /^[A-Za-z0-9_.-]{3,40}$/.test(values.username.trim()) ? "" : "用户名需为 3–40 位英文字母、数字、下划线、点或短横线。";
    case "email": return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim()) ? "" : "请输入有效的邮箱地址，例如 you@example.com。";
    case "password": return !values.password ? "请输入密码。" : mode === "register" && [...values.password].length < 8 ? "新账号密码至少需要 8 个字符。" : "";
    case "confirm": return !values.confirm ? "请再次输入密码。" : values.confirm !== values.password ? "两次输入的密码不一致。" : "";
    case "consent": return values.consent ? "" : "请确认仅在设备所有者明确授权后使用远程协助。";
  }
}

export function validateAuth(values: AuthValues, mode: "signin" | "register"): AuthErrors {
  const fields: AuthField[] = mode === "signin" ? ["login", "password"] : ["username", "email", "password", "confirm", "consent"];
  return Object.fromEntries(fields.map(field => [field, validateAuthField(field, values, mode)]).filter(([, message]) => message));
}

export function passwordStrength(password: string): { level: 0 | 1 | 2 | 3; label: string; detail: string } {
  if (!password) return { level: 0, label: "尚未输入", detail: "较长且不常见的密码短语更合适。" };
  const length = [...password].length;
  const common = /^(?:123456(?:78(?:9(?:0)?)?)?|password\d*|qwerty\d*|admin\d*|(.)\1+)$/i.test(password);
  if (length < 8 || common) return { level: 1, label: "弱", detail: "增加长度，避免连续数字、重复字符或常见密码。" };
  if (length < 12 || /^\d+$/.test(password)) return { level: 2, label: "一般", detail: "建议使用 12 个字符以上且不常见的密码短语。" };
  return { level: 3, label: "较强", detail: "请为此账号使用独立的密码。此提示仅供参考。" };
}

/** Replace digits without shifting the other positions; empty positions stay blank. */
export function editConnectionCode(value: string, index: number, text: string): { value: string; focus: number } {
  const digits = normalizeConnectionCode(text);
  if (text && !digits) return { value, focus: Math.max(0, Math.min(7, index)) };
  const cells = Array.from({ length: 8 }, (_, i) => /[0-9]/.test(value[i] ?? "") ? value[i] : " ");
  const start = digits.length === 8 ? 0 : Math.max(0, Math.min(7, index));
  if (!digits) {
    cells[start] = " ";
    return { value: cells.join("").trimEnd(), focus: start };
  }
  for (let offset = 0; offset < digits.length && start + offset < 8; offset++) cells[start + offset] = digits[offset];
  return { value: cells.join("").trimEnd(), focus: Math.min(7, start + digits.length) };
}
