# Cuaderno de Ruta

Una sola base de código, dos formas de usarla:

| Versión | GPS con el teléfono bloqueado | Cómo se instala |
|---|---|---|
| **Web / PWA** (Netlify) | No (lo impide el navegador del teléfono) | Abrir la dirección y «Añadir a pantalla de inicio» |
| **App nativa Android** (APK) | **Sí** (servicio en primer plano con notificación) | Descargar el APK que compila GitHub y abrirlo |
| **App nativa iPhone** (Xcode) | **Sí** (modo de ubicación en segundo plano) | Compilar en un Mac con Xcode |

La app detecta sola si corre dentro de la versión nativa y usa el GPS en segundo plano; en el navegador usa el GPS normal.

## 1. Web (Netlify)
Arrastra esta carpeta (o el zip) a https://app.netlify.com/drop. Luego, en Supabase → Authentication → URL Configuration, pon esa dirección como «Site URL».
Edita `config.js` y añade `siteUrl:'https://TU-SITIO.netlify.app'` para que los correos de confirmación y de recuperar contraseña apunten a la web también desde la app nativa.

## 2. Android (APK gratis, sin Android Studio)
1. Crea un repositorio vacío en GitHub y sube esta carpeta completa (con la carpeta oculta `.github`).
2. En GitHub: pestaña **Actions → «Compilar app Android (APK)» → Run workflow** (también corre solo al subir cambios a `main`).
3. Cuando termine (unos 6–10 min), abre la ejecución y descarga el artefacto **cuaderno-de-ruta-apk**; dentro está `app-debug.apk`.
4. Pásalo al teléfono y ábrelo (Android pedirá permitir «instalar apps desconocidas» para el navegador o el gestor de archivos).
5. Al grabar por primera vez: ubicación → **Permitir siempre** (o «Mientras se usa») y permitir notificaciones. Para que ningún fabricante la cierre: Ajustes → Aplicaciones → Cuaderno de Ruta → Batería → **Sin restricciones**.

Para construirlo en tu computador: `npm install`, `npm run android:add`, `npx cap open android`.

## 3. iPhone
Apple solo permite instalar apps firmadas, así que hace falta un Mac:
1. `npm install` y `npm run ios:add`
2. `npx cap open ios` (abre Xcode). En *Signing & Capabilities* elige tu Apple ID como «Team».
3. Conecta el iPhone y pulsa ▶. Con Apple ID gratuito la app caduca a los 7 días y hay que reinstalarla; con la cuenta Apple Developer (USD 99/año) dura un año (TestFlight).
4. Al grabar: ubicación → **Siempre**.

El permiso y el modo de ubicación en segundo plano ya los agrega `scripts/patch-native.mjs`.

## Estado de las pruebas
La lógica de grabación (pausa, distancia, guardado) está probada en navegador, incluida una simulación del plugin de GPS en segundo plano. Lo que **no** se pudo probar fuera de un teléfono real: la compilación del APK/Xcode y el comportamiento del GPS con la pantalla bloqueada en cada marca de teléfono.
