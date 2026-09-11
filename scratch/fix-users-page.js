const fs = require('fs');

let code = fs.readFileSync('src/app/admin/users/page.tsx', 'utf8');

// I will just rewrite the entire `<form>` block to be safe.
const formStart = '<form action={createAdminUserAction} className="stack-lg">';
const formEnd = '</form>';

const startIndex = code.indexOf(formStart);
const endIndex = code.indexOf(formEnd, startIndex) + formEnd.length;

if (startIndex > -1 && endIndex > -1) {
  const newForm = `<form action={createAdminUserAction} className="stack-lg">
            <div className="form-grid">
              <label className="field">
                <span>Nombre</span>
                <input name="name" placeholder="Nombre completo" required />
              </label>

              <label className="field">
                <span>Correo</span>
                <div className="auth-password-wrap">
                  <Mail size={18} />
                  <input name="email" placeholder="usuario@correo.com" required type="email" />
                </div>
              </label>

              <label className="field">
                <span>Teléfono</span>
                <div className="auth-password-wrap">
                  <Phone size={18} />
                  <input name="phone" placeholder="Opcional" type="tel" />
                </div>
              </label>

              <label className="field">
                <span>Tipo de usuario</span>
                <select defaultValue="USERSHOP" name="role">
                  <option value="USERSHOP">Comprador</option>
                  <option value="PROMOTOR">Promotor / Influencer</option>
                  <option value="ADMIN">Administrador</option>
                </select>
              </label>

              <label className="field">
                <span>Contraseña</span>
                <input name="password" placeholder="Mínimo 6 caracteres" required type="password" />
              </label>

              <label className="field">
                <span>Confirmar contraseña</span>
                <input
                  name="confirmPassword"
                  placeholder="Repite la contraseña"
                  required
                  type="password"
                />
              </label>
            </div>

            <div className="actions-row">
              <SubmitButton pendingLabel="Creando usuario...">Crear usuario</SubmitButton>
            </div>
          </form>`;
          
  code = code.substring(0, startIndex) + newForm + code.substring(endIndex);
  fs.writeFileSync('src/app/admin/users/page.tsx', code);
  console.log("Form replaced successfully");
} else {
  console.log("Could not find form boundaries");
}
