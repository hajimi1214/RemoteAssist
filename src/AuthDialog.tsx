import { secureCredentialStorage } from "./platform";
import { useEffect, useRef, useState } from "react";
import type { AuthResult, SignalingClient } from "./signaling";
import { BrandMark, ButtonSpinner, Icon, StatusMessage } from "./ui";
import { ModalFrame } from "./workspaceChrome";
import { friendlyError } from "./ux";
import { FloatingField, PasswordStrength, PasswordVisibility } from "./forms";
import { validateAuth, validateAuthField } from "./formRules";
import type { AuthErrors, AuthField } from "./formRules";

export function AuthDialog({ mode, error, onError, onMode, onAuth, signaling, onClose, purpose }: {
  onClose: () => void; purpose: string; mode: "signin" | "register"; error: string; onError: (message: string) => void;
  onMode: (mode: "signin" | "register") => void;
  onAuth: (result: AuthResult, remember: boolean) => Promise<void>; signaling: SignalingClient;
}) {
  const [busy, setBusy] = useState(false);
  const active = useRef(true);
  const request = useRef<AbortController | null>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; request.current?.abort(); }; }, []);
  function dismiss() { active.current = false; request.current?.abort(); onClose(); }
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(secureCredentialStorage);
  const [registerStep, setRegisterStep] = useState<0 | 1>(0);
  const [focusField, setFocusField] = useState<AuthField | null>(null);
  const [form, setForm] = useState({ login:"", username:"", email:"", password:"", confirm:"", consent:false });
  const [fieldErrors, setFieldErrors] = useState<AuthErrors>({});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (focusField) { formRef.current?.querySelector<HTMLInputElement>(`[name="${focusField}"]`)?.focus(); setFocusField(null); }
  }, [focusField, registerStep]);
  function changeField(field: AuthField, value: string | boolean) {
    setForm(previous => ({...previous, [field]: value}));
    setFieldErrors(previous => ({...previous, [field]: undefined, ...(field === "password" ? {confirm: undefined} : {})}));
  }
  function blurField(field: AuthField) {
    // Dialog teardown also blurs inputs; it is not a user validation attempt.
    if (!formRef.current?.closest("dialog")?.open) return;
    setFieldErrors(previous => ({...previous, [field]: validateAuthField(field, form, mode) || undefined}));
  }
  async function submit() {
    if (busy) return;
    onError("");
    const errors = validateAuth(form, mode);
    if (mode === "register" && registerStep === 0) {
      const accountErrors = { username: errors.username, email: errors.email };
      setFieldErrors(accountErrors);
      if (accountErrors.username || accountErrors.email) { setFocusField(accountErrors.username ? "username" : "email"); return; }
      setRegisterStep(1); setFocusField("password"); return;
    }
    setFieldErrors(errors);
    const firstField = Object.keys(errors)[0];
    if (firstField) { if (firstField === "username" || firstField === "email") setRegisterStep(0); setFocusField(firstField as AuthField); return; }
    setBusy(true);
    const controller = new AbortController(); request.current = controller;
    try {
      const result = mode === "signin" ? await signaling.login(form.login.trim(), form.password, controller.signal) : await signaling.register(form.username.trim(), form.email.trim(), form.password, controller.signal);
      if (!active.current || controller.signal.aborted) { void signaling.logout(result.refreshToken).catch(() => undefined); return; }
      await onAuth(result, remember);
    } catch (err) { if (active.current && !controller.signal.aborted) onError(friendlyError(err)); } finally { if (active.current) setBusy(false); }
  }
  function changeMode() { onError(""); setFieldErrors({}); setRegisterStep(0); setShowPassword(false); setFocusField(mode === "signin" ? "username" : "login"); setForm({...form,password:"",confirm:""}); onMode(mode === "signin" ? "register" : "signin"); }
  const passwordStep = mode === "signin" || registerStep === 1;
  return <ModalFrame title={mode === "signin" ? "欢迎回来" : registerStep === 0 ? "创建你的账号" : "设置独立密码"} onClose={dismiss} className="login-dialog" closeLabel="关闭登录弹窗">
    <div className="login-emblem"><BrandMark/><span>RemoteAssist</span></div>
    <div className="login-heading"><span className="eyebrow">{mode === "signin" ? "连接，从这里开始" : `第 ${registerStep + 1} 步，共 2 步 · 所有字段均需填写`}</span><h2 id="login-title">{mode === "signin" ? "欢迎回来" : registerStep === 0 ? "创建你的账号" : "设置独立密码"}</h2><p>{purpose}</p></div>
    <div className="auth-panel">
        <form ref={formRef} id="auth-form" noValidate onSubmit={(ev) => { ev.preventDefault(); void submit(); }} aria-busy={busy}>
          {mode === "signin" ? <FloatingField label="用户名或邮箱" help="使用注册时的用户名或邮箱登录。" name="login" data-initial-focus required autoComplete="username" autoCapitalize="none" spellCheck={false} value={form.login} onChange={ev => changeField("login", ev.target.value)} onBlur={() => blurField("login")} error={fieldErrors.login} disabled={busy} /> : registerStep === 0 && <>
            <FloatingField label="用户名" help="3–40 位英文字母、数字、下划线、点或短横线。" name="username" data-initial-focus required minLength={3} maxLength={40} autoComplete="username" autoCapitalize="none" spellCheck={false} value={form.username} onChange={ev => changeField("username", ev.target.value)} onBlur={() => blurField("username")} error={fieldErrors.username} disabled={busy} />
            <FloatingField label="邮箱" help="例如 you@example.com，也可用于登录。" name="email" required type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={form.email} onChange={ev => changeField("email", ev.target.value)} onBlur={() => blurField("email")} error={fieldErrors.email} disabled={busy} />
          </>}
          {passwordStep && <>
          <FloatingField label="密码" help={mode === "register" ? "至少 8 个字符，建议使用较长的密码短语。" : "输入此账号的密码，可用右侧按钮查看。"} name="password" required minLength={mode === "register" ? 8 : undefined} type={showPassword ? "text" : "password"} autoComplete={mode === "signin" ? "current-password" : "new-password"} value={form.password} onChange={ev => changeField("password", ev.target.value)} onBlur={() => blurField("password")} error={fieldErrors.password} disabled={busy} trailing={<PasswordVisibility visible={showPassword} onToggle={() => setShowPassword(!showPassword)} disabled={busy}/>}>
            {mode === "register" && <PasswordStrength value={form.password}/>}
          </FloatingField>
          {mode === "register" && <FloatingField label="确认密码" help="再次输入相同密码，避免输入错误。" name="confirm" required type={showPassword ? "text" : "password"} autoComplete="new-password" value={form.confirm} onChange={ev => changeField("confirm", ev.target.value)} onBlur={() => blurField("confirm")} error={fieldErrors.confirm} disabled={busy} />}
          {secureCredentialStorage ? <label className="check-row"><input type="checkbox" checked={remember} onChange={(ev) => setRemember(ev.target.checked)} disabled={busy} />在这台电脑上记住登录</label> : <p className="field-hint">登录仅保留在本次运行，关闭后需重新登录。</p>}
          {mode === "register" && <div><label className="check-row"><input name="consent" required type="checkbox" checked={form.consent} onChange={ev => changeField("consent", ev.target.checked)} onBlur={() => blurField("consent")} aria-invalid={fieldErrors.consent ? true : undefined} aria-describedby={fieldErrors.consent ? "auth-consent-error" : undefined} disabled={busy} />我只在设备所有者明确授权后使用远程协助。</label>{fieldErrors.consent && <p id="auth-consent-error" className="field-error" role="alert">{fieldErrors.consent}</p>}</div>}
          </>}
          {error && <StatusMessage error>{error}</StatusMessage>}
          <button className="primary-action wide-action" type="submit" disabled={busy} onPointerDown={ev=>{if(ev.button===0)ev.preventDefault();}}>{busy ? "正在连接…" : mode === "signin" ? "登录" : registerStep === 0 ? "下一步：设置密码" : "创建账号"}{busy ? <ButtonSpinner/> : <Icon name="arrow"/>}</button>
          <p className="auth-switch">{mode === "register" && registerStep === 1 && <button type="button" className="link-button" disabled={busy} onClick={() => { setRegisterStep(0); setFieldErrors({}); setFocusField("username"); }}>上一步</button>}{mode === "signin" ? "还没有账号？" : "已经有账号？"}<button type="button" className="link-button" disabled={busy} onClick={changeMode}>{mode === "signin" ? "创建账号" : "返回登录"}</button></p>
        </form>
    </div>
    <p className="login-reassurance"><Icon name="shield"/>每次远程控制仍需对方同意。</p>
  </ModalFrame>;
}
