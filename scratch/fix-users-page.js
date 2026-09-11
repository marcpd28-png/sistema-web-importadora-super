const fs = require('fs');
let code = fs.readFileSync('src/app/admin/users/page.tsx', 'utf8');

const target = `              <label className="field">
                <span>Teléfono</span>
                <div className="auth-password-wrap">
                  <Phone size={18} />
              </label>

              <label className="field">
                <span>Confirmar contraseña</span>`;

const replacement = `              <label className="field">
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
                <span>Confirmar contraseña</span>`;

// Replace handling cross-platform line endings
code = code.replace(target, replacement);
if(code.indexOf('Tipo de usuario') === -1) {
  // Try line by line or with regex
  const regex = /<label className="field">\s*<span>Teléfono<\/span>\s*<div className="auth-password-wrap">\s*<Phone size={18} \/>\s*<\/label>\s*<label className="field">\s*<span>Confirmar contraseña<\/span>/gm;
  code = code.replace(regex, replacement);
}

fs.writeFileSync('src/app/admin/users/page.tsx', code);
console.log('Fixed:', code.includes('PROMOTOR'));
