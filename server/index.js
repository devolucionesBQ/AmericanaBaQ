/**
 * Pasarela (gateway) del Módulo de Devoluciones – Sede Barranquilla.
 * - Sirve la interfaz (Index.html) desde su propio dominio.
 * - Recibe las llamadas de la interfaz en POST /api y las reenvía, desde el servidor,
 *   al backend de Apps Script (la URL /exec y la clave nunca llegan al navegador).
 * Sin dependencias externas: solo Node.js 18+.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 8080);
const UPSTREAM = process.env.APPS_SCRIPT_URL || "";        // URL /exec de Apps Script
const GATEWAY_KEY = process.env.GATEWAY_KEY || "";          // debe coincidir con la propiedad GATEWAY_KEY del script
const MAX_BODY = Number(process.env.MAX_BODY_MB || 60) * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_S || 300) * 1000;
const RATE_LIMIT = Number(process.env.RATE_LIMIT_PER_MIN || 240);   // llamadas por IP y minuto
const HTML_PATH = path.join(__dirname, "..", "Index.html");

const FUNCIONES = new Set([
  "obtenerProgramasDisponibles", "consultarEstadoPublico", "guardarSolicitudFormulario", "subsanarSolicitud",
  "loginInterno", "cerrarSesionInterna", "obtenerPanel", "procesarAcciones", "obtenerHistorial",
  "obtenerComentarios", "agregarComentario", "obtenerArchivo", "descargarFormato", "reemplazarSoportePdf",
  "actualizarExpediente", "subirEstadoCuenta", "subirComprobantePago", "enviarComprobanteEstudiante",
  "cerrarProcesoAdmin", "guardarSolicitudIcetex", "actualizarSolicitudIcetex", "obtenerPeriodos",
  "crearPeriodo", "actualizarPeriodo", "moverSolicitudPeriodo", "obtenerAlertasPlazos", "enviarAlertasPlazo",
  "generarReporteExcel", "cambiarMiClave", "listarUsuarios", "establecerClaveUsuario", "ingresarComoPerfil"
]);

/* ---------- utilidades ---------- */
const hits = new Map();
function limitado(ip) {
  const ahora = Date.now(), v = hits.get(ip) || [];
  const recientes = v.filter(t => ahora - t < 60000);
  recientes.push(ahora); hits.set(ip, recientes);
  return recientes.length > RATE_LIMIT;
}
setInterval(() => { const l = Date.now() - 60000; for (const [k, v] of hits) if (!v.some(t => t > l)) hits.delete(k); }, 60000).unref();

const CABECERAS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Frame-Options": "SAMEORIGIN"
};
function json(res, codigo, obj) {
  res.writeHead(codigo, { "Connection": codigo === 413 ? "close" : "keep-alive", "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...CABECERAS });
  res.end(JSON.stringify(obj));
}
function ipDe(req) { return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim(); }

function leerCuerpo(req) {
  return new Promise((ok, fail) => {
    let n = 0, excedido = false; const partes = [];
    req.on("data", c => { n += c.length; if (excedido) return; if (n > MAX_BODY) { excedido = true; partes.length = 0; fail(Object.assign(new Error("Archivo demasiado grande."), { codigo: 413 })); } else partes.push(c); });
    req.on("end", () => ok(Buffer.concat(partes).toString("utf8")));
    req.on("error", fail);
  });
}

/* ---------- llamada a Apps Script (con 1 reintento si responde HTML/5xx) ---------- */
async function llamarAppsScript(fn, args) {
  const cuerpo = JSON.stringify({ fn, args, key: GATEWAY_KEY });
  let ultimo = "No se pudo comunicar con el servidor de datos.";
  for (let intento = 0; intento < 2; intento++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const r = await fetch(UPSTREAM, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: cuerpo, redirect: "follow", signal: ctl.signal });
      const texto = await r.text();
      try { return JSON.parse(texto); }
      catch (e) { ultimo = "El servidor de datos respondió con un formato inesperado (" + r.status + ")."; }
    } catch (e) {
      ultimo = e.name === "AbortError" ? "El servidor de datos tardó demasiado en responder." : "No se pudo comunicar con el servidor de datos.";
    } finally { clearTimeout(t); }
    // Solo se reintenta lo que no modifica datos
    if (!/^(obtener|consultar|listar|descargar|login)/.test(fn)) break;
    await new Promise(r => setTimeout(r, 800));
  }
  return { ok: false, error: ultimo };
}

/* ---------- servidor ---------- */
function paginaInicio() {
  let html = fs.readFileSync(HTML_PATH, "utf8");
  return html.replace("<!--CONFIG-->", '<script>window.APP_API_URL="/api";</script>');
}

const servidor = http.createServer(async (req, res) => {
  const url = (req.url || "/").split("?")[0];
  try {
    if (req.method === "GET" && url === "/healthz") return json(res, 200, { ok: true });
    if (req.method === "GET" && (url === "/" || url === "/index.html")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache", ...CABECERAS });
      return res.end(paginaInicio());
    }
    if (req.method === "POST" && url === "/api") {
      if (!UPSTREAM) return json(res, 500, { ok: false, error: "El servidor no está configurado (APPS_SCRIPT_URL)." });
      if (limitado(ipDe(req))) return json(res, 429, { ok: false, error: "Demasiadas solicitudes. Espere un momento e intente de nuevo." });
      let p;
      try { p = JSON.parse(await leerCuerpo(req)); } catch (e) {
        return json(res, e.codigo || 400, { ok: false, error: e.codigo === 413 ? "El archivo es demasiado grande." : "Solicitud inválida." });
      }
      if (!p || !FUNCIONES.has(String(p.fn))) return json(res, 400, { ok: false, error: "Operación no permitida." });
      return json(res, 200, await llamarAppsScript(String(p.fn), Array.isArray(p.args) ? p.args : []));
    }
    json(res, 404, { ok: false, error: "No encontrado." });
  } catch (e) {
    console.error("Error:", e && e.message);
    if (!res.headersSent) json(res, 500, { ok: false, error: "Error interno del servidor." });
  }
});
servidor.requestTimeout = 0; servidor.headersTimeout = 65000;

if (require.main === module) servidor.listen(PORT, () => console.log("Devoluciones gateway en puerto " + PORT));
module.exports = { servidor, FUNCIONES };
