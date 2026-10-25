// Añade permisos de ubicación en segundo plano a los proyectos nativos generados por Capacitor.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const AM = 'android/app/src/main/AndroidManifest.xml';
if (existsSync(AM)) {
  let x = readFileSync(AM, 'utf8');
  const perms = [
    'android.permission.INTERNET',
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_LOCATION',
    'android.permission.POST_NOTIFICATIONS',
  ];
  for (const p of perms) {
    if (!x.includes(`"${p}"`)) x = x.replace('</manifest>', `    <uses-permission android:name="${p}" />\n</manifest>`);
  }
  writeFileSync(AM, x);
  console.log('AndroidManifest.xml parcheado');
}

const PL = 'ios/App/App/Info.plist';
if (existsSync(PL)) {
  let x = readFileSync(PL, 'utf8');
  const add = (key, xml) => { if (!x.includes(`<key>${key}</key>`)) x = x.replace(/<\/dict>\s*<\/plist>/, `\t<key>${key}</key>\n\t${xml}\n</dict>\n</plist>`); };
  add('NSLocationWhenInUseUsageDescription', '<string>Cuaderno de Ruta usa tu ubicación para medir la distancia y dibujar el mapa de tus salidas.</string>');
  add('NSLocationAlwaysAndWhenInUseUsageDescription', '<string>Cuaderno de Ruta sigue registrando tu recorrido aunque bloquees el teléfono.</string>');
  add('UIBackgroundModes', '<array>\n\t\t<string>location</string>\n\t</array>');
  writeFileSync(PL, x);
  console.log('Info.plist parcheado');
}
