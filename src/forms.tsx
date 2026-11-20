import { useId, useRef } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { editConnectionCode, passwordStrength } from "./formRules";

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
  return <button type="button" className="password-visibility" onClick={onToggle} disabled={disabled} aria-label={visible ? "隐藏密码" : "显示密码"} aria-pressed={visible} title={visible ? "隐藏密码" : "显示密码"}>
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

export function ConnectionCode({ value, onChange, onBlur, disabled, error, id: suppliedId }: {
  value: string; onChange: (value: string) => void; onBlur?: () => void; disabled?: boolean; error?: string; id?: string;
}) {
  const generatedId = useId(); const id = suppliedId ?? generatedId;
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const move = (index: number) => { inputs.current[index]?.focus(); inputs.current[index]?.select(); };
  function update(index: number, text: string) {
    const result = editConnectionCode(value, index, text);
    onChange(result.value); move(result.focus);
  }
  return <fieldset className={`connection-code-field${error ? " has-error" : ""}`} disabled={disabled} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onBlur?.();
  }} aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}>
    <legend>8 位临时连接码</legend>
    <div className="connection-code-cells">{Array.from({ length: 8 }, (_, index) => <input key={index} ref={element => { inputs.current[index] = element; }} id={index === 0 ? id : `${id}-${index + 1}`} type="text" inputMode="numeric" autoComplete="off" spellCheck={false} maxLength={8} value={value[index]?.trim() ?? ""} aria-label={`连接码第 ${index + 1} 位，共 8 位`} aria-invalid={error ? true : undefined} aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`} onFocus={event => event.currentTarget.select()} onChange={event => update(index, event.target.value)} onPaste={event => { event.preventDefault(); update(index, event.clipboardData.getData("text")); }} onKeyDown={event => {
      if (event.key === "Backspace") { event.preventDefault(); const previous = value[index]?.trim() ? index : Math.max(0, index - 1); onChange(editConnectionCode(value, previous, "").value); move(Math.max(0, index - 1)); }
      if (event.key === "Delete") { event.preventDefault(); onChange(editConnectionCode(value, index, "").value); }
      if (event.key === "ArrowLeft") { event.preventDefault(); move(Math.max(0, index - 1)); }
      if (event.key === "ArrowRight") { event.preventDefault(); move(Math.min(7, index + 1)); }
      if (event.key === "Home") { event.preventDefault(); move(0); }
      if (event.key === "End") { event.preventDefault(); move(7); }
    }}/> )}</div>
    <p id={`${id}-help`} className="field-hint">向对方索取共享页面上的 8 位数字，可直接粘贴整段连接码。</p>
    {error && <p id={`${id}-error`} className="field-error" role="alert">{error}</p>}
  </fieldset>;
}
