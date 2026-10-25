// Copia la app web a www/ (lo que Capacitor empaqueta dentro de la app nativa).
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';
rmSync('www', { recursive: true, force: true });
mkdirSync('www', { recursive: true });
for (const f of ['index.html', 'styles.css', 'app.js', 'config.js', 'manifest.webmanifest', 'icons', 'vendor']) {
  if (existsSync(f)) cpSync(f, 'www/' + f, { recursive: true });
}
console.log('www/ listo');
