"use client";

import { useActionState } from "react";
import { KeyRound, ShieldAlert } from "lucide-react";
import { changeRequiredPasswordAction } from "@/app/admin/actions";
import { SubmitButton } from "@/components/ui/submit-button";

const initialState: { error: string; success: boolean } = {
  error: "",
  success: false,
};

export function ForcePasswordChange() {
  const [state, formAction] = useActionState(changeRequiredPasswordAction, initialState);

  if (state?.success) {
    return (
      <section className="auth-panel" style={{ maxWidth: "420px", width: "100%", margin: "auto" }}>
        <div className="stack-sm" style={{ textAlign: "center" }}>
          <div style={{ backgroundColor: "#ecfdf5", color: "#10b981", borderRadius: "50%", width: "56px", height: "56px", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px auto" }}>
            <KeyRound size={28} />
          </div>
          <h2>Contraseña actualizada</h2>
          <p className="muted">
            Tu contraseña ha sido cambiada exitosamente. El panel de administración se desbloqueará ahora.
          </p>
          <div style={{ marginTop: "24px" }}>
            <a href="/admin" className="button button-primary" style={{ width: "100%", display: "inline-flex", justifyContent: "center" }}>
              Ir al panel admin
            </a>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="auth-panel" style={{ maxWidth: "420px", width: "100%", margin: "auto" }}>
      <div className="stack-sm">
        <div style={{ backgroundColor: "#fef3c7", color: "#d97706", borderRadius: "50%", width: "56px", height: "56px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px" }}>
          <ShieldAlert size={28} />
        </div>
        <p className="eyebrow" style={{ color: "#d97706" }}>Seguridad obligatoria</p>
        <h2>Actualiza tu contraseña</h2>
        <p className="muted">
          Para proteger la plataforma, el administrador requiere que cambies tu contraseña temporal por defecto antes de continuar.
        </p>
      </div>

      <form action={formAction} className="stack-md" style={{ marginTop: "24px" }}>
        <label className="field">
          <span>Nueva contraseña</span>
          <div className="auth-password-wrap">
            <KeyRound size={18} />
            <input
              name="password"
              placeholder="Mínimo 6 caracteres"
              required
              type="password"
              minLength={6}
            />
          </div>
        </label>

        <label className="field">
          <span>Confirmar nueva contraseña</span>
          <div className="auth-password-wrap">
            <KeyRound size={18} />
            <input
              name="confirmPassword"
              placeholder="Repite tu nueva contraseña"
              required
              type="password"
              minLength={6}
            />
          </div>
        </label>

        {state?.error ? (
          <p className="error-text auth-error" style={{ fontSize: "13px", marginTop: "4px" }}>
            {state.error}
          </p>
        ) : null}

        <div style={{ marginTop: "16px" }}>
          <SubmitButton pendingLabel="Actualizando..." className="auth-submit">
            Cambiar contraseña y entrar
          </SubmitButton>
        </div>
      </form>
    </section>
  );
}
