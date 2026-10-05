# Devoluciones – Sede Barranquilla

- `Code.gs`, `appsscript.json`: backend en Google Apps Script (datos en Sheets/Drive, correos).
- `Index.html`: interfaz (funciona dentro de Apps Script o servida por la pasarela).
- `server/`: pasarela Node.js para Cloud Run (`Dockerfile` en la raíz). Ver `docs/DESPLIEGUE.md`.

## GitHub Pages
`.github/workflows/pages.yml` publica `Index.html` en https://devolucionesbq.github.io/DevolucionesBQ/ en cada commit a `main`.
La URL `/exec` de Apps Script va en `pages/config.js` (`APP_API_URL`). No defina `GATEWAY_KEY` en Apps Script mientras use Pages (la clave sería pública).
