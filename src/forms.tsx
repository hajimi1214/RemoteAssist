import { useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { passwordStrength } from "./formRules";

type FloatingFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "children"> & {
  label: string; help: string; error?: string; trailing?: ReactNode; children?: ReactNode;
};

export function FloatingField({ label, help, error, trailing, children, id: suppliedId, ...input }: FloatingFieldProps) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  return <div className={`form-field${error ? " has-error" : ""}`}>
    <div className={`floating-input${trailing ? " has-trailing" : ""}`}>
      <input {...input} id={id} placeholder=" " aria-invalid={error ? true : undefined} aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}${input["aria-describedby"] ? ` ${input["aria-describedby"]}` : ""}`} />
      <label htmlFor={id}>{label}{input.required && <span className="sr-only">（必填）</span>}</label>
      {trailing && <span className="field-trailing">{trailing}</span>}
    </div>
    <p id={`${id}-help`} className="field-hint">{help}</p>
    {children}
    {error && <p id={`${id}-error`} className="field-error" role="alert">{error}</p>}
  </div>;
}

export function PasswordVisibility({ visible, onToggle, disabled }: { visible: boolean; onToggle: () => void; disabled?: boolean }) {
  return <button type="button" className="password-visibility" onPointerDown={event => { if (event.button === 0) event.preventDefault(); }} onClick={onToggle} disabled={disabled} aria-label={visible ? "隐藏密码" : "显示密码"} aria-pressed={visible} title={visible ? "隐藏密码" : "显示密码"}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{visible && <path d="m3 3 18 18"/>}</svg>
  </button>;
}

export function PasswordStrength({ value }: { value: string }) {
  const strength = passwordStrength(value);
  return <div className={`password-strength strength-${strength.level}`}>
    <div className="strength-meter" role="meter" aria-label="密码强度估计" aria-valuemin={0} aria-valuemax={3} aria-valuenow={strength.level} aria-valuetext={strength.label}><span/></div>
    <p><strong>密码强度：{strength.label}</strong><span>{strength.detail}</span></p>
  </div>;
}
