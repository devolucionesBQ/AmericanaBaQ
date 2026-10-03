/*************************************************
 * APLICATIVO DEVOLUCIONES v2
 * Corporación Universitaria Americana - Sede Barranquilla
 *************************************************/

const APP_SPREADSHEET_ID = "19h7SoFb4vp-hZbQ2eJH-vwWt0UIuj8FwVTruNZlfwV4";
const APP_FOLDER_ID = "1pJwckuj-cUJrV3TMeaVRG02TV6ukVz7q";

const HOJA_SOLICITUDES = "Solicitudes";
const HOJA_HISTORIAL = "Historial";
const HOJA_USUARIOS = "Usuarios";
const HOJA_CONFIGURACION = "Configuración";
const HOJA_PAQUETES = "Paquetes";
const HOJA_COMENTARIOS = "Comentarios";
const HOJA_PERIODOS = "Periodos";
// Coordinadores de Financiamiento: van en copia desde que Jefatura aprueba el lote y en toda la traza posterior.
// En MODO_PRUEBAS NO se les envía nada (el correo indica a quiénes se copiaría).
const CORREOS_COPIA_COORDINADORES = ["pulgarinromario@americana.edu.co", "haroldalmanza@americana.edu.co"];
const ESTADOS_CON_COPIA = ["ENVIADA A CARTERA", "ENVIADA A CONTROL INTERNO", "ENVIADA A TESORERÍA",
  "DEVUELTA POR CARTERA", "DEVUELTA POR CONTROL INTERNO", "DEVUELTA POR TESORERÍA", "PAGO PROGRAMADO", "PAGO REALIZADO"];
// Plazos (días calendario desde que la solicitud llegó al área) para poder enviar el recordatorio.
// El envío NUNCA es automático: lo dispara el administrador con un clic.
const PLAZOS_ALERTA = [
  { rol: "JEFATURA", area: "Jefatura de Financiamiento", estados: ["ENVIADA A JEFATURA"], colFecha: "Fecha envío Jefatura", dias: 2 },
  { rol: "CARTERA", area: "Cartera", estados: ["ENVIADA A CARTERA"], colFecha: "Fecha envío Cartera", dias: 7 },
  { rol: "CONTROL_INTERNO", area: "Control Interno", estados: ["ENVIADA A CONTROL INTERNO"], colFecha: "Fecha envío Control Interno", dias: 7 },
  { rol: "TESORERIA", area: "Tesorería", estados: ["ENVIADA A TESORERÍA", "PAGO PROGRAMADO"], colFecha: "Fecha envío Tesorería", dias: 10 }
];
const LOGO_URL = "https://americanabaq.edu.co/wp-content/uploads/2022/08/Logo-Cor-Universitaria-Americana-1.webp";
const LOGO_DRIVE_ID = "1dA-8N_g4S0L-rVkKuKSkW5oCG_GZWPaV";
const HOJA_PROGRAMAS = "Programas";

const CORREO_ADMIN = "devoluciones@americana.edu.co";

// false = PRODUCCIÓN (los correos salen a estudiantes, áreas y coordinadores en copia). true = pruebas: todo llega a CORREO_PRUEBAS.
const MODO_PRUEBAS = false;
const CORREO_PRUEBAS = "devoluciones@americana.edu.co";

const SESION_SEGUNDOS = 21600; // 6 horas
// Límite por archivo. Apps Script transfiere el archivo en base64 (≈ +33 %), por eso conviene probar con un archivo grande real.
const MAX_PDF_BYTES = 90 * 1024 * 1024;
const MAX_ADJUNTO_CORREO_BYTES = 24 * 1024 * 1024; // Gmail no permite adjuntos de más de 25 MB

const ETAPAS = ["FINANCIAMIENTO", "JEFATURA FINANCIAMIENTO", "CARTERA", "CONTROL INTERNO", "TESORERÍA", "FINALIZADO"];

const ESTADOS = [
  "RECIBIDA", "EN REVISIÓN FINANCIAMIENTO", "PENDIENTE SUBSANACIÓN", "RECHAZADA POR FINANCIAMIENTO",
  "APROBADA FINANCIAMIENTO", "ENVIADA A JEFATURA", "DEVUELTA POR JEFATURA",
  "ENVIADA A CARTERA", "DEVUELTA POR CARTERA",
  "ENVIADA A CONTROL INTERNO", "DEVUELTA POR CONTROL INTERNO",
  "ENVIADA A TESORERÍA", "DEVUELTA POR TESORERÍA", "PAGO PROGRAMADO", "PAGO REALIZADO", "FINALIZADA"
];

const PERFILES = {
  ADMIN: { etapa: "FINANCIAMIENTO", area: "FINANCIAMIENTO" },
  ICETEX: { etapa: "ICETEX", area: "ICETEX" },
  JEFATURA: { etapa: "JEFATURA FINANCIAMIENTO", area: "Jefatura de Financiamiento" },
  CARTERA: { etapa: "CARTERA", area: "CARTERA" },
  CONTROL_INTERNO: { etapa: "CONTROL INTERNO", area: "CONTROL INTERNO" },
  TESORERIA: { etapa: "TESORERÍA", area: "TESORERÍA" }
};

const ACCIONES_POR_ROL = {
  ADMIN: ["APROBAR_FINANCIAMIENTO", "ENVIAR_JEFATURA", "REENVIAR_CARTERA", "SUBSANACION", "RECHAZAR_FINANCIAMIENTO"],
  ICETEX: ["REENVIAR_JEFATURA"],
  JEFATURA: ["APROBAR", "DEVOLVER"],
  CARTERA: ["APROBAR", "DEVOLVER"],
  CONTROL_INTERNO: ["APROBAR", "DEVOLVER"],
  TESORERIA: ["PROGRAMAR_PAGO", "PAGO_REALIZADO", "DEVOLVER"]
};

// Cadena Jefatura -> Cartera -> Control Interno -> Tesorería
const FLUJO = {
  JEFATURA: {
    estadoEntrada: "ENVIADA A JEFATURA", colEstado: "Estado Jefatura", colFechaResp: "Fecha respuesta Jefatura",
    colObs: "Observación Jefatura", devuelta: "DEVUELTA POR JEFATURA", nombre: "Jefatura de Financiamiento",
    siguiente: { estado: "ENVIADA A CARTERA", etapa: "CARTERA", colFechaEnvio: "Fecha envío Cartera", colEstado: "Estado Cartera", nombre: "Cartera" }
  },
  CARTERA: {
    estadoEntrada: "ENVIADA A CARTERA", colEstado: "Estado Cartera", colFechaResp: "Fecha respuesta Cartera",
    colObs: "Observación Cartera", devuelta: "DEVUELTA POR CARTERA", nombre: "Cartera",
    siguiente: { estado: "ENVIADA A CONTROL INTERNO", etapa: "CONTROL INTERNO", colFechaEnvio: "Fecha envío Control Interno", colEstado: "Estado Control Interno", nombre: "Control Interno" }
  },
  CONTROL_INTERNO: {
    estadoEntrada: "ENVIADA A CONTROL INTERNO", colEstado: "Estado Control Interno", colFechaResp: "Fecha respuesta Control Interno",
    colObs: "Observación Control Interno", devuelta: "DEVUELTA POR CONTROL INTERNO", nombre: "Control Interno",
    siguiente: { estado: "ENVIADA A TESORERÍA", etapa: "TESORERÍA", colFechaEnvio: "Fecha envío Tesorería", colEstado: "Estado Tesorería", nombre: "Tesorería" }
  }
};

const DESTINO_POR_ESTADO = {
  "ENVIADA A JEFATURA": "JEFATURA",
  "ENVIADA A CARTERA": "CARTERA",
  "ENVIADA A CONTROL INTERNO": "CONTROL_INTERNO",
  "ENVIADA A TESORERÍA": "TESORERIA",
  "DEVUELTA POR JEFATURA": "ADMIN",
  "DEVUELTA POR CARTERA": "ADMIN",
  "DEVUELTA POR CONTROL INTERNO": "ADMIN",
  "DEVUELTA POR TESORERÍA": "ADMIN"
};

const ESTADOS_ESTUDIANTE = ["PENDIENTE SUBSANACIÓN", "RECHAZADA POR FINANCIAMIENTO", "PAGO PROGRAMADO", "PAGO REALIZADO"];

const EDITABLES_ADMIN = [
  "Documento estudiante", "Nombre estudiante", "Correo estudiante", "Celular estudiante",
  "Programa", "Modalidad", "Nivel", "Periodo", "Motivo solicitud", "Descripción solicitud",
  "Valor solicitado", "Devolver a", "Artículo aplicado", "Porcentaje devolución", "Valor aprobado",
  "Observación Financiamiento", "Observación pública", "Estado actual", "Etapa actual",
  "Carta solicitud incluida", "Documento identidad incluido", "Soporte pago incluido", "Certificación bancaria incluida"
];

const ENCABEZADOS_SOLICITUDES = [
  "Radicado", "Fecha solicitud", "Hora solicitud", "Estado actual", "Etapa actual", "Responsable actual", "Última actualización",
  "Documento estudiante", "Nombre estudiante", "Correo estudiante", "Celular estudiante",
  "Programa", "Modalidad", "Nivel", "Periodo", "Motivo solicitud", "Descripción solicitud",
  "Valor solicitado", "Devolver a", "Soporte PDF", "Ficha interna", "Carpeta Drive",
  "Certificación bancaria incluida", "Documento identidad incluido", "Carta solicitud incluida", "Soporte pago incluido",
  "Revisado por Financiamiento", "Fecha revisión Financiamiento", "Decisión Financiamiento", "Artículo aplicado",
  "Porcentaje devolución", "Valor aprobado", "Observación Financiamiento",
  "Número paquete", "Fecha envío Jefatura", "Estado Jefatura", "Fecha respuesta Jefatura", "Observación Jefatura", "Firma Jefatura",
  "Fecha envío Cartera", "Estado Cartera", "Fecha respuesta Cartera", "Observación Cartera", "Firma Cartera",
  "Fecha envío Control Interno", "Estado Control Interno", "Fecha respuesta Control Interno", "Observación Control Interno", "Firma Control Interno",
  "Fecha envío Tesorería", "Estado Tesorería", "Fecha programación pago", "Fecha pago", "Comprobante pago", "Observación Tesorería",
  "Fecha notificación estudiante", "Estado final", "Días en proceso", "Observación pública",
  "Fecha subsanación", "Comentario subsanación",
  "Funcionario Financiamiento", "Funcionario Jefatura", "Funcionario Cartera", "Funcionario Control Interno", "Funcionario Tesorería",
  "Estado de cuenta PDF", "Fecha estado de cuenta", "Funcionario estado de cuenta",
  "Última alerta plazo", "Alertas plazo enviadas",
  "Tipo solicitud", "Periodo recepción", "Cálculo devolución ICETEX", "Funcionario radica",
  "Fecha comprobante pago", "Funcionario comprobante pago", "Fecha envío comprobante"
];

const ENCABEZADOS_PERIODOS = ["Periodo", "Hoja", "Fecha inicio", "Fecha fin", "Estado", "Creado por", "Fecha creación"];

const ENCABEZADOS_COMENTARIOS = ["Fecha", "Hora", "Radicado", "Rol", "Funcionario", "Correo", "Comentario"];

const ENCABEZADOS_PAQUETES = [
  "Número paquete", "Fecha creación", "Creado por", "Cantidad solicitudes", "Valor total aprobado", "Estado paquete",
  "Fecha envío Jefatura", "Fecha respuesta Jefatura", "Observación Jefatura", "Solicitudes incluidas", "Carpeta paquete", "Soporte firmado"
];

/*************************************************
 * WEB APP
 *************************************************/

function doGet(e) {
  return HtmlService
    .createHtmlOutputFromFile("Index")
    .setTitle("Módulo de Devoluciones - Sede Barranquilla")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/*************************************************
 * ESTRUCTURA (ejecutar una vez desde el editor)
 *************************************************/

function crearEstructuraAplicativo() {
  const ss = SpreadsheetApp.openById(APP_SPREADSHEET_ID);
  const primera = !ss.getSheetByName(HOJA_PERIODOS) || leerPeriodos_(ss).length === 0;
  if (primera) prepararHojaSolicitudes_(ss);   // hoja base = primer periodo
  prepararHojaPeriodos_(ss);
  leerPeriodos_(ss).forEach(function(p) { if (p.hoja) prepararHojaSolicitudesNombre_(ss, p.hoja); });
  prepararHojaHistorial_(ss);
  prepararHojaUsuarios_(ss);
  asegurarUsuarioIcetex_(ss);
  prepararHojaConfiguracion_(ss);
  prepararHojaPaquetes_(ss);
  prepararHojaProgramas_(ss);
  prepararHojaComentarios_(ss);
  corregirPeriodos();
  return { success: true, mensaje: "Estructura del aplicativo preparada correctamente." };
}

function prepararHojaSolicitudes_(ss) {
  prepararHojaSolicitudesNombre_(ss, HOJA_SOLICITUDES);
}

function prepararHojaSolicitudesNombre_(ss, nombre) {
  const hoja = obtenerOCrearHoja_(ss, nombre);
  asegurarEncabezados_(hoja, ENCABEZADOS_SOLICITUDES, "#07043B");

  const m = mapaCols_(hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0]);
  ["Documento estudiante", "Celular estudiante", "Hora solicitud", "Periodo"].forEach(function(c) {
    const i = m[normalizarTexto_(c)];
    if (i !== undefined) hoja.getRange(1, i + 1, hoja.getMaxRows(), 1).setNumberFormat("@");
  });

  hoja.getRange(2, 1, Math.max(hoja.getMaxRows() - 1, 1), hoja.getLastColumn()).clearDataValidations();
  hoja.setFrozenRows(1);
  hoja.setFrozenColumns(1);
  hoja.autoResizeColumns(1, hoja.getLastColumn());
}

function prepararHojaHistorial_(ss) {
  const hoja = obtenerOCrearHoja_(ss, HOJA_HISTORIAL);
  asegurarEncabezados_(hoja, [
    "Fecha", "Hora", "Radicado", "Usuario", "Rol", "Acción", "Estado anterior", "Estado nuevo",
    "Etapa anterior", "Etapa nueva", "Responsable anterior", "Responsable nuevo", "Observación"
  ], "#07043B");
  hoja.setFrozenRows(1);
  hoja.autoResizeColumns(1, hoja.getLastColumn());
}

function prepararHojaUsuarios_(ss) {
  const hoja = obtenerOCrearHoja_(ss, HOJA_USUARIOS);
  const enc = ["Correo", "Nombre", "Rol", "Área", "Estado", "Clave acceso", "Fecha creación"];
  asegurarEncabezados_(hoja, enc, "#07043B");

  if (hoja.getLastRow() < 2) {
    const ahora = new Date();
    const usuarios = [
      [CORREO_ADMIN, "Administrador Devoluciones", "ADMIN", "FINANCIAMIENTO", "ACTIVO", "", ahora],
      [CORREO_ADMIN, "Jefatura de Financiamiento", "JEFATURA", "Jefatura de Financiamiento", "ACTIVO", "", ahora],
      [CORREO_ADMIN, "Cartera", "CARTERA", "CARTERA", "ACTIVO", "", ahora],
      [CORREO_ADMIN, "Control Interno", "CONTROL_INTERNO", "CONTROL INTERNO", "ACTIVO", "", ahora],
      [CORREO_ADMIN, "Tesorería", "TESORERIA", "TESORERÍA", "ACTIVO", "", ahora]
    ];
    hoja.getRange(2, 1, usuarios.length, enc.length).setValues(usuarios);
  }
  hoja.setFrozenRows(1);
  hoja.autoResizeColumns(1, hoja.getLastColumn());
}

function prepararHojaConfiguracion_(ss) {
  const hoja = obtenerOCrearHoja_(ss, HOJA_CONFIGURACION);
  if (hoja.getLastRow() > 1) return;

  hoja.clear();
  hoja.getRange("A1").setValue("Estados");
  hoja.getRange("C1").setValue("Etapas");
  hoja.getRange("E1").setValue("Parámetro");
  hoja.getRange("F1").setValue("Valor");

  hoja.getRange(2, 1, ESTADOS.length, 1).setValues(ESTADOS.map(function(x) { return [x]; }));
  hoja.getRange(2, 3, ETAPAS.length, 1).setValues(ETAPAS.map(function(x) { return [x]; }));

  const parametros = [
    ["Correo administrador", CORREO_ADMIN],
    ["Carpeta Drive base", APP_FOLDER_ID],
    ["Modo pruebas", MODO_PRUEBAS ? "SÍ" : "NO"],
    ["Correo pruebas", CORREO_PRUEBAS]
  ];
  hoja.getRange(2, 5, parametros.length, 2).setValues(parametros);

  hoja.getRange("A1:F1").setFontWeight("bold").setBackground("#07043B").setFontColor("#FFFFFF").setHorizontalAlignment("center");
  hoja.autoResizeColumns(1, 6);
}

/*************************************************
 * PERIODOS DE RECEPCIÓN (cada periodo = una hoja de solicitudes)
 *************************************************/

function prepararHojaPeriodos_(ss) {
  const hoja = obtenerOCrearHoja_(ss, HOJA_PERIODOS);
  asegurarEncabezados_(hoja, ENCABEZADOS_PERIODOS, "#07043B");
  hoja.getRange(1, 1, hoja.getMaxRows(), 2).setNumberFormat("@");
  if (hoja.getLastRow() < 2) {
    // Primer periodo: usa la hoja de solicitudes que ya existe, para no perder datos.
    const hoy = new Date();
    const anio = hoy.getFullYear();
    const sem = hoy.getMonth() < 6 ? 1 : 2;
    const desde = new Date(anio, sem === 1 ? 0 : 6, 1);
    const hasta = new Date(anio, sem === 1 ? 5 : 11, sem === 1 ? 30 : 31);
    hoja.getRange(2, 1, 1, 7).setValues([[anio + "-" + sem, HOJA_SOLICITUDES, desde, hasta, "ACTIVO", "Sistema", hoy]]);
    hoja.getRange(2, 3, 1, 2).setNumberFormat("dd/MM/yyyy");
  }
  hoja.setFrozenRows(1);
  hoja.autoResizeColumns(1, hoja.getLastColumn());
}

function leerPeriodos_(ss) {
  const hoja = ss.getSheetByName(HOJA_PERIODOS);
  if (!hoja || hoja.getLastRow() < 2) return [];
  const datos = hoja.getDataRange().getValues();
  const m = mapaCols_(datos[0]);
  const out = [];
  for (let i = 1; i < datos.length; i++) {
    const nombre = periodoTexto_(g_(datos[i], m, "Periodo"));
    if (!nombre) continue;
    out.push({
      fila: i + 1, periodo: nombre, hoja: String(g_(datos[i], m, "Hoja")).trim(),
      desde: g_(datos[i], m, "Fecha inicio"), hasta: g_(datos[i], m, "Fecha fin"),
      estado: up_(g_(datos[i], m, "Estado")) || "CERRADO"
    });
  }
  return out;
}

function periodoActivo_(ss) {
  const lista = leerPeriodos_(ss);
  for (let i = 0; i < lista.length; i++) if (lista[i].estado === "ACTIVO") return lista[i];
  return null;
}

function obtenerHojaPeriodo_(ss, nombreHoja) {
  let hoja = ss.getSheetByName(nombreHoja);
  if (!hoja) { prepararHojaSolicitudesNombre_(ss, nombreHoja); hoja = ss.getSheetByName(nombreHoja); }
  return hoja;
}

function validarNombreHoja_(n) {
  const t = String(n || "").trim();
  if (!t || t.length > 90) throw new Error("El nombre de la hoja debe tener entre 1 y 90 caracteres.");
  if (/[\[\]*?\/\\:]/.test(t)) throw new Error("El nombre de la hoja no puede tener los caracteres [ ] * ? / \\ :");
  return t;
}

function fechaIso_(d) { return d instanceof Date ? Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd") : ""; }
function fechaCorta_(d) { return d instanceof Date ? Utilities.formatDate(d, Session.getScriptTimeZone(), "dd/MM/yyyy") : ""; }

function establecerEstadoPeriodos_(ss, activo) {
  const hoja = ss.getSheetByName(HOJA_PERIODOS);
  const datos = hoja.getDataRange().getValues();
  const m = mapaCols_(datos[0]);
  const ie = m[normalizarTexto_("Estado")];
  for (let i = 1; i < datos.length; i++) {
    const nombre = periodoTexto_(g_(datos[i], m, "Periodo"));
    if (!nombre) continue;
    hoja.getRange(i + 1, ie + 1).setValue(nombre === activo ? "ACTIVO" : "CERRADO");
  }
}

function obtenerPeriodos(token) {
  try {
    sesion_(token, ["ADMIN"]);
    const ctx = leerSolicitudes_();
    const cuentas = {};
    ctx.filas.forEach(function(f) {
      if (!String(g_(f, ctx.m, "Radicado")).trim()) return;
      const p = String(g_(f, ctx.m, "Periodo recepción"));
      cuentas[p] = (cuentas[p] || 0) + 1;
    });
    const lista = ctx.periodos.map(function(p) {
      return { periodo: p.periodo, hoja: p.hoja, desde: fechaCorta_(p.desde), hasta: fechaCorta_(p.hasta), desdeIso: fechaIso_(p.desde), hastaIso: fechaIso_(p.hasta),
        estado: p.estado, solicitudes: cuentas[p.periodo] || 0, existeHoja: !!ctx.ss.getSheetByName(p.hoja) };
    });
    return { success: true, periodos: lista };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function crearPeriodo(token, d) {
  const lock = LockService.getScriptLock();
  try {
    const u = sesion_(token, ["ADMIN"]);
    lock.waitLock(30000);
    const ss = SpreadsheetApp.openById(APP_SPREADSHEET_ID);
    let nombre = String(d && d.periodo || "").trim();
    nombre = normalizarPeriodo_(nombre) || nombre;
    if (!/^[\w.\- ]{1,30}$/.test(nombre)) throw new Error("Escriba el nombre del periodo (ej: 2026-2).");
    const lista = leerPeriodos_(ss);
    if (lista.some(function(p) { return normalizarTexto_(p.periodo) === normalizarTexto_(nombre); })) throw new Error("Ya existe el periodo " + nombre + ".");
    const hojaNombre = validarNombreHoja_(d.hoja || ("Solicitudes " + nombre));
    if (lista.some(function(p) { return normalizarTexto_(p.hoja) === normalizarTexto_(hojaNombre); })) throw new Error("Esa hoja ya pertenece a otro periodo.");
    const desde = d.desde ? new Date(d.desde + "T00:00:00") : "";
    const hasta = d.hasta ? new Date(d.hasta + "T00:00:00") : "";
    if (desde && hasta && hasta < desde) throw new Error("La fecha fin no puede ser anterior a la fecha inicio.");

    obtenerHojaPeriodo_(ss, hojaNombre);   // la crea (con encabezados) o reutiliza una existente
    const hoja = ss.getSheetByName(HOJA_PERIODOS);
    const fila = hoja.getLastRow() + 1;
    hoja.getRange(fila, 1, 1, 2).setNumberFormat("@");
    hoja.getRange(fila, 1, 1, 7).setValues([[nombre, hojaNombre, desde, hasta, "CERRADO", u.correo, new Date()]]);
    hoja.getRange(fila, 3, 1, 2).setNumberFormat("dd/MM/yyyy");
    if (d.activar) establecerEstadoPeriodos_(ss, nombre);

    registrarHistorial_({ ss: ss, radicado: "-", usuario: u.correo, rol: "ADMIN", accion: "Periodo creado", observacion: nombre + " → hoja \"" + hojaNombre + "\"" + (d.activar ? " (activado para recibir solicitudes)" : "") });
    return { success: true, mensaje: "Periodo " + nombre + " creado" + (d.activar ? " y activado: las nuevas solicitudes se guardarán en la hoja \"" + hojaNombre + "\"." : ".") };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// cambios: { estado: "ACTIVO"|"CERRADO", desde, hasta, hoja (renombra la hoja del periodo) }
function actualizarPeriodo(token, periodo, cambios) {
  const lock = LockService.getScriptLock();
  try {
    const u = sesion_(token, ["ADMIN"]);
    lock.waitLock(30000);
    const ss = SpreadsheetApp.openById(APP_SPREADSHEET_ID);
    const lista = leerPeriodos_(ss);
    const p = lista.filter(function(x) { return x.periodo === String(periodo).trim(); })[0];
    if (!p) throw new Error("No se encontró el periodo " + periodo + ".");
    const hoja = ss.getSheetByName(HOJA_PERIODOS);
    const m = mapaCols_(hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0]);
    const detalle = [];
    const c = cambios || {};

    if (c.hoja !== undefined && String(c.hoja).trim() !== p.hoja) {
      const nuevo = validarNombreHoja_(c.hoja);
      if (lista.some(function(x) { return normalizarTexto_(x.hoja) === normalizarTexto_(nuevo); }) || ss.getSheetByName(nuevo)) throw new Error("Ya existe una hoja con ese nombre.");
      const actual = ss.getSheetByName(p.hoja);
      if (!actual) throw new Error("No se encontró la hoja actual del periodo.");
      actual.setName(nuevo);
      hoja.getRange(p.fila, m[normalizarTexto_("Hoja")] + 1).setValue(nuevo);
      detalle.push("hoja: " + p.hoja + " → " + nuevo);
    }
    if (c.desde !== undefined || c.hasta !== undefined) {
      const desde = c.desde !== undefined ? (c.desde ? new Date(c.desde + "T00:00:00") : "") : p.desde;
      const hasta = c.hasta !== undefined ? (c.hasta ? new Date(c.hasta + "T00:00:00") : "") : p.hasta;
      if (desde && hasta && hasta < desde) throw new Error("La fecha fin no puede ser anterior a la fecha inicio.");
      hoja.getRange(p.fila, m[normalizarTexto_("Fecha inicio")] + 1).setValue(desde).setNumberFormat("dd/MM/yyyy");
      hoja.getRange(p.fila, m[normalizarTexto_("Fecha fin")] + 1).setValue(hasta).setNumberFormat("dd/MM/yyyy");
      detalle.push("fechas actualizadas");
    }
    if (c.estado) {
      const e = up_(c.estado);
      if (e === "ACTIVO") establecerEstadoPeriodos_(ss, p.periodo);
      else if (e === "CERRADO") hoja.getRange(p.fila, m[normalizarTexto_("Estado")] + 1).setValue("CERRADO");
      else throw new Error("Estado no válido.");
      detalle.push("estado: " + e);
    }
    if (!detalle.length) return { success: true, mensaje: "No había cambios." };
    registrarHistorial_({ ss: ss, radicado: "-", usuario: u.correo, rol: "ADMIN", accion: "Periodo actualizado", observacion: p.periodo + " — " + detalle.join(" | ") });
    return { success: true, mensaje: "Periodo " + p.periodo + " actualizado (" + detalle.join(", ") + ")." };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// Mueve una solicitud a la hoja de otro periodo (y cambia su "Periodo recepción").
function moverSolicitudPeriodo(token, radicado, destino) {
  const lock = LockService.getScriptLock();
  try {
    const u = sesion_(token, ["ADMIN"]);
    lock.waitLock(30000);
    const ctx = leerSolicitudes_();
    const pos = buscarPos_(ctx, radicado);
    if (pos < 0) throw new Error("No se encontró el radicado " + radicado);
    const p = ctx.periodos.filter(function(x) { return x.periodo === String(destino).trim(); })[0];
    if (!p) throw new Error("No se encontró el periodo destino.");
    const fila = ctx.filas[pos].slice();
    const origen = ctx.origen[pos];
    const anterior = String(g_(fila, ctx.m, "Periodo recepción"));
    if (anterior === p.periodo) throw new Error("La solicitud ya está en el periodo " + p.periodo + ".");

    const hojaDest = obtenerHojaPeriodo_(ctx.ss, p.hoja);
    if (hojaDest.getName() === origen.hoja.getName()) throw new Error("El periodo destino usa la misma hoja.");
    s_(fila, ctx.m, "Periodo recepción", p.periodo);
    s_(fila, ctx.m, "Última actualización", new Date());

    const encDest = hojaDest.getRange(1, 1, 1, hojaDest.getLastColumn()).getValues()[0];
    const mDest = mapaCols_(encDest);
    const out = new Array(encDest.length).fill("");
    ctx.encabezados.forEach(function(h, i) {
      const j = mDest[normalizarTexto_(h)];
      if (j !== undefined) out[j] = fila[i];
    });
    const nueva = hojaDest.getLastRow() + 1;
    ["Documento estudiante", "Celular estudiante", "Hora solicitud", "Periodo"].forEach(function(col) {
      const j = mDest[normalizarTexto_(col)];
      if (j !== undefined) hojaDest.getRange(nueva, j + 1).setNumberFormat("@");
    });
    hojaDest.getRange(nueva, 1, 1, out.length).setValues([out]);
    origen.hoja.deleteRow(origen.fila);

    registrarHistorial_({ ss: ctx.ss, radicado: radicado, usuario: u.correo, rol: "ADMIN", accion: "Solicitud movida de periodo",
      estadoAnterior: g_(fila, ctx.m, "Estado actual"), estadoNuevo: g_(fila, ctx.m, "Estado actual"),
      etapaAnterior: g_(fila, ctx.m, "Etapa actual"), etapaNueva: g_(fila, ctx.m, "Etapa actual"),
      observacion: anterior + " → " + p.periodo + " (hoja \"" + p.hoja + "\")" });
    return { success: true, mensaje: "Solicitud movida al periodo " + p.periodo + "." };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function asegurarUsuarioIcetex_(ss) {
  const hoja = ss.getSheetByName(HOJA_USUARIOS);
  if (!hoja) return;
  const datos = hoja.getDataRange().getValues();
  const m = mapaCols_(datos[0]);
  for (let i = 1; i < datos.length; i++) if (rolNorm_(g_(datos[i], m, "Rol")) === "ICETEX") return;
  hoja.appendRow([CORREO_ADMIN, "Stephany Solano", "ICETEX", "ICETEX", "ACTIVO", "", new Date()]);
}

// Genera SOLO la clave del perfil ICETEX (no toca las claves de los demás) y la envía al administrador.
function generarClaveIcetex() {
  const ss = SpreadsheetApp.openById(APP_SPREADSHEET_ID);
  asegurarUsuarioIcetex_(ss);
  const hoja = ss.getSheetByName(HOJA_USUARIOS);
  const datos = hoja.getDataRange().getValues();
  const m = mapaCols_(datos[0]);
  const filas = [];
  for (let i = 1; i < datos.length; i++) {
    if (rolNorm_(g_(datos[i], m, "Rol")) !== "ICETEX" || up_(g_(datos[i], m, "Estado")) !== "ACTIVO") continue;
    const clave = generarClave_();
    hoja.getRange(i + 1, m[normalizarTexto_("Clave acceso")] + 1).setValue(hashClave_(clave));
    filas.push("<tr><td>ICETEX</td><td>" + escaparHtml_(g_(datos[i], m, "Nombre")) + "</td><td>" + escaparHtml_(g_(datos[i], m, "Correo")) + "</td><td><b>" + escaparHtml_(clave) + "</b></td></tr>");
  }
  MailApp.sendEmail({ to: CORREO_ADMIN, subject: "Devoluciones Sede Barranquilla: clave de acceso del perfil ICETEX",
    htmlBody: "<p>Clave generada para el perfil ICETEX. Entréguela a la funcionaria y elimine este correo.</p><table border='1' cellpadding='6' style='border-collapse:collapse;font-family:Arial'><tr><th>Perfil</th><th>Nombre</th><th>Correo</th><th>Clave</th></tr>" + filas.join("") + "</table>" });
  return filas.length;
}

function prepararHojaComentarios_(ss) {
  const hoja = obtenerOCrearHoja_(ss, HOJA_COMENTARIOS);
  asegurarEncabezados_(hoja, ENCABEZADOS_COMENTARIOS, "#07043B");
  hoja.setFrozenRows(1);
}

// Si Google Sheets convirtió "2026-1" en fecha, la deja de nuevo como texto "2026-1".
function periodoTexto_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-M");
  const t = String(v === null || v === undefined ? "" : v).trim();
  return normalizarPeriodo_(t) || t;
}

// Acepta 2026-1, 20261, 2026.1, 2026 1, 2026/1, 2026-01, 2026-I, 2026 II ... y devuelve "2026-1". Si no es válido devuelve "".
function normalizarPeriodo_(t) {
  const m = /^(\d{4})\s*[-.\/_\s]?\s*(0?1|0?2|II|I)$/i.exec(String(t === null || t === undefined ? "" : t).trim());
  if (!m) return "";
  const s = m[2].toUpperCase();
  return m[1] + "-" + (s === "II" ? "2" : s === "I" ? "1" : s.replace("0", ""));
}

// Ejecutar una vez (crearEstructuraAplicativo ya lo hace): corrige periodos que quedaron como fecha.
function corregirPeriodos() {
  const ss = SpreadsheetApp.openById(APP_SPREADSHEET_ID);
  let total = 0;
  const nombres = leerPeriodos_(ss).map(function(p) { return p.hoja; });
  if (!nombres.length) nombres.push(HOJA_SOLICITUDES);
  nombres.forEach(function(nombre) {
    const hoja = ss.getSheetByName(nombre);
    if (!hoja || hoja.getLastRow() < 2) return;
    const enc = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
    const i = mapaCols_(enc)[normalizarTexto_("Periodo")];
    if (i === undefined) return;
    const rango = hoja.getRange(2, i + 1, hoja.getLastRow() - 1, 1);
    const nuevos = rango.getValues().map(function(r) {
      if (r[0] instanceof Date) { total++; return [periodoTexto_(r[0])]; }
      const n = periodoTexto_(r[0]);
      if (r[0] !== "" && n !== String(r[0])) total++;
      return [r[0] === "" ? "" : n];
    });
    rango.setNumberFormat("@");
    rango.setValues(nuevos);
  });
  return total;
}

function prepararHojaPaquetes_(ss) {
  const hoja = obtenerOCrearHoja_(ss, HOJA_PAQUETES);
  asegurarEncabezados_(hoja, ENCABEZADOS_PAQUETES, "#07043B");
  hoja.setFrozenRows(1);
  hoja.autoResizeColumns(1, hoja.getLastColumn());
}

function prepararHojaProgramas_(ss) {
  const hoja = obtenerOCrearHoja_(ss, HOJA_PROGRAMAS);
  if (hoja.getLastRow() < 1) {
    const enc = [
      "PROGRAMAS DE PREGRADO PRESENCIAL", "PROGRAMAS DE PREGRADO VIRTUAL", "PROGRAMAS DE PREGRADO A DISTANCIA",
      "ESPECIALIZACIONES PRESENCIALES", "ESPECIALIZACIONES VIRTUALES", "MAESTRÍAS PRESENCIALES", "MAESTRÍAS VIRTUALES"
    ];
    hoja.getRange(1, 1, 1, enc.length).setValues([enc]);
  }
  hoja.getRange(1, 1, 1, hoja.getLastColumn())
    .setFontWeight("bold").setBackground("#07043B").setFontColor("#FFFFFF")
    .setHorizontalAlignment("center").setWrap(true);
  hoja.setFrozenRows(1);
  hoja.autoResizeColumns(1, hoja.getLastColumn());
}

/*************************************************
 * CLAVES Y SESIÓN
 *************************************************/

// Ejecutar manualmente UNA vez: genera claves aleatorias, las guarda cifradas (hash)
// y envía el listado al correo administrador.
function restablecerClaves() {
  const ss = SpreadsheetApp.openById(APP_SPREADSHEET_ID);
  const hoja = ss.getSheetByName(HOJA_USUARIOS);
  const datos = hoja.getDataRange().getValues();
  const m = mapaCols_(datos[0]);
  const lista = [];

  for (let i = 1; i < datos.length; i++) {
    const estado = up_(g_(datos[i], m, "Estado"));
    if (estado !== "ACTIVO") continue;
    const clave = generarClave_();
    hoja.getRange(i + 1, m[normalizarTexto_("Clave acceso")] + 1).setValue(hashClave_(clave));
    lista.push({ correo: datos[i][m[normalizarTexto_("Correo")]], rol: datos[i][m[normalizarTexto_("Rol")]], clave: clave });
  }

  const filas = lista.map(function(u) {
    return "<tr><td>" + escaparHtml_(u.rol) + "</td><td>" + escaparHtml_(u.correo) + "</td><td><b>" + escaparHtml_(u.clave) + "</b></td></tr>";
  }).join("");

  MailApp.sendEmail({
    to: CORREO_ADMIN,
    subject: "Devoluciones Sede Barranquilla: claves de acceso por perfil",
    htmlBody: "<p>Claves generadas. Entréguelas a cada responsable y elimine este correo.</p>" +
      "<table border='1' cellpadding='6' style='border-collapse:collapse;font-family:Arial'><tr><th>Perfil</th><th>Correo</th><th>Clave</th></tr>" + filas + "</table>"
  });
  return "Claves generadas y enviadas a " + CORREO_ADMIN;
}

function generarClave_() {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  do {
    s = "";
    for (let i = 0; i < 10; i++) s += c.charAt(Math.floor(Math.random() * c.length));
  } while (!/[A-Za-z]/.test(s) || !/\d/.test(s));
  return s;
}

function hashClave_(clave) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, "AMERICANA|" + String(clave), Utilities.Charset.UTF_8);
  return bytes.map(function(b) { return ("0" + (b & 0xFF).toString(16)).slice(-2); }).join("");
}

function loginInterno(correo, rol, clave) {
  try {
    const rolN = rolNorm_(rol);
    if (!PERFILES[rolN]) throw new Error("Seleccione un perfil válido.");

    const cache = CacheService.getScriptCache();
    const keyInt = "INT_" + normalizarTexto_(correo) + "_" + rolN;
    const intentos = Number(cache.get(keyInt) || 0);
    if (intentos >= 5) throw new Error("Demasiados intentos fallidos. Espere 10 minutos e intente de nuevo.");

    const ss = SpreadsheetApp.openById(APP_SPREADSHEET_ID);
    const hoja = ss.getSheetByName(HOJA_USUARIOS);
    if (!hoja) throw new Error("No existe la hoja Usuarios.");

    const datos = hoja.getDataRange().getValues();
    const m = mapaCols_(datos[0]);
    const correoN = normalizarTexto_(correo);
    const claveIngresada = String(clave || "").trim();

    for (let i = 1; i < datos.length; i++) {
      const f = datos[i];
      if (normalizarTexto_(g_(f, m, "Correo")) !== correoN) continue;
      if (rolNorm_(g_(f, m, "Rol")) !== rolN) continue;
      if (up_(g_(f, m, "Estado")) !== "ACTIVO") continue;

      const guardada = String(g_(f, m, "Clave acceso") || "").trim();
      if (!guardada || !claveIngresada) continue;

      let ok = false;
      if (/^[0-9a-f]{64}$/.test(guardada)) {
        ok = hashClave_(claveIngresada) === guardada;
      } else if (guardada === claveIngresada) {
        // Clave antigua en texto plano: se migra a hash automáticamente.
        ok = true;
        hoja.getRange(i + 1, m[normalizarTexto_("Clave acceso")] + 1).setValue(hashClave_(claveIngresada));
      }

      if (ok) {
        const token = Utilities.getUuid() + Utilities.getUuid();
        const usuario = {
          correo: String(g_(f, m, "Correo")),
          nombre: String(g_(f, m, "Nombre")),
          rol: rolN,
          area: String(g_(f, m, "Área") || PERFILES[rolN].area)
        };
        cache.put("SES_" + token, JSON.stringify(usuario), SESION_SEGUNDOS);
        cache.remove(keyInt);
        return { success: true, token: token, correo: usuario.correo, nombre: usuario.nombre, rol: rolN, area: usuario.area };
      }
    }

    cache.put(keyInt, String(intentos + 1), 600);
    return { success: false, error: "Correo, perfil o clave incorrectos." };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function cerrarSesionInterna(token) {
  try { CacheService.getScriptCache().remove("SES_" + token); } catch (e) {}
  return { success: true };
}

/*************************************************
 * CLAVES: cambio propio, restablecimiento y acceso del administrador
 *************************************************/

function validarClaveNueva_(clave) {
  const k = String(clave === null || clave === undefined ? "" : clave);
  if (k !== k.trim() || /\s/.test(k)) throw new Error("La clave no debe tener espacios.");
  if (k.length < 8) throw new Error("La clave debe tener al menos 8 caracteres.");
  if (k.length > 64) throw new Error("La clave no debe superar 64 caracteres.");
  if (!/[A-Za-z]/.test(k) || !/\d/.test(k)) throw new Error("La clave debe combinar letras y números.");
}

function buscarFilaUsuario_(hoja, correo, rolN) {
  const datos = hoja.getDataRange().getValues();
  const m = mapaCols_(datos[0]);
  const correoN = normalizarTexto_(correo);
  for (let i = 1; i < datos.length; i++) {
    if (normalizarTexto_(g_(datos[i], m, "Correo")) !== correoN) continue;
    if (rolNorm_(g_(datos[i], m, "Rol")) !== rolN) continue;
    return { fila: i + 1, datos: datos[i], m: m };
  }
  return null;
}

function claveCorrecta_(guardada, ingresada) {
  const g = String(guardada || "").trim();
  if (!g || !ingresada) return false;
  if (/^[0-9a-f]{64}$/.test(g)) return hashClave_(ingresada) === g;
  return g === ingresada;
}

// Cada usuario cambia su propia clave (necesita la actual).
function cambiarMiClave(token, claveActual, claveNueva) {
  const lock = LockService.getScriptLock();
  try {
    const u = sesion_(token);
    if (u.via) throw new Error("No puede cambiar la clave mientras ingresa como otro perfil.");
    const actual = String(claveActual || "").trim();
    if (!actual) throw new Error("Escriba su clave actual.");
    validarClaveNueva_(claveNueva);
    if (String(claveNueva) === actual) throw new Error("La nueva clave debe ser diferente de la actual.");

    const cache = CacheService.getScriptCache();
    const keyInt = "CK_" + normalizarTexto_(u.correo) + "_" + u.rol;
    const intentos = Number(cache.get(keyInt) || 0);
    if (intentos >= 5) throw new Error("Demasiados intentos fallidos. Espere 10 minutos e intente de nuevo.");

    lock.waitLock(30000);
    const hoja = SpreadsheetApp.openById(APP_SPREADSHEET_ID).getSheetByName(HOJA_USUARIOS);
    const f = buscarFilaUsuario_(hoja, u.correo, u.rol);
    if (!f) throw new Error("No se encontró su usuario.");
    if (!claveCorrecta_(g_(f.datos, f.m, "Clave acceso"), actual)) {
      cache.put(keyInt, String(intentos + 1), 600);
      throw new Error("La clave actual no es correcta.");
    }
    hoja.getRange(f.fila, f.m[normalizarTexto_("Clave acceso")] + 1).setValue(hashClave_(String(claveNueva)));
    cache.remove(keyInt);
    avisoCambioClave_(u.correo, u.nombre, "Usted cambió la clave de acceso de su perfil.");
    return { success: true, mensaje: "Su clave fue actualizada." };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function avisoCambioClave_(correo, nombre, texto) {
  try {
    if (!validarCorreo_(String(correo || ""))) return;
    enviarCorreoInstitucional_({ to: correo, subject: "Seguridad de su cuenta: clave de acceso actualizada (Devoluciones)" }, {
      etiqueta: "Seguridad",
      titulo: "Clave de acceso actualizada",
      saludo: "Cordial saludo, <b>" + escaparHtml_(nombre || "") + "</b>.",
      parrafos: [escaparHtml_(texto), "Por seguridad, este mensaje no incluye la clave. Si usted no reconoce este cambio, comuníquese de inmediato con Financiamiento Estudiantil."],
      boton: urlApp_() ? { texto: "Abrir aplicativo", url: urlApp_() } : null
    });
  } catch (e) { Logger.log("Aviso de clave: " + e.message); }
}

function listarUsuarios(token) {
  try {
    sesion_(token, ["ADMIN"]);
    const hoja = SpreadsheetApp.openById(APP_SPREADSHEET_ID).getSheetByName(HOJA_USUARIOS);
    const datos = hoja.getDataRange().getValues();
    const m = mapaCols_(datos[0]);
    const out = [];
    for (let i = 1; i < datos.length; i++) {
      const correo = String(g_(datos[i], m, "Correo") || "").trim();
      if (!correo) continue;
      out.push({
        correo: correo, nombre: String(g_(datos[i], m, "Nombre") || ""), rol: rolNorm_(g_(datos[i], m, "Rol")),
        area: String(g_(datos[i], m, "Área") || ""), estado: up_(g_(datos[i], m, "Estado")),
        tieneClave: !!String(g_(datos[i], m, "Clave acceso") || "").trim()
      });
    }
    return { success: true, usuarios: out };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// El administrador fija una clave nueva a un perfil (la escribe él o se genera una aleatoria que se muestra una sola vez).
function establecerClaveUsuario(token, correo, rol, claveNueva, generar) {
  const lock = LockService.getScriptLock();
  try {
    const admin = sesion_(token, ["ADMIN"]);
    if (admin.via) throw new Error("No disponible mientras ingresa como otro perfil.");
    const rolN = rolNorm_(rol);
    if (!PERFILES[rolN]) throw new Error("Perfil no válido.");
    let clave = String(claveNueva || "");
    if (generar) clave = generarClave_(); else validarClaveNueva_(clave);

    lock.waitLock(30000);
    const hoja = SpreadsheetApp.openById(APP_SPREADSHEET_ID).getSheetByName(HOJA_USUARIOS);
    const f = buscarFilaUsuario_(hoja, correo, rolN);
    if (!f) throw new Error("No se encontró el usuario.");
    hoja.getRange(f.fila, f.m[normalizarTexto_("Clave acceso")] + 1).setValue(hashClave_(clave));
    CacheService.getScriptCache().remove("INT_" + normalizarTexto_(correo) + "_" + rolN);
    CacheService.getScriptCache().remove("CK_" + normalizarTexto_(correo) + "_" + rolN);
    Logger.log("Clave restablecida por " + admin.correo + " para " + correo + " (" + rolN + ")");
    avisoCambioClave_(String(g_(f.datos, f.m, "Correo")), String(g_(f.datos, f.m, "Nombre")), "El administrador de Financiamiento actualizó la clave de acceso de su perfil.");
    return { success: true, clave: generar ? clave : "", mensaje: "Clave actualizada." };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// El administrador entra al panel de otro perfil sin necesitar su clave. Queda identificado como «(administrador)».
function ingresarComoPerfil(token, correo, rol) {
  try {
    const admin = sesion_(token, ["ADMIN"]);
    if (admin.via) throw new Error("Vuelva primero a su perfil de administrador.");
    const rolN = rolNorm_(rol);
    if (!PERFILES[rolN] || rolN === "ADMIN") throw new Error("Perfil no válido.");
    const hoja = SpreadsheetApp.openById(APP_SPREADSHEET_ID).getSheetByName(HOJA_USUARIOS);
    const f = buscarFilaUsuario_(hoja, correo, rolN);
    if (!f) throw new Error("No se encontró el usuario.");
    if (up_(g_(f.datos, f.m, "Estado")) !== "ACTIVO") throw new Error("El usuario está inactivo.");
    const usuario = {
      correo: admin.correo,
      nombre: String(g_(f.datos, f.m, "Nombre") || PERFILES[rolN].area) + " (administrador)",
      rol: rolN,
      area: String(g_(f.datos, f.m, "Área") || PERFILES[rolN].area),
      via: admin.correo
    };
    const nuevo = Utilities.getUuid() + Utilities.getUuid();
    CacheService.getScriptCache().put("SES_" + nuevo, JSON.stringify(usuario), SESION_SEGUNDOS);
    Logger.log("Ingreso como perfil " + rolN + " por " + admin.correo);
    return { success: true, token: nuevo, correo: usuario.correo, nombre: usuario.nombre, rol: rolN, area: usuario.area };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function sesion_(token, rolesPermitidos) {
  if (!token) throw new Error("Sesión no válida. Ingrese nuevamente.");
  const raw = CacheService.getScriptCache().get("SES_" + token);
  if (!raw) throw new Error("Su sesión expiró. Ingrese nuevamente.");
  const u = JSON.parse(raw);
  if (rolesPermitidos && rolesPermitidos.indexOf(u.rol) < 0) throw new Error("No tiene permisos para esta acción.");
  return u;
}

/*************************************************
 * NUEVA SOLICITUD (público)
 *************************************************/

function guardarSolicitudFormulario(payload) {
  const lock = LockService.getScriptLock();
  try {
    validarPayloadFormulario_(payload);
    lock.waitLock(30000);

    const ss = SpreadsheetApp.openById(APP_SPREADSHEET_ID);
    if (!ss.getSheetByName(HOJA_PERIODOS) || !ss.getSheetByName(HOJA_HISTORIAL)) crearEstructuraAplicativo();

    const per = periodoActivo_(ss);
    if (!per) throw new Error("En este momento no se están recibiendo solicitudes. Comuníquese con Financiamiento Estudiantil.");
    const hoja = obtenerHojaPeriodo_(ss, per.hoja);
    const enc = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
    const m = mapaCols_(enc);

    const fecha = new Date();
    const radicado = generarRadicado_(ss, "DEV");
    const carpeta = crearCarpetaRadicado_(radicado, payload.documentoEstudiante, payload.nombreEstudiante);
    const archivoPdf = guardarArchivoPdf_(carpeta, payload.archivo, radicado + " - SOPORTES DEVOLUCION.pdf");

    const fila = new Array(enc.length).fill("");
    const set = function(c, v) { s_(fila, m, c, v); };

    set("Radicado", radicado);
    set("Tipo solicitud", "ESTUDIANTE");
    set("Periodo recepción", per.periodo);
    set("Fecha solicitud", fecha);
    set("Hora solicitud", Utilities.formatDate(fecha, Session.getScriptTimeZone(), "HH:mm:ss"));
    set("Estado actual", "RECIBIDA");
    set("Etapa actual", "FINANCIAMIENTO");
    set("Responsable actual", "FINANCIAMIENTO");
    set("Última actualización", fecha);
    set("Documento estudiante", String(payload.documentoEstudiante).trim());
    set("Nombre estudiante", String(payload.nombreEstudiante).trim());
    set("Correo estudiante", String(payload.correoEstudiante).trim());
    set("Celular estudiante", String(payload.celularEstudiante).trim());
    set("Programa", payload.programa);
    set("Modalidad", payload.modalidad);
    set("Nivel", payload.nivel);
    set("Periodo", payload.periodo);
    set("Motivo solicitud", payload.motivo);
    set("Descripción solicitud", String(payload.descripcion).trim());
    set("Soporte PDF", archivoPdf.getUrl());
    set("Carpeta Drive", carpeta.getUrl());
    set("Certificación bancaria incluida", "PENDIENTE VALIDAR");
    set("Documento identidad incluido", "PENDIENTE VALIDAR");
    set("Carta solicitud incluida", "PENDIENTE VALIDAR");
    set("Soporte pago incluido", "PENDIENTE VALIDAR");
    set("Revisado por Financiamiento", "NO");
    set("Artículo aplicado", "Caso en revisión");
    set("Estado Jefatura", "PENDIENTE");
    set("Estado Cartera", "PENDIENTE");
    set("Estado Control Interno", "PENDIENTE");
    set("Estado Tesorería", "PENDIENTE");
    set("Estado final", "EN PROCESO");
    set("Días en proceso", 0);
    set("Observación pública", "Su solicitud fue recibida para estudio. Esto no implica aceptación.");

    const nuevaFila = hoja.getLastRow() + 1;
    ["Documento estudiante", "Celular estudiante", "Hora solicitud"].forEach(function(c) {
      hoja.getRange(nuevaFila, m[normalizarTexto_(c)] + 1).setNumberFormat("@");
    });
    hoja.getRange(nuevaFila, 1, 1, fila.length).clearDataValidations();
    hoja.getRange(nuevaFila, 1, 1, fila.length).setValues([fila]);

    registrarHistorial_({
      ss: ss, radicado: radicado, usuario: "Formulario público", rol: "ESTUDIANTE", accion: "Radicación de solicitud",
      estadoNuevo: "RECIBIDA", etapaNueva: "FINANCIAMIENTO", responsableNuevo: "FINANCIAMIENTO",
      observacion: "Solicitud recibida desde el aplicativo web."
    });

    try {
      enviarCorreoRadicadoEstudiante_(payload, radicado);
      enviarCorreoAlertaAdmin_(payload, radicado);
    } catch (errCorreo) {
      Logger.log("Correo no enviado: " + errCorreo.message);
    }

    return { success: true, radicado: radicado };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function validarPayloadFormulario_(p) {
  if (!p) throw new Error("No se recibió información del formulario.");

  const obligatorios = [
    ["nombreEstudiante", "Nombre del estudiante"], ["documentoEstudiante", "Documento del estudiante"],
    ["correoEstudiante", "Correo del estudiante"], ["celularEstudiante", "Celular del estudiante"],
    ["nivel", "Nivel"], ["modalidad", "Modalidad"], ["programa", "Programa"], ["periodo", "Periodo"],
    ["motivo", "Motivo de la solicitud"], ["descripcion", "Descripción de la solicitud"]
  ];
  obligatorios.forEach(function(item) {
    if (!p[item[0]] || !String(p[item[0]]).trim()) throw new Error("Falta el campo obligatorio: " + item[1]);
  });

  if (String(p.nombreEstudiante).trim().length < 5 || String(p.nombreEstudiante).length > 120) throw new Error("El nombre no es válido.");
  if (!/^[0-9]{6,15}$/.test(String(p.documentoEstudiante).trim())) throw new Error("El documento debe tener solo números (mínimo 6 dígitos).");
  if (!/^[0-9]{10}$/.test(String(p.celularEstudiante).trim())) throw new Error("El celular debe tener 10 dígitos.");
  if (!validarCorreo_(p.correoEstudiante)) throw new Error("El correo electrónico no tiene un formato válido.");
  const per = normalizarPeriodo_(p.periodo);
  if (!per) throw new Error("El periodo no es válido. Ejemplos: 2026-1, 20261, 2026.1 o 2026 1.");
  p.periodo = per;
  if (String(p.descripcion).trim().length < 20 || String(p.descripcion).length > 3000) throw new Error("La descripción debe tener entre 20 y 3000 caracteres.");
  validarArchivoPdf_(p.archivo);
}

function validarArchivoPdf_(archivo) {
  if (!archivo || !archivo.base64) throw new Error("Debe adjuntar un único archivo PDF con todos los soportes.");
  if (String(archivo.base64).indexOf("data:application/pdf") !== 0) throw new Error("El archivo debe estar en formato PDF.");
  if (archivo.base64.length * 0.75 > MAX_PDF_BYTES * 1.05) throw new Error("El PDF no debe superar 90 MB.");
}

function generarRadicado_(ss, prefijo) {
  const anio = new Date().getFullYear();
  const re = new RegExp("^" + prefijo + "-" + anio + "-(\\d+)$");
  let max = 0;
  const nombres = leerPeriodos_(ss).map(function(p) { return p.hoja; });
  if (nombres.indexOf(HOJA_SOLICITUDES) < 0) nombres.push(HOJA_SOLICITUDES);
  nombres.forEach(function(n) {
    const hoja = ss.getSheetByName(n);
    if (!hoja || hoja.getLastRow() < 2) return;
    const idx = mapaCols_(hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0])[normalizarTexto_("Radicado")];
    if (idx === undefined) return;
    hoja.getRange(2, idx + 1, hoja.getLastRow() - 1, 1).getValues().forEach(function(r) {
      const x = re.exec(String(r[0]).trim());
      if (x) max = Math.max(max, Number(x[1]));
    });
  });
  const clave = prefijo === "DEV" ? "RAD_" + anio : "RAD_" + prefijo + "_" + anio;
  const n = siguienteConsecutivo_(clave, max);
  return prefijo + "-" + anio + "-" + String(n).padStart(4, "0");
}

function siguienteConsecutivo_(clave, minimo) {
  const props = PropertiesService.getScriptProperties();
  let n = Number(props.getProperty(clave) || 0);
  if (n < minimo) n = minimo;
  n++;
  props.setProperty(clave, String(n));
  return n;
}

/*************************************************
 * CONSULTA PÚBLICA Y SUBSANACIÓN
 *************************************************/

function consultarEstadoPublico(valor) {
  try {
    const q = String(valor || "").trim();
    if (!q) throw new Error("Digite su número de radicado o de documento.");

    const esRadicado = /[a-zA-Z]/.test(q);
    const doc = q.replace(/\D/g, "");
    if (!esRadicado && doc.length < 6) throw new Error("Digite un radicado (ej: DEV-2026-0001) o un número de documento válido.");

    const clave = esRadicado ? normalizarTexto_(q) : doc;
    const cache = CacheService.getScriptCache();
    const keyFallos = "CONS_" + clave;
    const fallos = Number(cache.get(keyFallos) || 0);
    if (fallos >= 8) throw new Error("Demasiados intentos. Espere unos minutos e intente de nuevo.");

    const ctx = leerSolicitudes_();
    const encontrados = [];
    ctx.filas.forEach(function(f) {
      const rad = String(g_(f, ctx.m, "Radicado")).trim();
      if (!rad) return;
      const coincide = esRadicado
        ? normalizarTexto_(rad) === clave
        : String(g_(f, ctx.m, "Documento estudiante")).replace(/\D/g, "") === doc;
      if (coincide) encontrados.push(f);
    });

    if (!encontrados.length) {
      cache.put(keyFallos, String(fallos + 1), 600);
      return { success: false, error: "No encontramos solicitudes con ese radicado o documento." };
    }

    cache.remove(keyFallos);
    encontrados.sort(function(a, b) {
      return String(g_(b, ctx.m, "Radicado")).localeCompare(String(g_(a, ctx.m, "Radicado")));
    });

    const resultados = encontrados.map(function(f) {
      const estado = String(g_(f, ctx.m, "Estado actual"));
      const etapa = String(g_(f, ctx.m, "Etapa actual"));
      return {
        radicado: String(g_(f, ctx.m, "Radicado")),
        nombre: nombreEnmascarado_(g_(f, ctx.m, "Nombre estudiante")),
        programa: String(g_(f, ctx.m, "Programa")),
        periodo: periodoTexto_(g_(f, ctx.m, "Periodo")),
        fechaSolicitud: formatearFecha_(g_(f, ctx.m, "Fecha solicitud")),
        estado: estadoPublico_(estado),
        etapa: etapa,
        ultimaActualizacion: formatearFecha_(g_(f, ctx.m, "Última actualización")),
        observacionPublica: String(g_(f, ctx.m, "Observación pública") || "Su solicitud se encuentra en trámite."),
        seguimiento: construirSeguimientoPublico_(estado, etapa, f, ctx.m),
        permiteSubsanar: up_(estado) === "PENDIENTE SUBSANACIÓN"
      };
    });

    return JSON.parse(JSON.stringify({ success: true, criterio: esRadicado ? "RADICADO" : "DOCUMENTO", documento: esRadicado ? "" : doc, resultados: resultados }));
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Evita exponer el nombre completo en la consulta pública.
function nombreEnmascarado_(nombre) {
  return String(nombre || "").trim().split(/\s+/).map(function(t, i) {
    return i === 0 ? t : t.charAt(0) + "***";
  }).join(" ");
}

function estadoPublico_(estado) {
  const e = up_(estado);
  if (e.indexOf("DEVUELTA POR") === 0 || e === "APROBADA FINANCIAMIENTO") return "EN REVISIÓN FINANCIAMIENTO";
  return e;
}

function construirSeguimientoPublico_(estado, etapa, fila, m) {
  const est = up_(estado);
  const idxActual = ETAPAS.indexOf(up_(etapa) === "TESORERIA" ? "TESORERÍA" : up_(etapa));
  const rechazada = est.indexOf("RECHAZADA") === 0;
  const finalizada = est === "FINALIZADA" || est === "PAGO REALIZADO";
  const colFecha = ["Fecha solicitud", "Fecha envío Jefatura", "Fecha envío Cartera", "Fecha envío Control Interno", "Fecha envío Tesorería", "Fecha pago"];

  return ETAPAS.map(function(nombre, index) {
    let e = "PENDIENTE";
    if (rechazada) {
      e = index === 0 ? "NO APROBADA" : "NO APLICA";
    } else if (finalizada) {
      e = "ACEPTADO";
    } else if (est === "PENDIENTE SUBSANACIÓN" && index === 0) {
      e = "REQUIERE SUBSANACIÓN";
    } else if (idxActual === -1) {
      e = index === 0 ? "EN TRÁMITE" : "PENDIENTE";
    } else if (index < idxActual) {
      e = "ACEPTADO";
    } else if (index === idxActual) {
      e = "EN TRÁMITE";
    }
    const mostrarFecha = e === "ACEPTADO" || e === "EN TRÁMITE" || e === "REQUIERE SUBSANACIÓN" || e === "NO APROBADA";
    return { etapa: nombre, estado: e, fecha: mostrarFecha ? formatearFecha_(g_(fila, m, colFecha[index])) : "" };
  });
}

function subsanarSolicitud(data) {
  const lock = LockService.getScriptLock();
  try {
    if (!data || !data.radicado || !data.documento) throw new Error("Faltan datos de la solicitud.");
    validarArchivoPdf_(data.archivo);
    lock.waitLock(30000);

    const ctx = leerSolicitudes_();
    const rad = normalizarTexto_(data.radicado);
    const doc = String(data.documento).replace(/\D/g, "");
    let pos = -1;

    for (let i = 0; i < ctx.filas.length; i++) {
      if (normalizarTexto_(g_(ctx.filas[i], ctx.m, "Radicado")) === rad &&
          String(g_(ctx.filas[i], ctx.m, "Documento estudiante")).replace(/\D/g, "") === doc) { pos = i; break; }
    }
    if (pos < 0) throw new Error("No encontramos una solicitud con esos datos.");

    const fila = ctx.filas[pos].slice();
    const m = ctx.m;
    if (up_(g_(fila, m, "Estado actual")) !== "PENDIENTE SUBSANACIÓN") throw new Error("Esta solicitud no tiene una subsanación pendiente.");

    const radicado = String(g_(fila, m, "Radicado"));
    const carpeta = obtenerCarpetaPorUrl_(g_(fila, m, "Carpeta Drive")) || DriveApp.getFolderById(APP_FOLDER_ID);
    const fecha = new Date();
    const sello = Utilities.formatDate(fecha, Session.getScriptTimeZone(), "yyyyMMdd-HHmm");
    const nuevo = guardarArchivoPdf_(carpeta, data.archivo, radicado + " - SUBSANACION " + sello + ".pdf");

    const anteriorUrl = g_(fila, m, "Soporte PDF");
    const estadoAnt = g_(fila, m, "Estado actual");
    const etapaAnt = g_(fila, m, "Etapa actual");
    const respAnt = g_(fila, m, "Responsable actual");

    s_(fila, m, "Soporte PDF", nuevo.getUrl());
    s_(fila, m, "Estado actual", "EN REVISIÓN FINANCIAMIENTO");
    s_(fila, m, "Etapa actual", "FINANCIAMIENTO");
    s_(fila, m, "Responsable actual", "FINANCIAMIENTO");
    s_(fila, m, "Fecha subsanación", fecha);
    s_(fila, m, "Comentario subsanación", String(data.comentario || "").trim().slice(0, 1000));
    s_(fila, m, "Observación pública", "Recibimos su subsanación. Su solicitud continúa en revisión.");
    s_(fila, m, "Última actualización", fecha);
    escribirFila_(ctx, pos, fila);

    registrarHistorial_({
      ss: ctx.ss, radicado: radicado, usuario: "Estudiante", rol: "ESTUDIANTE", accion: "Subsanación recibida",
      estadoAnterior: estadoAnt, estadoNuevo: "EN REVISIÓN FINANCIAMIENTO", etapaAnterior: etapaAnt, etapaNueva: "FINANCIAMIENTO",
      responsableAnterior: respAnt, responsableNuevo: "FINANCIAMIENTO",
      observacion: "Nuevo PDF cargado. PDF anterior: " + anteriorUrl + ". " + String(data.comentario || "").slice(0, 300)
    });

    try {
      notificarCambios_([{
        radicado: radicado, nuevoEstado: "DEVUELTA POR JEFATURA", etiquetaEstado: "SUBSANACIÓN RECIBIDA",
        nombre: g_(fila, m, "Nombre estudiante"), programa: g_(fila, m, "Programa"), observacion: "El estudiante cargó la subsanación."
      }]);
    } catch (e) { Logger.log(e.message); }

    return { success: true, mensaje: "Recibimos su subsanación. Su solicitud volvió a revisión." };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/*************************************************
 * PROGRAMAS DINÁMICOS
 *************************************************/

function obtenerProgramasDisponibles() {
  const ss = SpreadsheetApp.openById(APP_SPREADSHEET_ID);
  const hoja = ss.getSheetByName(HOJA_PROGRAMAS);
  if (!hoja) throw new Error("No existe la hoja Programas.");

  const datos = hoja.getDataRange().getValues();
  const resultado = {
    "Pregrado|Presencial": [], "Pregrado|Virtual": [], "Pregrado|A distancia": [],
    "Posgrado|Presencial": [], "Posgrado|Virtual": [], "Posgrado|A distancia": []
  };
  if (datos.length <= 1) return resultado;

  const encabezados = datos[0];
  for (let col = 0; col < encabezados.length; col++) {
    const clave = obtenerClaveProgramaDesdeEncabezado_(String(encabezados[col] || "").trim());
    if (!clave) continue;
    for (let fila = 1; fila < datos.length; fila++) {
      const programa = String(datos[fila][col] || "").trim();
      if (programa && resultado[clave].indexOf(programa) < 0) resultado[clave].push(programa);
    }
  }
  Object.keys(resultado).forEach(function(k) { resultado[k].sort(); });
  return resultado;
}

function obtenerClaveProgramaDesdeEncabezado_(encabezado) {
  const t = normalizarTexto_(encabezado);
  if (!t) return "";
  const nivel = t.indexOf("pregrado") >= 0 ? "Pregrado" : (t.indexOf("especializacion") >= 0 || t.indexOf("maestria") >= 0 ? "Posgrado" : "");
  const modalidad = t.indexOf("presencial") >= 0 ? "Presencial" : (t.indexOf("virtual") >= 0 ? "Virtual" : (t.indexOf("distancia") >= 0 ? "A distancia" : ""));
  return nivel && modalidad ? nivel + "|" + modalidad : "";
}

/*************************************************
 * PANEL INTERNO
 *************************************************/

function obtenerPanel(token) {
  try {
    const u = sesion_(token);
    const ctx = leerSolicitudes_();
    const hoy = new Date();

    const lista = [];
    ctx.filas.forEach(function(f) {
      if (!String(g_(f, ctx.m, "Radicado")).trim()) return;
      if (u.rol === "ICETEX" && up_(g_(f, ctx.m, "Tipo solicitud")) !== "ICETEX") return;
      const o = objetoSolicitud_(ctx, f, hoy);
      o._cat = clasificar_(u.rol, o);
      lista.push(o);
    });
    lista.sort(function(a, b) { return String(b["Radicado"]).localeCompare(String(a["Radicado"])); });

    return {
      success: true,
      usuario: { correo: u.correo, nombre: u.nombre, rol: u.rol, area: u.area },
      solicitudes: lista,
      resumen: crearResumenPanel_(lista, u.rol),
      lotes: leerLotes_(),
      periodos: u.rol === "ADMIN" ? ctx.periodos.map(function(p) { return { periodo: p.periodo, estado: p.estado, hoja: p.hoja }; }) : [],
      periodoActivo: ctx.activo ? { periodo: ctx.activo.periodo, hoja: ctx.activo.hoja, hasta: fechaCorta_(ctx.activo.hasta), vencido: ctx.activo.hasta instanceof Date && hoy > new Date(ctx.activo.hasta.getTime() + 86399000) } : null
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function esFinal_(estado) {
  const e = up_(estado);
  return e === "FINALIZADA" || e === "PAGO REALIZADO" || e.indexOf("RECHAZADA") === 0;
}

function clasificar_(rol, s) {
  const estado = up_(s["Estado actual"]);
  if (rol === "ICETEX") {
    if (estado === "PAGO REALIZADO" || estado === "FINALIZADA") return ["APROBADO"];
    if (estado.indexOf("RECHAZADA") === 0) return ["RECHAZADO"];
    return normalizarTexto_(s["Etapa actual"]) === "icetex" ? ["PENDIENTE", "CORREGIR"] : ["PENDIENTE"];
  }
  const etapa = normalizarTexto_(s["Etapa actual"]);
  const cfg = PERFILES[rol];
  const cat = [];

  const pendiente = etapa === normalizarTexto_(cfg.etapa) && !esFinal_(estado);
  if (pendiente) cat.push("PENDIENTE");

  let aprobado = false;
  if (rol === "ADMIN") aprobado = up_(s["Decisión Financiamiento"]) === "APROBADA";
  if (rol === "JEFATURA") aprobado = up_(s["Estado Jefatura"]) === "APROBADA";
  if (rol === "CARTERA") aprobado = up_(s["Estado Cartera"]) === "APROBADA";
  if (rol === "CONTROL_INTERNO") aprobado = up_(s["Estado Control Interno"]) === "APROBADA";
  if (rol === "TESORERIA") aprobado = up_(s["Estado Tesorería"]) === "PAGO REALIZADO";
  if (aprobado && !pendiente) cat.push("APROBADO");

  let rechazado = false;
  if (rol === "ADMIN") rechazado = estado.indexOf("RECHAZADA") === 0;
  if (rol === "JEFATURA") rechazado = up_(s["Estado Jefatura"]) === "DEVUELTA CON NOVEDAD";
  if (rol === "CARTERA") rechazado = up_(s["Estado Cartera"]) === "DEVUELTA CON NOVEDAD";
  if (rol === "CONTROL_INTERNO") rechazado = up_(s["Estado Control Interno"]) === "DEVUELTA CON NOVEDAD";
  if (rol === "TESORERIA") rechazado = up_(s["Estado Tesorería"]) === "DEVUELTA CON NOVEDAD";
  if (rechazado && !pendiente) cat.push("RECHAZADO");

  return cat;
}

function crearResumenPanel_(lista, rol) {
  const r = { total: lista.length, pendientes: 0, aprobados: 0, rechazados: 0 };
  const admin = rol === "ADMIN";
  if (admin) { r.valorSolicitado = 0; r.valorAprobado = 0; r.valorPagado = 0; r.porEtapa = {}; }

  lista.forEach(function(s) {
    if (s._cat.indexOf("PENDIENTE") >= 0) r.pendientes++;
    if (s._cat.indexOf("APROBADO") >= 0) r.aprobados++;
    if (s._cat.indexOf("RECHAZADO") >= 0) r.rechazados++;
    if (!admin) return;
    r.valorSolicitado += numeroSeguro_(s["Valor solicitado"]);
    if (up_(s["Decisión Financiamiento"]) === "APROBADA") r.valorAprobado += numeroSeguro_(s["Valor aprobado"]);
    if (up_(s["Estado actual"]) === "PAGO REALIZADO" || up_(s["Estado actual"]) === "FINALIZADA") r.valorPagado += numeroSeguro_(s["Valor aprobado"]);
    const e = up_(s["Etapa actual"]) || "SIN ETAPA";
    r.porEtapa[e] = (r.porEtapa[e] || 0) + 1;
  });
  return r;
}

function leerLotes_() {
  const ss = SpreadsheetApp.openById(APP_SPREADSHEET_ID);
  const hoja = ss.getSheetByName(HOJA_PAQUETES);
  if (!hoja || hoja.getLastRow() < 2) return [];
  const tz = Session.getScriptTimeZone();
  const datos = hoja.getDataRange().getValues();
  const enc = datos[0];
  const out = [];
  for (let i = datos.length - 1; i >= 1 && out.length < 100; i--) {
    const o = {};
    enc.forEach(function(h, j) {
      let v = datos[i][j];
      if (v instanceof Date) v = Utilities.formatDate(v, tz, "dd/MM/yyyy HH:mm");
      o[h] = v === null || v === undefined ? "" : String(v);
    });
    out.push(o);
  }
  return out;
}

function obtenerHistorial(token, radicado) {
  try {
    sesion_(token);
    const ss = SpreadsheetApp.openById(APP_SPREADSHEET_ID);
    const hoja = ss.getSheetByName(HOJA_HISTORIAL);
    const out = [];
    if (hoja && hoja.getLastRow() > 1) {
      const tz = Session.getScriptTimeZone();
      const datos = hoja.getDataRange().getValues();
      const enc = datos[0];
      const idxRad = enc.map(normalizarTexto_).indexOf("radicado");
      for (let i = 1; i < datos.length; i++) {
        if (String(datos[i][idxRad]).trim() !== String(radicado).trim()) continue;
        const o = {};
        enc.forEach(function(h, j) {
          let v = datos[i][j];
          if (v instanceof Date) v = Utilities.formatDate(v, tz, h === "Hora" ? "HH:mm:ss" : "dd/MM/yyyy");
          o[h] = v === null || v === undefined ? "" : String(v);
        });
        out.push(o);
      }
    }
    return { success: true, historial: out };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Los PDFs permanecen privados en Drive; se entregan solo a usuarios con sesión activa.
function obtenerArchivo(token, radicado, tipo) {
  try {
    sesion_(token);
    const ctx = leerSolicitudes_();
    const pos = buscarPos_(ctx, radicado);
    if (pos < 0) throw new Error("No se encontró el radicado.");
    const t = up_(tipo);
    const col = t === "FICHA" ? "Ficha interna" : (t === "ESTADO_CUENTA" ? "Estado de cuenta PDF" : (t === "CALCULO_ICETEX" ? "Cálculo devolución ICETEX" : (t === "COMPROBANTE_PAGO" ? "Comprobante pago" : "Soporte PDF")));
    const url = g_(ctx.filas[pos], ctx.m, col);
    if (!url) throw new Error("Este documento aún no está disponible.");
    const archivo = archivoPorUrl_(url);
    if (!archivo) throw new Error("No se pudo abrir el archivo en Drive.");
    const blob = archivo.getBlob();
    return { success: true, nombre: archivo.getName(), base64: Utilities.base64Encode(blob.getBytes()), mime: blob.getContentType() };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/*************************************************
 * ACCIONES (individuales y por lote)
 *************************************************/

function procesarAcciones(token, payload) {
  const lock = LockService.getScriptLock();
  try {
    const u = sesion_(token);
    if (!payload || !payload.accion || !payload.radicados || !payload.radicados.length) throw new Error("No se recibió la información completa de la acción.");
    if (payload.radicados.length > 100) throw new Error("Máximo 100 solicitudes por operación.");

    const accion = up_(payload.accion);
    if ((ACCIONES_POR_ROL[u.rol] || []).indexOf(accion) < 0) throw new Error("La acción no está permitida para este perfil.");

    lock.waitLock(30000);

    const ctx = leerSolicitudes_();
    const resultados = [];
    const notifs = [];
    const historial = [];
    const paquetesTocados = {};
    const exitosos = [];
    let valorLote = 0;

    const esLote = accion === "ENVIAR_JEFATURA" && up_(payload.modoEnvio) === "LOTE";
    const numLote = esLote ? generarNumeroLote_() : "";

    payload.radicados.forEach(function(rad) {
      try {
        const r = ejecutarAccionFila_(ctx, u, accion, rad, payload, numLote);
        resultados.push({ radicado: rad, ok: true, mensaje: r.mensaje });
        notifs.push(r.notif);
        historial.push(r.historial);
        exitosos.push(rad);
        valorLote += r.valorAprobado || 0;
        if (r.paquete) paquetesTocados[r.paquete] = true;
      } catch (e) {
        resultados.push({ radicado: rad, ok: false, mensaje: e.message });
      }
    });

    if (historial.length) registrarHistorialLote_(ctx.ss, historial);

    if (esLote && exitosos.length) {
      const hojaP = obtenerOCrearHoja_(ctx.ss, HOJA_PAQUETES);
      if (hojaP.getLastRow() < 1) prepararHojaPaquetes_(ctx.ss);
      const ahora = new Date();
      hojaP.appendRow([numLote, ahora, u.correo, exitosos.length, valorLote, "ENVIADO A JEFATURA", ahora, "", "", exitosos.join(", "), "", ""]);
    }

    Object.keys(paquetesTocados).forEach(function(n) { actualizarEstadoPaquete_(ctx, n); });

    try { notificarCambios_(notifs, numLote); } catch (e) { Logger.log("Notificaciones: " + e.message); }

    const ok = resultados.filter(function(r) { return r.ok; }).length;
    return { success: true, resultados: resultados, ok: ok, fallidas: resultados.length - ok, lote: esLote && exitosos.length ? numLote : "" };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function ejecutarAccionFila_(ctx, u, accion, rad, p, numLote) {
  const pos = buscarPos_(ctx, rad);
  if (pos < 0) throw new Error("No se encontró el radicado.");

  const m = ctx.m;
  const fila = ctx.filas[pos].slice();
  const ahora = new Date();
  const rol = u.rol;
  const obs = String(p.observacion || "").trim();
  const d = (p.datos && p.datos[rad]) || {};
  const set = function(c, v) { s_(fila, m, c, v); };
  const get = function(c) { return g_(fila, m, c); };

  const estadoAnt = String(get("Estado actual"));
  const etapaAnt = String(get("Etapa actual"));
  const respAnt = String(get("Responsable actual"));
  const estadoN = up_(estadoAnt);

  if (normalizarTexto_(etapaAnt) !== normalizarTexto_(PERFILES[rol].etapa)) {
    throw new Error("La solicitud no está en su etapa (actualmente: " + etapaAnt + ").");
  }

  let nuevoEstado = estadoAnt, nuevaEtapa = etapaAnt, nuevoResp = respAnt, texto = "";
  let valorAprobado = 0, ficha = false, paquete = "", reenvio = false;

  if (rol === "ADMIN") {
    if (accion === "APROBAR_FINANCIAMIENTO") {
      if (estadoN === "PENDIENTE SUBSANACIÓN") throw new Error("Está pendiente de subsanación del estudiante.");
      if (estadoN === "APROBADA FINANCIAMIENTO") throw new Error("Ya está aprobada; envíela a Jefatura de Financiamiento o edite el expediente.");

      const valor = numeroSeguro_(d.valorSolicitado || get("Valor solicitado"));
      const devolver = String(d.devolverA || get("Devolver a") || "").trim();
      if (!valor || valor <= 0) throw new Error("Debe registrar el valor solicitado.");
      if (!devolver) throw new Error("Debe indicar a quién se devuelve.");

      const porcentaje = numeroSeguro_(d.porcentaje || get("Porcentaje devolución")) || 100;
      const aprobado = numeroSeguro_(d.valorAprobado) || numeroSeguro_(get("Valor aprobado")) || Math.round(valor * porcentaje / 100);
      let articulo = String(d.articulo || "").trim();
      if (!articulo) articulo = String(get("Artículo aplicado") || "");

      set("Valor solicitado", valor);
      set("Devolver a", devolver);
      set("Porcentaje devolución", porcentaje);
      set("Valor aprobado", aprobado);
      set("Artículo aplicado", articulo);
      set("Revisado por Financiamiento", "SÍ");
      set("Fecha revisión Financiamiento", ahora);
      set("Decisión Financiamiento", "APROBADA");
      const v = d.verif || {};
      [["Carta solicitud incluida", v.carta], ["Documento identidad incluido", v.identidad], ["Soporte pago incluido", v.pago], ["Certificación bancaria incluida", v.banco]].forEach(function(x) {
        const n = up_(x[1]);
        if (n === "OK" || n === "NO") set(x[0], n);
      });
      set("Observación Financiamiento", obs);

      nuevoEstado = "APROBADA FINANCIAMIENTO";
      nuevaEtapa = "FINANCIAMIENTO";
      nuevoResp = "FINANCIAMIENTO";
      texto = "Aprobada por Financiamiento (lista para enviar a Jefatura de Financiamiento)";
      valorAprobado = aprobado;
      ficha = true;
    } else if (accion === "ENVIAR_JEFATURA") {
      if (estadoN !== "APROBADA FINANCIAMIENTO") throw new Error("Debe estar aprobada por Financiamiento antes de enviarla a Jefatura de Financiamiento.");
      set("Fecha envío Jefatura", ahora);
      set("Estado Jefatura", "PENDIENTE");
      set("Fecha respuesta Jefatura", "");
      set("Observación Jefatura", "");
      set("Estado Cartera", "PENDIENTE");
      set("Fecha respuesta Cartera", "");
      set("Estado Control Interno", "PENDIENTE");
      set("Fecha respuesta Control Interno", "");
      set("Estado Tesorería", "PENDIENTE");
      set("Número paquete", numLote || "");
      set("Firma Jefatura", "");

      nuevoEstado = "ENVIADA A JEFATURA";
      nuevaEtapa = "JEFATURA FINANCIAMIENTO";
      nuevoResp = "JEFATURA FINANCIAMIENTO";
      texto = numLote ? "Enviada a Jefatura de Financiamiento en el lote " + numLote : "Enviada a Jefatura de Financiamiento (envío individual)";
      valorAprobado = numeroSeguro_(get("Valor aprobado"));
    } else if (accion === "REENVIAR_CARTERA") {
      if (estadoN !== "DEVUELTA POR CARTERA") throw new Error("Solo se puede reenviar a Cartera una solicitud devuelta por Cartera.");
      reenviarACartera_(set, get, ahora, obs);
      nuevoEstado = "ENVIADA A CARTERA";
      nuevaEtapa = "CARTERA";
      nuevoResp = "CARTERA";
      texto = "Corregida por Financiamiento y reenviada directamente a Cartera (sin pasar por Jefatura de Financiamiento)";
      reenvio = true;
    } else if (accion === "SUBSANACION") {
      if (!obs) throw new Error("Debe registrar la observación para el estudiante.");
      set("Observación Financiamiento", obs);
      set("Observación pública", obs);
      nuevoEstado = "PENDIENTE SUBSANACIÓN";
      nuevaEtapa = "FINANCIAMIENTO";
      nuevoResp = "ESTUDIANTE";
      texto = "Solicitud enviada a subsanación";
    } else if (accion === "RECHAZAR_FINANCIAMIENTO") {
      if (!obs) throw new Error("Debe registrar el motivo del rechazo.");
      set("Revisado por Financiamiento", "SÍ");
      set("Fecha revisión Financiamiento", ahora);
      set("Decisión Financiamiento", "RECHAZADA");
      set("Observación Financiamiento", obs);
      set("Observación pública", obs);
      set("Estado final", "RECHAZADA");
      nuevoEstado = "RECHAZADA POR FINANCIAMIENTO";
      nuevaEtapa = "FINALIZADO";
      nuevoResp = "FINALIZADO";
      texto = "Solicitud rechazada por Financiamiento";
    }
  } else if (rol === "ICETEX") {
    if (accion !== "REENVIAR_JEFATURA") throw new Error("La acción no está permitida para este perfil.");
    if (up_(get("Tipo solicitud")) !== "ICETEX") throw new Error("Solo puede gestionar solicitudes ICETEX.");
    if (estadoN.indexOf("DEVUELTA POR") !== 0) throw new Error("La solicitud no está devuelta para corrección.");
    if (estadoN === "DEVUELTA POR CARTERA") {
      reenviarACartera_(set, get, ahora, "");
      nuevoEstado = "ENVIADA A CARTERA"; nuevaEtapa = "CARTERA"; nuevoResp = "CARTERA";
      texto = "Corregida por ICETEX y reenviada directamente a Cartera (sin pasar por Jefatura de Financiamiento)";
      reenvio = true;
    } else {
    set("Fecha envío Jefatura", ahora);
    set("Estado Jefatura", "PENDIENTE"); set("Fecha respuesta Jefatura", ""); set("Observación Jefatura", "");
    set("Estado Cartera", "PENDIENTE"); set("Fecha respuesta Cartera", "");
    set("Estado Control Interno", "PENDIENTE"); set("Fecha respuesta Control Interno", "");
    set("Estado Tesorería", "PENDIENTE");
    set("Número paquete", ""); set("Firma Jefatura", "");
    set("Última alerta plazo", "");
    nuevoEstado = "ENVIADA A JEFATURA"; nuevaEtapa = "JEFATURA FINANCIAMIENTO"; nuevoResp = "JEFATURA FINANCIAMIENTO";
    texto = "Corregida por ICETEX y reenviada a Jefatura de Financiamiento";
    valorAprobado = numeroSeguro_(get("Valor aprobado"));
    }
  } else if (FLUJO[rol]) {
    const cfg = FLUJO[rol];
    if (estadoN !== cfg.estadoEntrada) throw new Error("La solicitud no está pendiente en " + cfg.nombre + ".");
    paquete = rol === "JEFATURA" ? String(get("Número paquete") || "") : "";

    if (accion === "APROBAR") {
      if (rol === "CARTERA" && !String(get("Estado de cuenta PDF") || "").trim()) throw new Error("Cartera debe adjuntar el estado de cuenta del estudiante antes de aprobar.");
      set(cfg.colEstado, "APROBADA");
      set(cfg.colFechaResp, ahora);
      set(cfg.colObs, obs);
      set(cfg.siguiente.colFechaEnvio, ahora);
      set(cfg.siguiente.colEstado, "PENDIENTE");
      nuevoEstado = cfg.siguiente.estado;
      nuevaEtapa = cfg.siguiente.etapa;
      nuevoResp = cfg.siguiente.etapa;
      if (rol === "JEFATURA") set("Firma Jefatura", "Vo.Bo. " + (u.nombre || u.correo) + " " + formatearFecha_(ahora));
      texto = "Aprobada por " + cfg.nombre + " y enviada a " + cfg.siguiente.nombre;
    } else if (accion === "DEVOLVER") {
      if (!obs) throw new Error("Debe registrar la observación de la devolución.");
      set(cfg.colEstado, "DEVUELTA CON NOVEDAD");
      set(cfg.colFechaResp, ahora);
      set(cfg.colObs, obs);
      nuevoEstado = cfg.devuelta;
      nuevaEtapa = up_(get("Tipo solicitud")) === "ICETEX" ? "ICETEX" : "FINANCIAMIENTO";
      nuevoResp = nuevaEtapa;
      texto = "Devuelta por " + cfg.nombre + " con novedad";
    }
  } else if (rol === "TESORERIA") {
    const enTes = estadoN === "ENVIADA A TESORERÍA" || estadoN === "PAGO PROGRAMADO";
    if (!enTes) throw new Error("La solicitud no está pendiente en Tesorería.");

    if (accion === "PROGRAMAR_PAGO") {
      if (estadoN !== "ENVIADA A TESORERÍA") throw new Error("El pago ya fue programado.");
      set("Estado Tesorería", "PAGO PROGRAMADO");
      set("Fecha programación pago", ahora);
      set("Observación Tesorería", obs);
      set("Observación pública", "Tesorería programó el pago de su solicitud.");
      nuevoEstado = "PAGO PROGRAMADO";
      nuevaEtapa = "TESORERÍA";
      nuevoResp = "TESORERÍA";
      texto = "Pago programado por Tesorería";
    } else if (accion === "PAGO_REALIZADO") {
      if (!String(get("Comprobante pago") || "").trim()) throw new Error("Debe cargar el comprobante de pago (PDF) antes de marcar el pago como realizado.");
      set("Estado Tesorería", "PAGO REALIZADO");
      set("Fecha pago", ahora);
      set("Observación Tesorería", obs);
      set("Fecha notificación estudiante", ahora);
      set("Estado final", "FINALIZADA");
      set("Observación pública", "Su solicitud fue finalizada. El pago fue realizado por Tesorería y se envió el comprobante a su correo.");
      nuevoEstado = "PAGO REALIZADO";
      nuevaEtapa = "FINALIZADO";
      nuevoResp = "FINALIZADO";
      texto = "Pago realizado y solicitud finalizada";
    } else if (accion === "DEVOLVER") {
      if (!obs) throw new Error("Debe registrar la observación de la devolución.");
      set("Estado Tesorería", "DEVUELTA CON NOVEDAD");
      set("Observación Tesorería", obs);
      nuevoEstado = "DEVUELTA POR TESORERÍA";
      nuevaEtapa = up_(get("Tipo solicitud")) === "ICETEX" ? "ICETEX" : "FINANCIAMIENTO";
      nuevoResp = nuevaEtapa;
      texto = "Devuelta por Tesorería con novedad";
    }
  }

  if (!texto) throw new Error("La acción no está permitida para este perfil.");

  const colFunc = { ADMIN: "Funcionario Financiamiento", ICETEX: "Funcionario radica", JEFATURA: "Funcionario Jefatura", CARTERA: "Funcionario Cartera", CONTROL_INTERNO: "Funcionario Control Interno", TESORERIA: "Funcionario Tesorería" }[rol];
  if (colFunc) set(colFunc, u.nombre || u.correo);

  set("Estado actual", nuevoEstado);
  set("Etapa actual", nuevaEtapa);
  set("Responsable actual", nuevoResp);
  set("Última actualización", ahora);

  if (ficha) {
    try {
      const url = generarFichaInternaPDF_(rad, objetoSolicitud_(ctx, fila, ahora));
      if (url) set("Ficha interna", url);
    } catch (e) {
      Logger.log("Ficha no generada: " + e.message);
    }
  }

  escribirFila_(ctx, pos, fila);

  return {
    mensaje: texto,
    valorAprobado: valorAprobado,
    paquete: paquete,
    historial: {
      radicado: rad, usuario: u.correo, rol: rol, accion: texto, estadoAnterior: estadoAnt, estadoNuevo: nuevoEstado,
      etapaAnterior: etapaAnt, etapaNueva: nuevaEtapa, responsableAnterior: respAnt, responsableNuevo: nuevoResp, observacion: obs
    },
    notif: {
      radicado: rad, nuevoEstado: nuevoEstado, nuevaEtapa: nuevaEtapa, observacion: obs,
      nombre: String(get("Nombre estudiante")), documento: String(get("Documento estudiante")),
      correoEstudiante: String(get("Correo estudiante")), programa: String(get("Programa")),
      valor: numeroSeguro_(get("Valor aprobado")), lote: String(get("Número paquete") || ""), tipo: String(get("Tipo solicitud") || ""),
      comprobanteUrl: nuevoEstado === "PAGO REALIZADO" ? String(get("Comprobante pago") || "") : "",
      reenvio: reenvio
    }
  };
}

// Reenvío directo a Cartera tras una devolución de Cartera: NO vuelve a Jefatura de Financiamiento ni cambia el lote.
function reenviarACartera_(set, get, ahora, obs) {
  set("Estado Cartera", "PENDIENTE");
  set("Fecha envío Cartera", ahora);
  set("Fecha respuesta Cartera", "");
  set("Última alerta plazo", "");
  if (obs) set("Observación Financiamiento", obs);
}

function generarNumeroLote_() {
  const anio = new Date().getFullYear();
  const ss = SpreadsheetApp.openById(APP_SPREADSHEET_ID);
  const hoja = ss.getSheetByName(HOJA_PAQUETES);
  let max = 0;
  if (hoja && hoja.getLastRow() > 1) {
    const re = new RegExp("^LOTE-" + anio + "-(\\d+)$");
    hoja.getRange(2, 1, hoja.getLastRow() - 1, 1).getValues().forEach(function(r) {
      const x = re.exec(String(r[0]).trim());
      if (x) max = Math.max(max, Number(x[1]));
    });
  }
  const n = siguienteConsecutivo_("LOTE_" + anio, max);
  return "LOTE-" + anio + "-" + String(n).padStart(4, "0");
}

function actualizarEstadoPaquete_(ctx, numero) {
  const hojaP = ctx.ss.getSheetByName(HOJA_PAQUETES);
  if (!hojaP || hojaP.getLastRow() < 2) return;

  let total = 0, aprobadas = 0, devueltas = 0;
  ctx.filas.forEach(function(f) {
    if (String(g_(f, ctx.m, "Número paquete")).trim() !== numero) return;
    total++;
    const e = up_(g_(f, ctx.m, "Estado Jefatura"));
    if (e === "APROBADA") aprobadas++;
    if (e === "DEVUELTA CON NOVEDAD") devueltas++;
  });
  if (!total) return;

  let estado = "EN REVISIÓN JEFATURA";
  if (aprobadas === total) estado = "APROBADO POR JEFATURA";
  else if (aprobadas + devueltas === total) estado = "RESUELTO CON NOVEDADES";

  const col = hojaP.getRange(2, 1, hojaP.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < col.length; i++) {
    if (String(col[i][0]).trim() === numero) {
      hojaP.getRange(i + 2, 6).setValue(estado);
      if (estado !== "EN REVISIÓN JEFATURA") hojaP.getRange(i + 2, 8).setValue(new Date());
      break;
    }
  }
}

/*************************************************
 * EDICIÓN TOTAL DEL ADMINISTRADOR
 *************************************************/

function actualizarExpediente(token, radicado, cambios) {
  const lock = LockService.getScriptLock();
  try {
    const u = sesion_(token, ["ADMIN"]);
    if (!cambios || !Object.keys(cambios).length) throw new Error("No hay cambios para guardar.");
    lock.waitLock(30000);

    const ctx = leerSolicitudes_();
    const pos = buscarPos_(ctx, radicado);
    if (pos < 0) throw new Error("No se encontró el radicado " + radicado);

    const m = ctx.m;
    const fila = ctx.filas[pos].slice();
    const antesObj = objetoSolicitud_(ctx, fila, new Date());
    const diffs = [];
    let financiero = false;
    let cambioEtapa = false;

    Object.keys(cambios).forEach(function(campo) {
      if (EDITABLES_ADMIN.indexOf(campo) < 0) throw new Error("El campo \"" + campo + "\" no se puede editar.");
      let nuevo = cambios[campo];
      nuevo = nuevo === null || nuevo === undefined ? "" : String(nuevo).trim();

      if (campo === "Correo estudiante" && !validarCorreo_(nuevo)) throw new Error("El correo no es válido.");
      if (campo === "Periodo") { nuevo = normalizarPeriodo_(nuevo); if (!nuevo) throw new Error("El periodo no es válido. Ejemplo: 2026-1."); }
      if (campo === "Estado actual" && ESTADOS.indexOf(up_(nuevo)) < 0) throw new Error("Estado no válido.");
      if (campo === "Etapa actual" && ETAPAS.indexOf(up_(nuevo)) < 0) throw new Error("Etapa no válida.");
      if ((campo === "Valor solicitado" || campo === "Valor aprobado") && nuevo !== "" && numeroSeguro_(nuevo) < 0) throw new Error("Valor no válido.");

      const antes = campo === "Periodo" ? periodoTexto_(g_(fila, m, campo)) : String(g_(fila, m, campo));
      if (antes === nuevo) return;

      s_(fila, m, campo, (campo === "Valor solicitado" || campo === "Valor aprobado") && nuevo !== "" ? numeroSeguro_(nuevo) : nuevo);
      diffs.push(campo + ": " + antes + " -> " + nuevo);

      if (["Valor solicitado", "Devolver a", "Artículo aplicado", "Porcentaje devolución", "Valor aprobado"].indexOf(campo) >= 0) financiero = true;
      if (campo === "Etapa actual" || campo === "Estado actual") cambioEtapa = true;
    });

    if (!diffs.length) return { success: true, mensaje: "No había cambios nuevos." };

    const estadoAnt = String(g_(ctx.filas[pos], m, "Estado actual"));
    const etapaAnt = String(g_(ctx.filas[pos], m, "Etapa actual"));
    const respAnt = String(g_(ctx.filas[pos], m, "Responsable actual"));

    if (cambioEtapa) {
      const estNuevo = up_(g_(fila, m, "Estado actual"));
      s_(fila, m, "Responsable actual", estNuevo === "PENDIENTE SUBSANACIÓN" ? "ESTUDIANTE" : String(g_(fila, m, "Etapa actual")));
      if (estNuevo === "FINALIZADA" || estNuevo === "PAGO REALIZADO") s_(fila, m, "Estado final", "FINALIZADA");
      else if (estNuevo.indexOf("RECHAZADA") === 0) s_(fila, m, "Estado final", "RECHAZADA");
      else s_(fila, m, "Estado final", "EN PROCESO");
    }

    const ahora = new Date();
    s_(fila, m, "Última actualización", ahora);

    let fichaUrl = "";
    if (financiero) {
      try {
        fichaUrl = generarFichaInternaPDF_(radicado, objetoSolicitud_(ctx, fila, ahora)) || "";
        if (fichaUrl) s_(fila, m, "Ficha interna", fichaUrl);
      } catch (e) {
        Logger.log("Ficha no generada: " + e.message);
      }
    }

    escribirFila_(ctx, pos, fila);

    registrarHistorial_({
      ss: ctx.ss, radicado: radicado, usuario: u.correo, rol: "ADMIN", accion: "Edición de expediente por administrador",
      estadoAnterior: estadoAnt, estadoNuevo: g_(fila, m, "Estado actual"), etapaAnterior: etapaAnt, etapaNueva: g_(fila, m, "Etapa actual"),
      responsableAnterior: respAnt, responsableNuevo: g_(fila, m, "Responsable actual"), observacion: diffs.join(" | ")
    });

    return { success: true, mensaje: "Expediente actualizado (" + diffs.length + " cambio(s))." };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function reemplazarSoportePdf(token, radicado, archivo) {
  const lock = LockService.getScriptLock();
  try {
    const u = sesion_(token, ["ADMIN"]);
    validarArchivoPdf_(archivo);
    lock.waitLock(30000);

    const ctx = leerSolicitudes_();
    const pos = buscarPos_(ctx, radicado);
    if (pos < 0) throw new Error("No se encontró el radicado " + radicado);

    const fila = ctx.filas[pos].slice();
    const m = ctx.m;
    const carpeta = obtenerCarpetaPorUrl_(g_(fila, m, "Carpeta Drive")) || DriveApp.getFolderById(APP_FOLDER_ID);
    const ahora = new Date();
    const sello = Utilities.formatDate(ahora, Session.getScriptTimeZone(), "yyyyMMdd-HHmm");

    const anteriorUrl = String(g_(fila, m, "Soporte PDF"));
    const anterior = anteriorUrl ? archivoPorUrl_(anteriorUrl) : null;
    if (anterior) {
      try { anterior.setName("REEMPLAZADO " + sello + " - " + anterior.getName()); } catch (e) {}
    }

    const nuevo = guardarArchivoPdf_(carpeta, archivo, radicado + " - SOPORTES DEVOLUCION (v" + sello + ").pdf");
    s_(fila, m, "Soporte PDF", nuevo.getUrl());
    s_(fila, m, "Última actualización", ahora);
    escribirFila_(ctx, pos, fila);

    registrarHistorial_({
      ss: ctx.ss, radicado: radicado, usuario: u.correo, rol: "ADMIN", accion: "PDF de soportes reemplazado",
      estadoAnterior: g_(fila, m, "Estado actual"), estadoNuevo: g_(fila, m, "Estado actual"),
      etapaAnterior: g_(fila, m, "Etapa actual"), etapaNueva: g_(fila, m, "Etapa actual"),
      observacion: "El PDF anterior se conserva en la carpeta del caso con el prefijo REEMPLAZADO."
    });

    return { success: true, mensaje: "PDF reemplazado. El anterior se conservó en la carpeta del caso." };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/*************************************************
 * SOLICITUDES ICETEX (las radica el perfil ICETEX, no el estudiante)
 *************************************************/

function guardarSolicitudIcetex(token, p) {
  const lock = LockService.getScriptLock();
  try {
    const u = sesion_(token, ["ICETEX", "ADMIN"]);
    p = p || {};
    const doc = String(p.documentoEstudiante || "").trim();
    const nombre = String(p.nombreEstudiante || "").trim();
    const valor = numeroSeguro_(p.valor);
    if (doc.length < 5) throw new Error("Digite el documento del estudiante.");
    if (nombre.length < 3) throw new Error("Digite el nombre del estudiante.");
    if (!p.nivel || !p.modalidad || !p.programa) throw new Error("Seleccione nivel, modalidad y programa.");
    const perAc = normalizarPeriodo_(p.periodo);
    if (!perAc) throw new Error("El periodo académico no es válido. Ejemplos: 2026-1, 20261, 2026.1 o 2026 1.");
    if (!valor || valor <= 0) throw new Error("Digite el valor a devolver a ICETEX según el cálculo.");
    if (!p.archivoCorreo || !p.archivoCorreo.base64) throw new Error("Adjunte el PDF del soporte de correo.");
    if (!p.archivoCalculo || !p.archivoCalculo.base64) throw new Error("Adjunte el PDF del cálculo de la devolución a ICETEX.");
    validarArchivoPdf_(p.archivoCorreo);
    validarArchivoPdf_(p.archivoCalculo);

    lock.waitLock(30000);
    const ss = SpreadsheetApp.openById(APP_SPREADSHEET_ID);
    if (!ss.getSheetByName(HOJA_PERIODOS) || !ss.getSheetByName(HOJA_HISTORIAL)) crearEstructuraAplicativo();
    const per = periodoActivo_(ss);
    if (!per) throw new Error("No hay un periodo activo para recibir solicitudes. Pida al administrador activar uno.");
    const hoja = obtenerHojaPeriodo_(ss, per.hoja);
    const enc = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
    const m = mapaCols_(enc);

    const ahora = new Date();
    const radicado = generarRadicado_(ss, "ICX");
    const carpeta = crearCarpetaRadicado_(radicado, doc, nombre);
    const pdfCorreo = guardarArchivoPdf_(carpeta, p.archivoCorreo, radicado + " - SOPORTE CORREO ICETEX.pdf");
    const pdfCalculo = guardarArchivoPdf_(carpeta, p.archivoCalculo, radicado + " - CALCULO DEVOLUCION ICETEX.pdf");
    const funcionario = u.nombre || u.correo;

    const fila = new Array(enc.length).fill("");
    const set = function(c, v) { s_(fila, m, c, v); };
    set("Radicado", radicado); set("Tipo solicitud", "ICETEX"); set("Periodo recepción", per.periodo);
    set("Fecha solicitud", ahora);
    set("Hora solicitud", Utilities.formatDate(ahora, Session.getScriptTimeZone(), "HH:mm:ss"));
    set("Estado actual", "ENVIADA A JEFATURA"); set("Etapa actual", "JEFATURA FINANCIAMIENTO"); set("Responsable actual", "JEFATURA FINANCIAMIENTO");
    set("Última actualización", ahora);
    set("Documento estudiante", doc); set("Nombre estudiante", nombre);
    set("Correo estudiante", String(p.correoEstudiante || "").trim()); set("Celular estudiante", String(p.celularEstudiante || "").trim());
    set("Programa", p.programa); set("Modalidad", p.modalidad); set("Nivel", p.nivel); set("Periodo", perAc);
    set("Motivo solicitud", "Devolución a ICETEX");
    set("Descripción solicitud", String(p.descripcion || "").trim());
    set("Valor solicitado", valor); set("Devolver a", "ICETEX"); set("Porcentaje devolución", 100); set("Valor aprobado", valor);
    set("Soporte PDF", pdfCorreo.getUrl()); set("Cálculo devolución ICETEX", pdfCalculo.getUrl()); set("Carpeta Drive", carpeta.getUrl());
    set("Certificación bancaria incluida", "N/A"); set("Documento identidad incluido", "N/A"); set("Carta solicitud incluida", "N/A"); set("Soporte pago incluido", "N/A");
    set("Revisado por Financiamiento", "N/A (ICETEX)"); set("Fecha revisión Financiamiento", ahora); set("Decisión Financiamiento", "APROBADA");
    set("Artículo aplicado", "Devolución a ICETEX");
    set("Observación Financiamiento", "Solicitud radicada directamente por el perfil ICETEX (" + funcionario + ").");
    set("Funcionario Financiamiento", funcionario); set("Funcionario radica", funcionario);
    set("Fecha envío Jefatura", ahora); set("Estado Jefatura", "PENDIENTE");
    set("Estado Cartera", "PENDIENTE"); set("Estado Control Interno", "PENDIENTE"); set("Estado Tesorería", "PENDIENTE");
    set("Estado final", "EN PROCESO"); set("Días en proceso", 0);
    set("Observación pública", "Devolución a ICETEX en trámite.");

    const nueva = hoja.getLastRow() + 1;
    ["Documento estudiante", "Celular estudiante", "Hora solicitud", "Periodo"].forEach(function(col) {
      hoja.getRange(nueva, m[normalizarTexto_(col)] + 1).setNumberFormat("@");
    });
    hoja.getRange(nueva, 1, 1, fila.length).clearDataValidations();
    hoja.getRange(nueva, 1, 1, fila.length).setValues([fila]);

    registrarHistorial_({
      ss: ss, radicado: radicado, usuario: u.correo, rol: u.rol, accion: "Radicación ICETEX y envío a Jefatura de Financiamiento",
      estadoNuevo: "ENVIADA A JEFATURA", etapaNueva: "JEFATURA FINANCIAMIENTO", responsableNuevo: "JEFATURA FINANCIAMIENTO",
      observacion: "Valor a devolver a ICETEX: " + valor + ". Periodo de recepción: " + per.periodo + "."
    });

    try {
      notificarCambios_([{ radicado: radicado, nuevoEstado: "ENVIADA A JEFATURA", nuevaEtapa: "JEFATURA FINANCIAMIENTO", observacion: "Devolución a ICETEX por " + valor,
        nombre: nombre, documento: doc, correoEstudiante: "", programa: p.programa, valor: valor, lote: "", tipo: "ICETEX" }], "");
    } catch (eCorreo) { Logger.log("Correo no enviado: " + eCorreo.message); }

    return { success: true, radicado: radicado, periodo: per.periodo };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// ICETEX corrige una solicitud que le devolvió un área (datos y/o PDFs) antes de reenviarla.
function actualizarSolicitudIcetex(token, radicado, cambios, archivoCorreo, archivoCalculo) {
  const lock = LockService.getScriptLock();
  try {
    const u = sesion_(token, ["ICETEX"]);
    lock.waitLock(30000);
    const ctx = leerSolicitudes_();
    const pos = buscarPos_(ctx, radicado);
    if (pos < 0) throw new Error("No se encontró el radicado " + radicado);
    const fila = ctx.filas[pos].slice();
    const m = ctx.m;
    if (up_(g_(fila, m, "Tipo solicitud")) !== "ICETEX") throw new Error("Solo puede corregir solicitudes ICETEX.");
    if (normalizarTexto_(g_(fila, m, "Etapa actual")) !== "icetex") throw new Error("La solicitud no está devuelta para corrección.");
    if (archivoCorreo) validarArchivoPdf_(archivoCorreo);
    if (archivoCalculo) validarArchivoPdf_(archivoCalculo);

    const PERMITIDOS = ["Documento estudiante", "Nombre estudiante", "Nivel", "Modalidad", "Programa", "Periodo", "Descripción solicitud", "Valor solicitado"];
    const diffs = [];
    Object.keys(cambios || {}).forEach(function(campo) {
      if (PERMITIDOS.indexOf(campo) < 0) throw new Error("El campo \"" + campo + "\" no se puede editar.");
      let nuevo = String(cambios[campo] === null || cambios[campo] === undefined ? "" : cambios[campo]).trim();
      if (campo === "Valor solicitado") {
        const v = numeroSeguro_(nuevo);
        if (!v || v <= 0) throw new Error("El valor no es válido.");
        const antes = String(g_(fila, m, campo));
        if (numeroSeguro_(antes) !== v) { s_(fila, m, "Valor solicitado", v); s_(fila, m, "Valor aprobado", v); diffs.push("Valor: " + antes + " -> " + v); }
        return;
      }
      if (campo === "Periodo") { nuevo = normalizarPeriodo_(nuevo); if (!nuevo) throw new Error("El periodo no es válido. Ejemplo: 2026-1."); }
      if ((campo === "Documento estudiante" || campo === "Nombre estudiante") && !nuevo) throw new Error("El campo " + campo + " no puede quedar vacío.");
      const antes = campo === "Periodo" ? periodoTexto_(g_(fila, m, campo)) : String(g_(fila, m, campo));
      if (antes !== nuevo) { s_(fila, m, campo, nuevo); diffs.push(campo + ": " + antes + " -> " + nuevo); }
    });

    const carpeta = (archivoCorreo || archivoCalculo) ? (obtenerCarpetaPorUrl_(g_(fila, m, "Carpeta Drive")) || DriveApp.getFolderById(APP_FOLDER_ID)) : null;
    const sello = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd-HHmm");
    const reemplazar = function(campo, archivo, nombre, etiqueta) {
      const url = String(g_(fila, m, campo) || "");
      const ant = url ? archivoPorUrl_(url) : null;
      if (ant) { try { ant.setName("REEMPLAZADO " + sello + " - " + ant.getName()); } catch (e) {} }
      s_(fila, m, campo, guardarArchivoPdf_(carpeta, archivo, nombre).getUrl());
      diffs.push(etiqueta + " reemplazado");
    };
    if (archivoCorreo) reemplazar("Soporte PDF", archivoCorreo, radicado + " - SOPORTE CORREO ICETEX (v" + sello + ").pdf", "Soporte de correo");
    if (archivoCalculo) reemplazar("Cálculo devolución ICETEX", archivoCalculo, radicado + " - CALCULO DEVOLUCION ICETEX (v" + sello + ").pdf", "Cálculo");

    if (!diffs.length) return { success: true, mensaje: "No había cambios nuevos." };
    s_(fila, m, "Última actualización", new Date());
    escribirFila_(ctx, pos, fila);
    registrarHistorial_({
      ss: ctx.ss, radicado: radicado, usuario: u.correo, rol: "ICETEX", accion: "Corrección de solicitud por ICETEX",
      estadoAnterior: g_(fila, m, "Estado actual"), estadoNuevo: g_(fila, m, "Estado actual"),
      etapaAnterior: g_(fila, m, "Etapa actual"), etapaNueva: g_(fila, m, "Etapa actual"), observacion: diffs.join(" | ")
    });
    return { success: true, mensaje: "Correcciones guardadas (" + diffs.length + ")." };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/*************************************************
 * ALERTAS POR PLAZO (envío manual desde el administrador)
 *************************************************/

function diasCalendario_(desde, hasta) {
  const a = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
  const b = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate());
  return Math.max(0, Math.round((b - a) / 86400000));
}

function calcularPlazos_(ctx) {
  const hoy = new Date();
  const out = [];
  ctx.filas.forEach(function(f) {
    const rad = String(g_(f, ctx.m, "Radicado")).trim();
    if (!rad) return;
    const estado = up_(g_(f, ctx.m, "Estado actual"));
    PLAZOS_ALERTA.forEach(function(p) {
      if (p.estados.indexOf(estado) < 0) return;
      const fe = g_(f, ctx.m, p.colFecha);
      if (!(fe instanceof Date)) return;
      const dias = diasCalendario_(fe, hoy);
      const ua = g_(f, ctx.m, "Última alerta plazo");
      out.push({
        radicado: rad, nombre: String(g_(f, ctx.m, "Nombre estudiante")), programa: String(g_(f, ctx.m, "Programa")),
        valor: numeroSeguro_(g_(f, ctx.m, "Valor aprobado")) || numeroSeguro_(g_(f, ctx.m, "Valor solicitado")),
        rol: p.rol, area: p.area, dias: dias, plazo: p.dias, vencida: dias >= p.dias,
        ultimaAlerta: ua instanceof Date ? Utilities.formatDate(ua, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm") : "",
        nAlertas: Number(g_(f, ctx.m, "Alertas plazo enviadas") || 0)
      });
    });
  });
  return out;
}

function obtenerAlertasPlazos(token) {
  try {
    sesion_(token, ["ADMIN"]);
    const items = calcularPlazos_(leerSolicitudes_());
    return { success: true, plazos: PLAZOS_ALERTA.map(function(p) { return { rol: p.rol, area: p.area, dias: p.dias }; }), items: items };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Envía un correo por área con las solicitudes vencidas seleccionadas. Solo el administrador, solo por clic.
function enviarAlertasPlazo(token, radicados) {
  const lock = LockService.getScriptLock();
  try {
    const u = sesion_(token, ["ADMIN"]);
    if (!radicados || !radicados.length) throw new Error("Seleccione al menos una solicitud.");
    lock.waitLock(30000);

    const ctx = leerSolicitudes_();
    const sel = {};
    radicados.forEach(function(r) { sel[String(r).trim()] = true; });
    const vencidas = calcularPlazos_(ctx).filter(function(x) { return x.vencida && sel[x.radicado]; });
    if (!vencidas.length) throw new Error("Ninguna de las solicitudes seleccionadas tiene el plazo vencido.");

    const ahora = new Date();
    const porArea = {};
    vencidas.forEach(function(x) { (porArea[x.rol] = porArea[x.rol] || []).push(x); });

    const resumen = [];
    const hist = [];
    Object.keys(porArea).forEach(function(rol) {
      const lista = porArea[rol];
      const area = lista[0].area, plazo = lista[0].plazo;
      lista.sort(function(a, b) { return b.dias - a.dias; });

      const filas = lista.map(function(x) {
        return "<tr><td style='padding:8px;border:1px solid #E5E7EB;'>" + escaparHtml_(x.radicado) + "</td>" +
          "<td style='padding:8px;border:1px solid #E5E7EB;'>" + escaparHtml_(x.nombre) + "</td>" +
          "<td style='padding:8px;border:1px solid #E5E7EB;'>" + escaparHtml_(x.programa) + "</td>" +
          "<td style='padding:8px;border:1px solid #E5E7EB;text-align:right;'>$" + Number(x.valor || 0).toLocaleString("es-CO") + "</td>" +
          "<td style='padding:8px;border:1px solid #E5E7EB;text-align:center;'><b>" + x.dias + "</b> días</td></tr>";
      }).join("");
      const cc = copiaAlertas_();
      const thp = "padding:8px;border:1px solid #E1E7F3;font-size:12px;";
      const tabla = "<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='border-collapse:collapse;margin:14px 0;'>" +
        "<tr style='background:#F4F5FF;color:#07043B;'><th align='left' style='" + thp + "'>Radicado</th><th align='left' style='" + thp + "'>Estudiante</th><th align='left' style='" + thp + "'>Programa</th><th align='right' style='" + thp + "'>Valor</th><th style='" + thp + "'>Tiempo en su área</th></tr>" + filas + "</table>";
      enviarCorreoInstitucional_({ to: obtenerCorreoPorRol_(rol), cc: cc.cc, subject: "Recordatorio de plazo: solicitudes pendientes de gestión en " + area + " (" + lista.length + ")" }, {
        etiqueta: "Recordatorio de plazo",
        titulo: "Solicitudes con plazo vencido",
        subtitulo: "Equipo de " + area,
        saludo: "Cordial saludo, equipo de <b>" + escaparHtml_(area) + "</b>.",
        parrafos: ["Tienen <b>" + lista.length + "</b> solicitud(es) pendientes con más de <b>" + plazo + " días calendario</b> desde que llegaron a su área. Por favor gestionarlas lo antes posible."],
        tablaHtml: tabla,
        boton: urlApp_() ? { texto: "Abrir aplicativo", url: urlApp_() } : null,
        nota: cc.nota ? cc.nota.replace(/<[^>]+>/g, "") : "",
      });
      resumen.push(area + ": " + lista.length);

      lista.forEach(function(x) {
        const pos = buscarPos_(ctx, x.radicado);
        if (pos < 0) return;
        const fila = ctx.filas[pos].slice();
        s_(fila, ctx.m, "Última alerta plazo", ahora);
        s_(fila, ctx.m, "Alertas plazo enviadas", Number(g_(fila, ctx.m, "Alertas plazo enviadas") || 0) + 1);
        escribirFila_(ctx, pos, fila);
        hist.push({
          radicado: x.radicado, usuario: u.correo, rol: "ADMIN", accion: "Alerta de plazo enviada a " + area,
          estadoAnterior: g_(fila, ctx.m, "Estado actual"), estadoNuevo: g_(fila, ctx.m, "Estado actual"),
          etapaAnterior: g_(fila, ctx.m, "Etapa actual"), etapaNueva: g_(fila, ctx.m, "Etapa actual"),
          observacion: x.dias + " días calendario en el área (plazo " + plazo + ")."
        });
      });
    });
    if (hist.length) registrarHistorialLote_(ctx.ss, hist);

    return { success: true, enviadas: vencidas.length, mensaje: "Alerta enviada — " + resumen.join(" · ") };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function copiaAlertas_() {
  if (MODO_PRUEBAS) {
    return { cc: "", nota: "<p style='color:#D90429;font-size:12px;'><b>Modo pruebas:</b> en producción este correo iría con copia a " + escaparHtml_(CORREOS_COPIA_COORDINADORES.join(", ")) + ".</p>" };
  }
  return { cc: CORREOS_COPIA_COORDINADORES.join(","), nota: "" };
}

/*************************************************
 * ESTADO DE CUENTA (Cartera) Y COMENTARIOS
 *************************************************/

function subirEstadoCuenta(token, radicado, archivo, comentario) {
  const lock = LockService.getScriptLock();
  try {
    const u = sesion_(token, ["CARTERA", "ADMIN"]);
    validarArchivoPdf_(archivo);
    lock.waitLock(30000);

    const ctx = leerSolicitudes_();
    const pos = buscarPos_(ctx, radicado);
    if (pos < 0) throw new Error("No se encontró el radicado " + radicado);
    const fila = ctx.filas[pos].slice();
    const m = ctx.m;

    if (u.rol === "CARTERA") {
      const ya = String(g_(fila, m, "Fecha envío Cartera") || "") !== "";
      if (!ya) throw new Error("La solicitud aún no ha llegado a Cartera.");
      if (up_(g_(fila, m, "Estado actual")) !== "ENVIADA A CARTERA" && normalizarTexto_(g_(fila, m, "Etapa actual")) !== "cartera") {
        throw new Error("Solo puede adjuntar el estado de cuenta mientras la solicitud está en Cartera.");
      }
    }

    const carpeta = obtenerCarpetaPorUrl_(g_(fila, m, "Carpeta Drive")) || DriveApp.getFolderById(APP_FOLDER_ID);
    const ahora = new Date();
    const sello = Utilities.formatDate(ahora, Session.getScriptTimeZone(), "yyyyMMdd-HHmm");
    const anteriorUrl = String(g_(fila, m, "Estado de cuenta PDF") || "");
    const anterior = anteriorUrl ? archivoPorUrl_(anteriorUrl) : null;
    if (anterior) { try { anterior.setName("REEMPLAZADO " + sello + " - " + anterior.getName()); } catch (e) {} }

    const nuevo = guardarArchivoPdf_(carpeta, archivo, radicado + " - ESTADO DE CUENTA (v" + sello + ").pdf");
    s_(fila, m, "Estado de cuenta PDF", nuevo.getUrl());
    s_(fila, m, "Fecha estado de cuenta", ahora);
    s_(fila, m, "Funcionario estado de cuenta", u.nombre || u.correo);
    s_(fila, m, "Última actualización", ahora);
    escribirFila_(ctx, pos, fila);

    const texto = String(comentario || "").trim();
    if (texto) registrarComentario_(ctx.ss, radicado, u, texto);

    registrarHistorial_({
      ss: ctx.ss, radicado: radicado, usuario: u.correo, rol: u.rol,
      accion: anterior ? "Estado de cuenta reemplazado" : "Estado de cuenta adjuntado",
      estadoAnterior: g_(fila, m, "Estado actual"), estadoNuevo: g_(fila, m, "Estado actual"),
      etapaAnterior: g_(fila, m, "Etapa actual"), etapaNueva: g_(fila, m, "Etapa actual"),
      observacion: texto
    });
    return { success: true, mensaje: "Estado de cuenta guardado." + (texto ? " Comentario registrado." : "") };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/*************************************************
 * COMPROBANTE DE PAGO (Tesorería)
 *************************************************/

function subirComprobantePago(token, radicado, archivo) {
  const lock = LockService.getScriptLock();
  try {
    const u = sesion_(token, ["TESORERIA", "ADMIN"]);
    validarArchivoPdf_(archivo);
    lock.waitLock(30000);

    const ctx = leerSolicitudes_();
    const pos = buscarPos_(ctx, radicado);
    if (pos < 0) throw new Error("No se encontró el radicado " + radicado);
    const fila = ctx.filas[pos].slice();
    const m = ctx.m;
    const est = up_(g_(fila, m, "Estado actual"));

    if (u.rol === "TESORERIA" && est !== "ENVIADA A TESORERÍA" && est !== "PAGO PROGRAMADO") {
      throw new Error("Solo puede cargar el comprobante mientras la solicitud está pendiente en Tesorería.");
    }

    const carpeta = obtenerCarpetaPorUrl_(g_(fila, m, "Carpeta Drive")) || DriveApp.getFolderById(APP_FOLDER_ID);
    const ahora = new Date();
    const sello = Utilities.formatDate(ahora, Session.getScriptTimeZone(), "yyyyMMdd-HHmm");
    const anteriorUrl = String(g_(fila, m, "Comprobante pago") || "");
    const anterior = anteriorUrl ? archivoPorUrl_(anteriorUrl) : null;
    if (anterior) { try { anterior.setName("REEMPLAZADO " + sello + " - " + anterior.getName()); } catch (e) {} }

    const nuevo = guardarArchivoPdf_(carpeta, archivo, radicado + " - COMPROBANTE DE PAGO (v" + sello + ").pdf");
    s_(fila, m, "Comprobante pago", nuevo.getUrl());
    s_(fila, m, "Fecha comprobante pago", ahora);
    s_(fila, m, "Funcionario comprobante pago", u.nombre || u.correo);
    s_(fila, m, "Última actualización", ahora);
    escribirFila_(ctx, pos, fila);

    registrarHistorial_({
      ss: ctx.ss, radicado: radicado, usuario: u.correo, rol: u.rol,
      accion: anterior ? "Comprobante de pago reemplazado" : "Comprobante de pago adjuntado",
      estadoAnterior: g_(fila, m, "Estado actual"), estadoNuevo: g_(fila, m, "Estado actual"),
      etapaAnterior: g_(fila, m, "Etapa actual"), etapaNueva: g_(fila, m, "Etapa actual"),
      observacion: ""
    });
    return { success: true, mensaje: "Comprobante de pago guardado." };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// El administrador cierra el proceso cuando Tesorería no lo hizo: carga el comprobante (opcional si ya existe),
// marca el pago como realizado, finaliza la solicitud y se envía el correo al estudiante.
function cerrarProcesoAdmin(token, radicado, archivo) {
  const lock = LockService.getScriptLock();
  try {
    const u = sesion_(token, ["ADMIN"]);
    if (archivo && archivo.base64) validarArchivoPdf_(archivo);
    lock.waitLock(30000);
    const ctx = leerSolicitudes_();
    const pos = buscarPos_(ctx, radicado);
    if (pos < 0) throw new Error("No se encontró el radicado " + radicado);
    const fila = ctx.filas[pos].slice();
    const m = ctx.m;
    const estAnt = String(g_(fila, m, "Estado actual"));
    const est = up_(estAnt);
    if (est === "PAGO REALIZADO" || est === "FINALIZADA") throw new Error("El proceso ya está finalizado. Use «Enviar / Reenviar comprobante».");
    if (est !== "ENVIADA A TESORERÍA" && est !== "PAGO PROGRAMADO") throw new Error("Solo puede cerrar solicitudes que están en Tesorería (actualmente: " + estAnt + ").");

    const ahora = new Date();
    if (archivo && archivo.base64) {
      const carpeta = obtenerCarpetaPorUrl_(g_(fila, m, "Carpeta Drive")) || DriveApp.getFolderById(APP_FOLDER_ID);
      const sello = Utilities.formatDate(ahora, Session.getScriptTimeZone(), "yyyyMMdd-HHmm");
      const antUrl = String(g_(fila, m, "Comprobante pago") || "");
      const ant = antUrl ? archivoPorUrl_(antUrl) : null;
      if (ant) { try { ant.setName("REEMPLAZADO " + sello + " - " + ant.getName()); } catch (e) {} }
      const nuevo = guardarArchivoPdf_(carpeta, archivo, radicado + " - COMPROBANTE DE PAGO (v" + sello + ").pdf");
      s_(fila, m, "Comprobante pago", nuevo.getUrl());
      s_(fila, m, "Fecha comprobante pago", ahora);
      s_(fila, m, "Funcionario comprobante pago", u.nombre || u.correo);
    }
    const url = String(g_(fila, m, "Comprobante pago") || "").trim();
    if (!url) throw new Error("Cargue el comprobante de pago (PDF) para cerrar el proceso.");

    const obs = "Proceso cerrado por el administrador (" + (u.nombre || u.correo) + ") sin gestión previa de Tesorería.";
    s_(fila, m, "Estado Tesorería", "PAGO REALIZADO");
    s_(fila, m, "Fecha pago", ahora);
    s_(fila, m, "Observación Tesorería", obs);
    s_(fila, m, "Fecha notificación estudiante", ahora);
    s_(fila, m, "Estado final", "FINALIZADA");
    s_(fila, m, "Observación pública", "Su solicitud fue finalizada. El pago fue realizado y se envió el comprobante a su correo.");
    s_(fila, m, "Estado actual", "PAGO REALIZADO");
    s_(fila, m, "Etapa actual", "FINALIZADO");
    s_(fila, m, "Responsable actual", "FINALIZADO");
    s_(fila, m, "Última actualización", ahora);
    escribirFila_(ctx, pos, fila);

    registrarHistorial_({
      ss: ctx.ss, radicado: radicado, usuario: u.correo, rol: u.rol, accion: "Proceso cerrado por el administrador con comprobante de pago",
      estadoAnterior: estAnt, estadoNuevo: "PAGO REALIZADO",
      etapaAnterior: String(g_(fila, m, "Etapa actual") === "FINALIZADO" ? "TESORERÍA" : g_(fila, m, "Etapa actual")), etapaNueva: "FINALIZADO",
      responsableAnterior: "TESORERÍA", responsableNuevo: "FINALIZADO", observacion: obs
    });
    try {
      notificarCambios_([{
        radicado: radicado, nuevoEstado: "PAGO REALIZADO", nuevaEtapa: "FINALIZADO", observacion: "",
        nombre: String(g_(fila, m, "Nombre estudiante")), documento: String(g_(fila, m, "Documento estudiante")),
        correoEstudiante: String(g_(fila, m, "Correo estudiante")), programa: String(g_(fila, m, "Programa")),
        valor: numeroSeguro_(g_(fila, m, "Valor aprobado")), lote: String(g_(fila, m, "Número paquete") || ""),
        tipo: String(g_(fila, m, "Tipo solicitud") || ""), comprobanteUrl: url
      }], "");
    } catch (e) { Logger.log("Notificaciones cierre admin: " + e.message); }

    const icx = up_(g_(fila, m, "Tipo solicitud")) === "ICETEX";
    return { success: true, mensaje: "Proceso finalizado." + (icx ? " (ICETEX: no se escribe al estudiante.)" : (MODO_PRUEBAS ? " Modo pruebas: el correo se envió al correo de pruebas." : " Comprobante enviado al estudiante.")) };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// El administrador envía (o reenvía) el comprobante de pago al estudiante con un clic.
function enviarComprobanteEstudiante(token, radicado) {
  const lock = LockService.getScriptLock();
  try {
    const u = sesion_(token, ["ADMIN"]);
    lock.waitLock(30000);
    const ctx = leerSolicitudes_();
    const pos = buscarPos_(ctx, radicado);
    if (pos < 0) throw new Error("No se encontró el radicado " + radicado);
    const fila = ctx.filas[pos].slice();
    const m = ctx.m;
    const est = up_(g_(fila, m, "Estado actual"));

    if (up_(g_(fila, m, "Tipo solicitud")) === "ICETEX") throw new Error("Las solicitudes ICETEX no tienen estudiante destinatario.");
    if (est !== "PAGO REALIZADO" && est !== "FINALIZADA") throw new Error("El pago aún no está realizado. Tesorería debe marcarlo como realizado (o edite el estado en el expediente).");
    const url = String(g_(fila, m, "Comprobante pago") || "").trim();
    if (!url) throw new Error("Primero cargue el comprobante de pago (PDF).");
    const correo = String(g_(fila, m, "Correo estudiante") || "").trim();
    if (!validarCorreo_(correo)) throw new Error("La solicitud no tiene un correo de estudiante válido.");

    enviarCorreoEstudianteEstado_({
      radicado: radicado, nuevoEstado: "PAGO REALIZADO", nombre: String(g_(fila, m, "Nombre estudiante")),
      programa: String(g_(fila, m, "Programa")), correoEstudiante: correo, observacion: "", comprobanteUrl: url
    });

    const ahora = new Date();
    s_(fila, m, "Fecha envío comprobante", ahora);
    s_(fila, m, "Fecha notificación estudiante", ahora);
    s_(fila, m, "Última actualización", ahora);
    escribirFila_(ctx, pos, fila);
    registrarHistorial_({
      ss: ctx.ss, radicado: radicado, usuario: u.correo, rol: u.rol, accion: "Comprobante de pago enviado al estudiante",
      estadoAnterior: g_(fila, m, "Estado actual"), estadoNuevo: g_(fila, m, "Estado actual"),
      etapaAnterior: g_(fila, m, "Etapa actual"), etapaNueva: g_(fila, m, "Etapa actual"),
      observacion: MODO_PRUEBAS ? "Modo pruebas: enviado al correo de pruebas" : "Enviado a " + correo
    });
    return { success: true, mensaje: MODO_PRUEBAS ? "Modo pruebas: el correo se envió al correo de pruebas, no al estudiante." : "Comprobante enviado a " + correo + "." };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function registrarComentario_(ss, radicado, u, texto) {
  let hoja = ss.getSheetByName(HOJA_COMENTARIOS);
  if (!hoja) { prepararHojaComentarios_(ss); hoja = ss.getSheetByName(HOJA_COMENTARIOS); }
  const f = new Date();
  hoja.getRange(hoja.getLastRow() + 1, 1, 1, 7).setValues([[
    f, Utilities.formatDate(f, Session.getScriptTimeZone(), "HH:mm:ss"), String(radicado), u.rol, u.nombre || "", u.correo, texto
  ]]);
}

function agregarComentario(token, radicado, texto) {
  const lock = LockService.getScriptLock();
  try {
    const u = sesion_(token);
    const t = String(texto || "").trim();
    if (!t) throw new Error("Escriba el comentario.");
    if (t.length > 1500) throw new Error("El comentario no debe superar 1500 caracteres.");
    lock.waitLock(30000);
    const ctx = leerSolicitudes_();
    if (buscarPos_(ctx, radicado) < 0) throw new Error("No se encontró el radicado " + radicado);
    registrarComentario_(ctx.ss, radicado, u, t);
    return { success: true, mensaje: "Comentario registrado." };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function leerComentarios_(radicado) {
  const ss = SpreadsheetApp.openById(APP_SPREADSHEET_ID);
  const hoja = ss.getSheetByName(HOJA_COMENTARIOS);
  const out = [];
  if (!hoja || hoja.getLastRow() < 2) return out;
  const tz = Session.getScriptTimeZone();
  const datos = hoja.getDataRange().getValues();
  for (let i = 1; i < datos.length; i++) {
    if (String(datos[i][2]).trim() !== String(radicado).trim()) continue;
    const f = datos[i][0];
    out.push({
      fecha: f instanceof Date ? Utilities.formatDate(f, tz, "dd/MM/yyyy") : String(f),
      hora: datos[i][1] instanceof Date ? Utilities.formatDate(datos[i][1], tz, "HH:mm") : String(datos[i][1]),
      rol: String(datos[i][3]), funcionario: String(datos[i][4] || datos[i][5]), comentario: String(datos[i][6])
    });
  }
  return out;
}

function obtenerComentarios(token, radicado) {
  try {
    sesion_(token);
    return { success: true, comentarios: leerComentarios_(radicado) };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/*************************************************
 * DÍAS EN PROCESO (programar con crearTriggerDiario)
 *************************************************/

function crearTriggerDiario() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === "actualizarDiasEnProceso") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("actualizarDiasEnProceso").timeBased().everyDays(1).atHour(6).create();
  return "Trigger diario creado (6:00 a.m.).";
}

function actualizarDiasEnProceso() {
  const ctx = leerSolicitudes_();
  if (!ctx.filas.length) return;
  const iDias = ctx.m[normalizarTexto_("Días en proceso")];
  if (iDias === undefined) return;
  const hoy = new Date();
  const porHoja = {};
  ctx.filas.forEach(function(f, i) {
    const o = ctx.origen[i];
    const jd = o.map[iDias];
    if (jd < 0) return;
    const ini = g_(f, ctx.m, "Fecha solicitud");
    const fin = esFinal_(g_(f, ctx.m, "Estado actual")) && g_(f, ctx.m, "Última actualización") instanceof Date ? g_(f, ctx.m, "Última actualización") : hoy;
    const k = o.hoja.getName();
    (porHoja[k] = porHoja[k] || { hoja: o.hoja, jd: jd, col: [] }).col.push([diasHabiles_(ini, fin)]);
  });
  Object.keys(porHoja).forEach(function(k) {
    const x = porHoja[k];
    x.hoja.getRange(2, x.jd + 1, x.col.length, 1).setValues(x.col);
  });
}

function diasHabiles_(ini, fin) {
  if (!(ini instanceof Date) || isNaN(ini.getTime())) return "";
  const d = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate());
  const f = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate());
  let n = 0;
  while (d < f) {
    d.setDate(d.getDate() + 1);
    const w = d.getDay();
    if (w !== 0 && w !== 6) n++;
  }
  return n;
}

/*************************************************
 * FICHA INTERNA PDF
 *************************************************/

/*************************************************
 * FORMATO DE SEGUIMIENTO F AF 041 (PDF / EXCEL)
 *************************************************/

function verifFormato_(v) {
  const t = up_(v);
  return t === "OK" || t === "NO" ? t : "";
}

function entradasFormato_(o) {
  const sol = numeroSeguro_(o["Valor solicitado"]);
  const pct = numeroSeguro_(o["Porcentaje devolución"]);
  const apr = numeroSeguro_(o["Valor aprobado"]) || (sol && pct ? Math.round(sol * pct / 100) : 0);
  const e = [];
  const h = function(r, t) { e.push({ r: r, h: t }); };
  const f = function(r, l, v, fmt) { e.push({ r: r, l: l, v: v === undefined || v === null ? "" : v, fmt: fmt || "" }); };

  h(5, "INFORMACIÓN INICIAL");
  f(6, "Estudiante", o["Nombre estudiante"]);
  f(7, "No. Documento", o["Documento estudiante"]);
  f(8, "Fecha de Recepción de documentos", o["Fecha solicitud"]);
  f(9, "Fecha de Revisión de documentos", o["Fecha revisión Financiamiento"]);
  f(10, "Funcionario que recibe", o["Funcionario Financiamiento"]);

  h(12, "INFORMACIÓN DE LA DEVOLUCIÓN");
  f(13, "Periodo", o["Periodo"]);
  f(14, "Valor de la solicitud de Devolución", sol || "", "money");
  f(15, "% Devolución", pct ? pct / 100 : "", "pct");
  f(16, "Valor a devolver", apr || "", "money");
  f(17, "Motivo de la Devolución", o["Motivo solicitud"]);
  f(18, "Artículo del Reglamento", o["Artículo aplicado"]);
  f(19, "Devolver a", o["Devolver a"]);

  h(21, "VERIFICACIÓN DE DOCUMENTOS");
  f(22, "Carta de solicitud", verifFormato_(o["Carta solicitud incluida"]));
  f(23, "Fotocopia de Documento de Identidad", verifFormato_(o["Documento identidad incluido"]));
  f(24, "Comprobante de pago", verifFormato_(o["Soporte pago incluido"]));
  f(25, "Certificado bancaria", verifFormato_(o["Certificación bancaria incluida"]));
  f(26, "Observaciones:", o["Observación Financiamiento"]);

  h(29, "RECEPCIÓN ÁREAS INVOLUCRADAS EN EL PROCESO");
  f(30, "Fecha de Recepción Jefe de financiamiento", o["Fecha envío Jefatura"]);
  f(31, "Funcionario que recibe", o["Funcionario Jefatura"]);
  f(32, "Vo.Bo.", o["Firma Jefatura"]);
  f(33, "Observaciones:", o["Observación Jefatura"]);
  f(35, "Fecha de Recepción en Cartera", o["Fecha envío Cartera"]);
  f(36, "Funcionario que recibe", o["Funcionario Cartera"]);
  const comCartera = leerComentarios_(o["Radicado"]).filter(function(x) { return x.rol === "CARTERA"; })
    .map(function(x) { return x.fecha + " " + x.funcionario + ": " + x.comentario; });
  const partesCartera = [];
  if (o["Observación Cartera"]) partesCartera.push(o["Observación Cartera"]);
  if (o["Estado de cuenta PDF"]) partesCartera.push("Estado de cuenta adjunto" + (o["Fecha estado de cuenta"] ? " (" + o["Fecha estado de cuenta"] + ")" : "") + ".");
  comCartera.forEach(function(x) { partesCartera.push(x); });
  f(37, "Observaciones:", partesCartera.join("\n"));
  f(39, "Fecha de Recepción en Control Interno", o["Fecha envío Control Interno"]);
  f(40, "Funcionario que recibe", o["Funcionario Control Interno"]);
  f(41, "Observaciones:", o["Observación Control Interno"]);
  f(43, "Fecha de Recepción en Tesorería", o["Fecha envío Tesorería"]);
  f(44, "Funcionario que recibe", o["Funcionario Tesorería"]);
  f(45, "Observaciones:", o["Observación Tesorería"]);
  f(47, "Fecha devolución Estudiante", o["Fecha pago"]);
  f(49, "Total de días en el proceso de devolución", o["Días en proceso"]);
  return e;
}

// Construye una hoja temporal con el formato. Se va llenando con lo que ya existe en el expediente.
function construirFormatoHoja_(o) {
  const ss = SpreadsheetApp.create("FORMATO F AF 041 - " + o["Radicado"]);
  const hoja = ss.getSheets()[0];
  hoja.setName("FORMATO");
  hoja.setHiddenGridlines(true);
  hoja.setColumnWidth(1, 20);
  hoja.setColumnWidth(2, 330);
  hoja.setColumnWidth(3, 330);

  const filas = 49;
  const valores = [];
  for (let i = 0; i < filas; i++) valores.push(["", ""]);
  valores[0] = ["SEGUIMIENTO A DEVOLUCIONES", ""];
  valores[1] = ["F AF 041  ·  18/11/2024  ·  V 1.0", ""];
  valores[2] = ["Radicado: " + o["Radicado"], ""];
  valores[3] = ["Estado: " + (o["Estado actual"] || ""), ""];

  hoja.getRange(5, 3, filas - 4, 1).setNumberFormat("@");
  const encabezados = [];
  const entradas = entradasFormato_(o);
  entradas.forEach(function(x) {
    if (x.h) { valores[x.r - 1][0] = x.h; encabezados.push(x.r); return; }
    valores[x.r - 1][0] = x.l;
    valores[x.r - 1][1] = x.v;
    if (x.fmt === "money") hoja.getRange(x.r, 3).setNumberFormat('"$"#,##0');
    if (x.fmt === "pct") hoja.getRange(x.r, 3).setNumberFormat("0%");
  });

  const rango = hoja.getRange(1, 2, filas, 2);
  rango.setValues(valores);
  rango.setFontFamily("Arial").setFontSize(10).setVerticalAlignment("middle").setWrap(true);

  // Encabezado limpio (fondo blanco): información centrada y logo a la izquierda.
  [1, 2, 3, 4].forEach(function(r) {
    hoja.getRange(r, 2, 1, 2).merge().setHorizontalAlignment("center").setVerticalAlignment("middle").setWrap(false).setBackground("#FFFFFF");
  });
  hoja.getRange(1, 2).setFontSize(16).setFontWeight("bold").setFontColor("#07043B");
  hoja.getRange(2, 2).setFontColor("#667085");
  hoja.getRange(3, 2).setFontWeight("bold").setFontColor("#172033");
  hoja.getRange(4, 2).setFontColor("#172033");
  hoja.setRowHeight(1, 34); hoja.setRowHeight(2, 24); hoja.setRowHeight(3, 24); hoja.setRowHeight(4, 24);
  hoja.getRange(4, 2, 1, 2).setBorder(null, null, true, null, null, null, "#07043B", SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  try {
    const logo = obtenerLogoBlob_();
    if (logo) {
      const img = hoja.insertImage(logo, 2, 1, 6, 4);
      const w0 = img.getWidth(), h0 = img.getHeight();
      if (w0 && h0) {
        const k = Math.min(150 / w0, 96 / h0);
        img.setWidth(Math.round(w0 * k)); img.setHeight(Math.round(h0 * k));
      }
    }
  } catch (e) { Logger.log("Logo no insertado: " + e.message); }

  hoja.getRange(6, 2, filas - 5, 1).setFontWeight("bold").setBackground("#F4F5FF");
  hoja.getRange(6, 3, filas - 5, 1).setHorizontalAlignment("left");
  encabezados.forEach(function(r) {
    hoja.getRange(r, 2, 1, 2).merge().setBackground("#07043B").setFontColor("#FFFFFF").setFontWeight("bold").setHorizontalAlignment("center");
  });
  [11, 20, 27, 28, 34, 38, 42, 46, 48].forEach(function(r) {
    hoja.setRowHeight(r, 8);
    hoja.getRange(r, 2, 1, 2).setBackground("#FFFFFF");
  });
  [26, 33, 41, 45].forEach(function(r) { hoja.setRowHeight(r, 44); });
  hoja.setRowHeight(37, 80);

  entradas.forEach(function(x) {
    if (x.h) return;
    hoja.getRange(x.r, 2, 1, 2).setBorder(true, true, true, true, true, true, "#C5D0E3", SpreadsheetApp.BorderStyle.SOLID);
  });

  SpreadsheetApp.flush();
  return ss;
}

// Sheets no admite WEBP: se descarga una vez, Drive genera la miniatura en PNG y se guarda para reutilizarla.
function obtenerLogoBlob_() {
  const props = PropertiesService.getScriptProperties();
  const idCache = props.getProperty("LOGO_PNG_ID");
  if (idCache) { try { return DriveApp.getFileById(idCache).getBlob(); } catch (e) { props.deleteProperty("LOGO_PNG_ID"); } }
  try {
    const carpeta = DriveApp.getFolderById(APP_FOLDER_ID);
    const r = UrlFetchApp.fetch(LOGO_URL, { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) throw new Error("No se pudo descargar el logo (" + r.getResponseCode() + ").");
    const tmp = carpeta.createFile(r.getBlob().setName("logo-americana.webp"));
    try {
      let png = null;
      for (let i = 0; i < 4 && !png; i++) {
        const t = UrlFetchApp.fetch("https://drive.google.com/thumbnail?id=" + tmp.getId() + "&sz=w800", { headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
        if (t.getResponseCode() === 200 && /image\/(png|jpe?g)/.test(t.getHeaders()["Content-Type"] || "")) png = t.getBlob();
        else Utilities.sleep(1500);
      }
      if (!png) throw new Error("Drive no generó la miniatura del logo.");
      const f = carpeta.createFile(png.setName("logo-americana.png"));
      props.setProperty("LOGO_PNG_ID", f.getId());
      return f.getBlob();
    } finally {
      try { tmp.setTrashed(true); } catch (e) {}
    }
  } catch (e) {
    Logger.log("Logo nuevo no disponible: " + e.message);
  }
  try { return DriveApp.getFileById(LOGO_DRIVE_ID).getBlob(); } catch (e2) {}
  return null;
}

function exportarHoja_(ss, formato) {
  const id = ss.getId();
  const gid = ss.getSheets()[0].getSheetId();
  let url = "https://docs.google.com/spreadsheets/d/" + id + "/export?format=" + formato + "&gid=" + gid;
  if (formato === "pdf") url += "&size=letter&portrait=true&fitw=true&gridlines=false&sheetnames=false&printtitle=false&pagenumbers=false&top_margin=0.5&bottom_margin=0.5&left_margin=0.5&right_margin=0.5";
  const resp = UrlFetchApp.fetch(url, { headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) throw new Error("No se pudo exportar el archivo (código " + resp.getResponseCode() + ").");
  return resp.getBlob();
}

function eliminarTemporal_(ss) {
  try { DriveApp.getFileById(ss.getId()).setTrashed(true); } catch (e) { Logger.log("No se pudo eliminar el temporal: " + e.message); }
}

// Ficha interna: PDF del formato guardado en la carpeta del caso.
function generarFichaInternaPDF_(radicado, o) {
  const carpeta = obtenerCarpetaPorUrl_(o["Carpeta Drive"]) || DriveApp.getFolderById(APP_FOLDER_ID);
  const tmp = construirFormatoHoja_(o);
  try {
    const blob = exportarHoja_(tmp, "pdf").setName("FORMATO SEGUIMIENTO - " + radicado + ".pdf");
    const archivo = carpeta.createFile(blob);
    if (o["Ficha interna"]) {
      const vieja = archivoPorUrl_(o["Ficha interna"]);
      if (vieja) { try { vieja.setTrashed(true); } catch (e) {} }
    }
    return archivo.getUrl();
  } finally {
    eliminarTemporal_(tmp);
  }
}

// Descarga del formato actualizado (Excel o PDF) para cualquier perfil interno.
function descargarFormato(token, radicado, tipo) {
  try {
    sesion_(token);
    const ctx = leerSolicitudes_();
    const pos = buscarPos_(ctx, radicado);
    if (pos < 0) throw new Error("No se encontró el radicado.");
    const o = objetoSolicitud_(ctx, ctx.filas[pos], new Date());
    const tmp = construirFormatoHoja_(o);
    try {
      const pdf = up_(tipo) === "PDF";
      const blob = exportarHoja_(tmp, pdf ? "pdf" : "xlsx");
      return {
        success: true,
        nombre: "FORMATO SEGUIMIENTO - " + radicado + (pdf ? ".pdf" : ".xlsx"),
        base64: Utilities.base64Encode(blob.getBytes()),
        mime: pdf ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      };
    } finally {
      eliminarTemporal_(tmp);
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/*************************************************
 * REPORTES EN EXCEL (solo administrador)
 *************************************************/

const COLUMNAS_REPORTE = [
  "Radicado", "Fecha solicitud", "Estado actual", "Etapa actual", "Documento estudiante", "Nombre estudiante", "Correo estudiante",
  "Celular estudiante", "Programa", "Modalidad", "Nivel", "Periodo", "Motivo solicitud", "Valor solicitado", "Devolver a",
  "Porcentaje devolución", "Valor aprobado", "Artículo aplicado", "Decisión Financiamiento", "Número paquete",
  "Fecha envío Jefatura", "Estado Jefatura", "Fecha envío Cartera", "Estado Cartera", "Fecha envío Control Interno",
  "Estado Control Interno", "Fecha envío Tesorería", "Estado Tesorería", "Fecha pago", "Días en proceso",
  "Tipo solicitud", "Periodo recepción"
];

function generarReporteExcel(token, filtros) {
  try {
    sesion_(token, ["ADMIN"]);
    const f = filtros || {};
    const ctx = leerSolicitudes_();
    const hoy = new Date();
    const desde = f.desde ? new Date(f.desde + "T00:00:00") : null;
    const hasta = f.hasta ? new Date(f.hasta + "T23:59:59") : null;
    const periodos = f.periodos || [];
    const estados = f.estados || [];

    const sel = [];
    ctx.filas.forEach(function(fila) {
      if (!String(g_(fila, ctx.m, "Radicado")).trim()) return;
      const fs = g_(fila, ctx.m, "Fecha solicitud");
      if (desde && !(fs instanceof Date && fs >= desde)) return;
      if (hasta && !(fs instanceof Date && fs <= hasta)) return;
      if (periodos.length && periodos.indexOf(periodoTexto_(g_(fila, ctx.m, "Periodo"))) < 0) return;
      if (estados.length && estados.indexOf(String(g_(fila, ctx.m, "Estado actual"))) < 0) return;
      if (f.nivel && String(g_(fila, ctx.m, "Nivel")) !== f.nivel) return;
      if (f.periodoRecepcion && String(g_(fila, ctx.m, "Periodo recepción")) !== f.periodoRecepcion) return;
      if (f.tipo && String(g_(fila, ctx.m, "Tipo solicitud")) !== f.tipo) return;
      if (f.lote && String(g_(fila, ctx.m, "Número paquete")).trim() !== String(f.lote).trim()) return;
      sel.push(objetoSolicitud_(ctx, fila, hoy));
    });
    if (!sel.length) throw new Error("No hay solicitudes con esos filtros.");

    const ss = SpreadsheetApp.create("REPORTE DEVOLUCIONES");
    try {
      const resumen = ss.getSheets()[0];
      resumen.setName("Resumen");
      const detalle = ss.insertSheet("Detalle");

      // ---- Detalle ----
      const numericas = ["Valor solicitado", "Valor aprobado", "Porcentaje devolución", "Días en proceso"];
      const filasDetalle = sel.map(function(o) {
        return COLUMNAS_REPORTE.map(function(c) {
          if (numericas.indexOf(c) >= 0) return o[c] ? numeroSeguro_(o[c]) : "";
          return o[c] || "";
        });
      });
      detalle.getRange(1, COLUMNAS_REPORTE.indexOf("Documento estudiante") + 1, filasDetalle.length + 1, 1).setNumberFormat("@");
      detalle.getRange(1, 1, 1, COLUMNAS_REPORTE.length).setValues([COLUMNAS_REPORTE])
        .setBackground("#07043B").setFontColor("#FFFFFF").setFontWeight("bold").setWrap(true).setVerticalAlignment("middle");
      detalle.getRange(2, 1, filasDetalle.length, COLUMNAS_REPORTE.length).setValues(filasDetalle);
      ["Valor solicitado", "Valor aprobado"].forEach(function(c) {
        detalle.getRange(2, COLUMNAS_REPORTE.indexOf(c) + 1, filasDetalle.length, 1).setNumberFormat('"$"#,##0');
      });
      detalle.setFrozenRows(1);
      detalle.setFrozenColumns(1);
      detalle.autoResizeColumns(1, COLUMNAS_REPORTE.length);

      // ---- Resumen ----
      const pagado = function(o) { const e = up_(o["Estado actual"]); return e === "PAGO REALIZADO" || e === "FINALIZADA"; };
      let totSol = 0, totApr = 0, totPag = 0, sumDias = 0, nDias = 0;
      sel.forEach(function(o) {
        totSol += numeroSeguro_(o["Valor solicitado"]);
        if (up_(o["Decisión Financiamiento"]) === "APROBADA") totApr += numeroSeguro_(o["Valor aprobado"]);
        if (pagado(o)) totPag += numeroSeguro_(o["Valor aprobado"]);
        if (o["Días en proceso"] !== "" && o["Días en proceso"] !== undefined) { sumDias += Number(o["Días en proceso"]) || 0; nDias++; }
      });

      const agrupar = function(fn) {
        const mapa = {};
        sel.forEach(function(o) {
          const k = fn(o) || "SIN DATO";
          if (!mapa[k]) mapa[k] = { n: 0, sol: 0, apr: 0, pag: 0 };
          mapa[k].n++;
          mapa[k].sol += numeroSeguro_(o["Valor solicitado"]);
          if (up_(o["Decisión Financiamiento"]) === "APROBADA") mapa[k].apr += numeroSeguro_(o["Valor aprobado"]);
          if (pagado(o)) mapa[k].pag += numeroSeguro_(o["Valor aprobado"]);
        });
        return Object.keys(mapa).sort().map(function(k) { return [k, mapa[k].n, mapa[k].sol, mapa[k].apr, mapa[k].pag]; });
      };

      let fila = 1;
      resumen.getRange(fila, 1).setValue("REPORTE DE DEVOLUCIONES - SEDE BARRANQUILLA").setFontSize(14).setFontWeight("bold").setFontColor("#07043B");
      fila++;
      const textoFiltros = "Generado: " + formatearFecha_(hoy) +
        (f.desde ? "  ·  Desde: " + f.desde : "") + (f.hasta ? "  ·  Hasta: " + f.hasta : "") +
        (periodos.length ? "  ·  Periodos: " + periodos.join(", ") : "") + (estados.length ? "  ·  Estados: " + estados.join(", ") : "") +
        (f.nivel ? "  ·  Nivel: " + f.nivel : "");
      resumen.getRange(fila, 1).setValue(textoFiltros).setFontColor("#667085");
      fila += 2;

      const kpis = [
        ["Solicitudes", sel.length], ["Valor solicitado", totSol], ["Valor aprobado", totApr], ["Valor pagado", totPag],
        ["Pendiente de pago", Math.max(totApr - totPag, 0)], ["Promedio días hábiles en proceso", nDias ? Math.round(sumDias / nDias * 10) / 10 : 0]
      ];
      resumen.getRange(fila, 1, kpis.length, 2).setValues(kpis);
      resumen.getRange(fila, 1, kpis.length, 1).setFontWeight("bold").setBackground("#F4F5FF");
      resumen.getRange(fila + 1, 2, 4, 1).setNumberFormat('"$"#,##0');
      fila += kpis.length + 2;

      const posiciones = {};
      const escribirTabla = function(clave, titulo, rotulo, filasT) {
        resumen.getRange(fila, 1).setValue(titulo).setFontWeight("bold").setFontSize(12).setFontColor("#07043B");
        fila++;
        const enc = [[rotulo, "Solicitudes", "Valor solicitado", "Valor aprobado", "Valor pagado"]];
        resumen.getRange(fila, 1, 1, 5).setValues(enc).setBackground("#07043B").setFontColor("#FFFFFF").setFontWeight("bold");
        posiciones[clave] = { fila: fila, n: filasT.length };
        if (filasT.length) {
          resumen.getRange(fila + 1, 1, filasT.length, 5).setValues(filasT);
          resumen.getRange(fila + 1, 3, filasT.length, 3).setNumberFormat('"$"#,##0');
        }
        fila += filasT.length + 3;
      };

      escribirTabla("estado", "Por estado", "Estado", agrupar(function(o) { return o["Estado actual"]; }));
      escribirTabla("etapa", "Por etapa", "Etapa", agrupar(function(o) { return o["Etapa actual"]; }));
      escribirTabla("periodo", "Por periodo académico (el que indicó el estudiante)", "Periodo", agrupar(function(o) { return o["Periodo"]; }));
      escribirTabla("recepcion", "Por periodo de recepción (hoja donde se tramita)", "Periodo recepción", agrupar(function(o) { return o["Periodo recepción"]; }));
      escribirTabla("mes", "Por mes de solicitud", "Mes", agrupar(function(o) { const fs = o["Fecha solicitud"] || ""; return fs ? fs.substr(6, 4) + "-" + fs.substr(3, 2) : ""; }));
      escribirTabla("programa", "Por programa", "Programa", agrupar(function(o) { return o["Programa"]; }));
      escribirTabla("motivo", "Por motivo", "Motivo", agrupar(function(o) { return o["Motivo solicitud"]; }));

      resumen.setColumnWidth(1, 330);
      resumen.setColumnWidths(2, 4, 130);

      try {
        const pe = posiciones.estado;
        resumen.insertChart(resumen.newChart().setChartType(Charts.ChartType.PIE)
          .addRange(resumen.getRange(pe.fila, 1, pe.n + 1, 2)).setPosition(3, 7, 0, 0)
          .setOption("title", "Solicitudes por estado").setOption("width", 520).setOption("height", 320).build());
        const pp = posiciones.periodo;
        resumen.insertChart(resumen.newChart().setChartType(Charts.ChartType.COLUMN)
          .addRange(resumen.getRange(pp.fila, 1, pp.n + 1, 1)).addRange(resumen.getRange(pp.fila, 3, pp.n + 1, 3))
          .setPosition(20, 7, 0, 0).setOption("title", "Valores por periodo académico").setOption("width", 520).setOption("height", 320).build());
      } catch (eg) {
        Logger.log("Gráficos del reporte no creados: " + eg.message);
      }

      SpreadsheetApp.flush();
      const blob = exportarHoja_(ss, "xlsx");
      return {
        success: true,
        total: sel.length,
        nombre: "REPORTE_DEVOLUCIONES_" + Utilities.formatDate(hoy, Session.getScriptTimeZone(), "yyyyMMdd_HHmm") + ".xlsx",
        base64: Utilities.base64Encode(blob.getBytes()),
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      };
    } finally {
      eliminarTemporal_(ss);
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/*************************************************
 * DRIVE
 *************************************************/

function crearCarpetaRadicado_(radicado, documento, nombre) {
  const base = DriveApp.getFolderById(APP_FOLDER_ID);
  return base.createFolder(limpiarNombreArchivo_(radicado + " - " + documento + " - " + nombre));
}

// Los archivos quedan PRIVADOS. Se sirven desde el aplicativo a usuarios con sesión.
function guardarArchivoPdf_(carpeta, archivo, nombreArchivo) {
  const partes = String(archivo.base64 || "").split(",");
  if (partes.length < 2) throw new Error("El PDF no llegó en un formato válido.");

  const bytes = Utilities.base64Decode(partes[1]);
  if (bytes.length > MAX_PDF_BYTES) throw new Error("El PDF no debe superar 90 MB.");
  if (!(bytes[0] === 37 && bytes[1] === 80 && bytes[2] === 68 && bytes[3] === 70)) throw new Error("El archivo no es un PDF válido.");

  return carpeta.createFile(Utilities.newBlob(bytes, "application/pdf", nombreArchivo));
}

function idDeUrl_(url) {
  const s = String(url || "");
  let x = /\/d\/([-\w]{20,})/.exec(s) || /[?&]id=([-\w]{20,})/.exec(s) || /\/folders\/([-\w]{20,})/.exec(s) || /([-\w]{25,})/.exec(s);
  return x ? x[1] : "";
}

function archivoPorUrl_(url) {
  const id = idDeUrl_(url);
  if (!id) return null;
  try { return DriveApp.getFileById(id); } catch (e) { return null; }
}

function obtenerCarpetaPorUrl_(url) {
  const id = idDeUrl_(url);
  if (!id) return null;
  try { return DriveApp.getFolderById(id); } catch (e) { return null; }
}

/*************************************************
 * CORREOS
 *************************************************/

/*************************************************
 * PLANTILLA INSTITUCIONAL DE CORREOS
 * Colores: azul noche #07043B · azul claro #41B6FF · azul institucional #00579D · naranja #FF9824
 * Logo: 20 años (se incrusta como imagen en línea; no depende de que el correo cargue imágenes externas)
 *************************************************/

const FASES_CORREO = ["Radicada", "Financiamiento", "Jefatura de Financiamiento", "Cartera", "Control Interno", "Tesorería", "Finalizada"];
const NOTIFICAR_AVANCE_ESTUDIANTE = true; // false = el estudiante solo recibe correo en subsanación, rechazo, pago programado y finalización

// Mensajes al estudiante por fase actual. fase = posición en FASES_CORREO; tipo: info | alerta | ok | error
const CORREO_ESTUDIANTE_POR_ESTADO = {
  "ENVIADA A JEFATURA": { asunto: "Su solicitud de devolución avanzó a Jefatura de Financiamiento", fase: 2, tipo: "info", titulo: "Su solicitud avanzó a Jefatura de Financiamiento", mensaje: "Financiamiento terminó la revisión de sus documentos y su solicitud pasó a la Jefatura de Financiamiento para aprobación." },
  "ENVIADA A CARTERA": { asunto: "Su solicitud de devolución está en revisión de Cartera", fase: 3, tipo: "info", titulo: "Su solicitud está en Cartera", mensaje: "La Jefatura de Financiamiento aprobó su solicitud. Ahora Cartera validará su estado de cuenta." },
  "ENVIADA A CONTROL INTERNO": { asunto: "Su solicitud de devolución está en revisión de Control Interno", fase: 4, tipo: "info", titulo: "Su solicitud está en Control Interno", mensaje: "Cartera completó su revisión. Control Interno realizará la verificación correspondiente." },
  "ENVIADA A TESORERÍA": { asunto: "Su solicitud de devolución está en gestión de pago en Tesorería", fase: 5, tipo: "info", titulo: "Su solicitud está en Tesorería", mensaje: "Control Interno aprobó su solicitud. Tesorería gestionará el pago." },
  "PENDIENTE SUBSANACIÓN": { asunto: "Su solicitud de devolución requiere un ajuste", fase: 1, tipo: "alerta", titulo: "Su solicitud requiere un ajuste", mensaje: "Necesitamos que complete o corrija información para poder continuar. Ingrese a Consultar estado con su radicado o su documento y cargue el nuevo PDF." },
  "RECHAZADA POR FINANCIAMIENTO": { asunto: "Respuesta a su solicitud de devolución", fase: 1, tipo: "error", titulo: "Solicitud no aprobada", mensaje: "Después de la revisión realizada, la solicitud no fue aprobada por Financiamiento." },
  "PAGO PROGRAMADO": { asunto: "Pago programado de su solicitud de devolución", fase: 5, tipo: "info", titulo: "Pago programado", mensaje: "Tesorería registró la programación del pago correspondiente a su solicitud." },
  "PAGO REALIZADO": { asunto: "Solicitud de devolución finalizada: comprobante de pago", fase: 6, tipo: "ok", titulo: "Solicitud finalizada", mensaje: "Tesorería realizó el pago de su devolución. Su proceso ha finalizado. Adjuntamos a este correo el comprobante de pago." }
};

function obtenerLogo20Blob_() {
  try { return DriveApp.getFileById(LOGO_DRIVE_ID).getBlob().setName("logo20.png"); } catch (e) {}
  try {
    const r = UrlFetchApp.fetch("https://drive.google.com/thumbnail?id=" + LOGO_DRIVE_ID + "&sz=w800", { headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    if (r.getResponseCode() === 200) return r.getBlob().setName("logo20.png");
  } catch (e2) {}
  return null;
}

// Línea de avance por fases para el estudiante.
function progresoCorreoHtml_(fase, tipo) {
  const celdas = FASES_CORREO.map(function(nombre, i) {
    let bg = "#E5E7EB", color = "#667085", marca = "";
    if (fase >= FASES_CORREO.length - 1) { bg = "#41B6FF"; color = "#07043B"; marca = "&#10003; "; }
    else if (i < fase) { bg = "#41B6FF"; color = "#07043B"; marca = "&#10003; "; }
    else if (i === fase) {
      bg = tipo === "error" ? "#D90429" : "#FF9824"; color = tipo === "error" ? "#FFFFFF" : "#07043B";
    }
    return "<td class='pg' align='center' style='padding:0 2px;vertical-align:top;'><div style='background:" + bg + ";color:" + color + ";border-radius:8px;padding:8px 3px;font-size:10px;font-weight:bold;line-height:1.2;word-break:break-word;'>" + marca + escaparHtml_(nombre) + "</div></td>";
  }).join("");
  return "<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='margin:18px 0 6px;'><tr>" + celdas + "</tr></table>";
}

/**
 * o = { etiqueta, titulo, subtitulo, saludo, parrafos[], datos[[k,v]], tablaHtml, caja:{tipo,titulo,texto},
 *       progreso:{fase,tipo}, boton:{texto,url}, nota, firma, logo:boolean }
 * Diseño fluido: se ve bien en escritorio y en celular (los estilos @media los respetan Gmail, Outlook móvil y Apple Mail).
 */
const FIRMA_CORREO_LINEAS = ["Financiamiento Estudiantil", "Devoluciones - Sede Barranquilla", "Corporación Universitaria Americana"];

function plantillaCorreo_(o) {
  const colores = { info: ["#F0F8FF", "#41B6FF"], alerta: ["#FFF7E8", "#FF9824"], ok: ["#EAF8EF", "#1F9D55"], error: ["#FDECEF", "#D90429"] };
  const css = "body{margin:0;padding:0;-webkit-text-size-adjust:100%;}" +
    "@media only screen and (max-width:520px){" +
    ".wrap{padding:0 !important;}" +
    ".card{border-radius:0 !important;}" +
    ".hpad{padding:18px 14px 16px !important;}" +
    ".cpad{padding:18px 16px 6px !important;}" +
    ".fpad{padding:4px 16px 18px !important;}" +
    ".logo{width:100% !important;max-width:300px !important;}" +
    ".ttl{font-size:19px !important;}" +
    ".pg{display:block !important;width:auto !important;padding:2px 0 !important;}" +
    ".pg div{padding:7px 10px !important;font-size:12px !important;text-align:left !important;}" +
    ".dk{display:block !important;width:auto !important;box-sizing:border-box;}" +
    ".btn{display:block !important;text-align:center !important;}" +
    "}";
  let h = "<!DOCTYPE html><html lang='es'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'><meta name='x-apple-disable-message-reformatting'><style>" + css + "</style></head>" +
    "<body style='margin:0;padding:0;background:#EEF1FA;'>" +
    "<div class='wrap' style='background:#EEF1FA;padding:24px 10px;font-family:Arial,Helvetica,sans-serif;color:#172033;'>" +
    "<table role='presentation' class='card' align='center' width='100%' cellpadding='0' cellspacing='0' style='max-width:680px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;'>" +
    "<tr><td style='height:6px;background:#41B6FF;background-image:linear-gradient(90deg,#41B6FF,#FFFFFF,#FF9824);font-size:0;line-height:0;'>&nbsp;</td></tr>" +
    "<tr><td class='hpad' align='center' style='background:#07043B;padding:28px 24px 24px;'>" +
    (o.logo ? "<img class='logo' src='cid:logo20' alt='Corporación Universitaria Americana - 20 años' width='320' style='display:block;margin:0 auto 18px;border:0;height:auto;width:320px;max-width:100%;'>" :
      "<div style='color:#FFFFFF;font-size:14px;font-weight:bold;letter-spacing:1px;margin-bottom:14px;'>CORPORACIÓN UNIVERSITARIA AMERICANA · 20 AÑOS</div>") +
    (o.etiqueta ? "<div style='display:inline-block;background:#FF9824;color:#07043B;font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;border-radius:999px;padding:4px 12px;margin-bottom:10px;'>" + escaparHtml_(o.etiqueta) + "</div>" : "") +
    "<h1 class='ttl' style='margin:0;color:#FFFFFF;font-size:24px;line-height:1.25;'>" + escaparHtml_(o.titulo) + "</h1>" +
    "<p style='margin:8px 0 0;color:#41B6FF;font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;'>" + escaparHtml_(o.subtitulo || "Devoluciones · Sede Barranquilla") + "</p>" +
    "</td></tr><tr><td class='cpad' style='padding:26px 28px 8px;font-size:15px;line-height:1.6;'>";

  if (o.saludo) h += "<p style='margin:0 0 12px;'>" + o.saludo + "</p>";
  (o.parrafos || []).forEach(function(p) { h += "<p style='margin:0 0 12px;'>" + p + "</p>"; });
  if (o.progreso) h += progresoCorreoHtml_(o.progreso.fase, o.progreso.tipo);

  if (o.datos && o.datos.length) {
    h += "<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='margin:14px 0;border:1px solid #E1E7F3;border-radius:10px;border-collapse:separate;'>" +
      o.datos.map(function(d, i) {
        return "<tr><td class='dk' style='padding:9px 12px;background:#F4F5FF;font-size:12px;font-weight:bold;color:#07043B;width:38%;" + (i ? "border-top:1px solid #E1E7F3;" : "") + "'>" + escaparHtml_(d[0]) + "</td>" +
          "<td class='dk' style='padding:9px 12px;font-size:14px;word-break:break-word;" + (i ? "border-top:1px solid #E1E7F3;" : "") + "'>" + escaparHtml_(d[1]) + "</td></tr>";
      }).join("") + "</table>";
  }
  if (o.tablaHtml) h += "<div style='overflow-x:auto;-webkit-overflow-scrolling:touch;'>" + o.tablaHtml + "</div>";
  if (o.caja) {
    const k = colores[o.caja.tipo || "info"];
    h += "<div style='background:" + k[0] + ";border-left:5px solid " + k[1] + ";border-radius:10px;padding:12px 14px;margin:14px 0;font-size:14px;word-break:break-word;'>" +
      (o.caja.titulo ? "<b>" + escaparHtml_(o.caja.titulo) + "</b><br>" : "") + o.caja.texto + "</div>";
  }
  if (o.boton && o.boton.url) {
    h += "<p style='margin:20px 0 6px;text-align:center;'><a class='btn' href='" + o.boton.url + "' style='background:#41B6FF;color:#07043B;padding:14px 26px;text-decoration:none;border-radius:10px;font-weight:bold;font-size:15px;display:inline-block;'>" + escaparHtml_(o.boton.texto || "Abrir aplicativo") + "</a></p>";
  }
  if (o.nota) h += "<p style='margin:14px 0 0;color:#D90429;font-size:12px;'>" + o.nota + "</p>";
  h += "</td></tr><tr><td class='fpad' style='padding:6px 28px 24px;font-size:14px;'>" +
    "<p style='margin:14px 0 0;line-height:1.5;'>Cordialmente,<br><b style='color:#07043B;'>" + escaparHtml_(FIRMA_CORREO_LINEAS[0]) + "</b><br>" + escaparHtml_(FIRMA_CORREO_LINEAS[1]) + "<br>" + escaparHtml_(FIRMA_CORREO_LINEAS[2]) + "</p></td></tr>" +
    "<tr><td align='center' style='background:#F4F5FF;padding:14px 20px;font-size:11px;line-height:1.5;color:#667085;'>Mensaje automático. Por favor no responda a este correo.<br>Corporación Universitaria Americana · Institución de Educación Superior sujeta a inspección y vigilancia por el Ministerio de Educación Nacional</td></tr>" +
    "</table></div></body></html>";
  return h;
}

// Envía un correo con la plantilla institucional. opciones: { to, cc, subject }
function enviarCorreoInstitucional_(opciones, o) {
  const logo = obtenerLogo20Blob_();
  o.logo = !!logo;
  const m = { to: opciones.to, subject: opciones.subject, htmlBody: plantillaCorreo_(o) };
  if (opciones.cc) m.cc = opciones.cc;
  if (logo) m.inlineImages = { logo20: logo };
  if (opciones.attachments && opciones.attachments.length) m.attachments = opciones.attachments;
  m.name = "Financiamiento Estudiantil - Devoluciones Sede Barranquilla";
  MailApp.sendEmail(m);
}

function urlApp_() {
  try { return ScriptApp.getService().getUrl(); } catch (e) { return ""; }
}

function enviarCorreoRadicadoEstudiante_(payload, radicado) {
  const destinatario = MODO_PRUEBAS ? CORREO_PRUEBAS : payload.correoEstudiante;
  enviarCorreoInstitucional_({ to: destinatario, subject: "Solicitud de devolución radicada (" + radicado + ")" }, {
    etiqueta: "Solicitud recibida",
    titulo: "Hemos recibido su solicitud de devolución",
    saludo: "Cordial saludo, <b>" + escaparHtml_(payload.nombreEstudiante) + "</b>.",
    parrafos: ["Hemos recibido su solicitud de devolución de dinero para estudio. La recepción de los documentos <b>no implica aceptación</b> de la solicitud.",
      "El proceso de validación puede extenderse de <b>20 a 30 días hábiles</b>, excluyendo sábados, domingos y días festivos. Para consultar el estado necesitará su <b>radicado</b> o su <b>número de documento</b>."],
    caja: { tipo: "info", titulo: "Número de radicado", texto: "<span style='font-size:24px;font-weight:bold;color:#07043B;'>" + escaparHtml_(radicado) + "</span>" },
    progreso: { fase: 1, tipo: "info" },
    datos: [["Programa", payload.programa], ["Periodo", payload.periodo], ["Motivo", payload.motivo]],
    boton: urlApp_() ? { texto: "Consultar estado de mi solicitud", url: urlApp_() } : null,
    nota: MODO_PRUEBAS ? "<b>Modo pruebas:</b> correo real del estudiante: " + escaparHtml_(payload.correoEstudiante) : ""
  });
}

function enviarCorreoAlertaAdmin_(payload, radicado) {
  enviarCorreoInstitucional_({ to: obtenerCorreoPorRol_("ADMIN"), subject: "Nueva solicitud de devolución pendiente de revisión (" + radicado + ")" }, {
    etiqueta: "Nueva solicitud",
    titulo: "Se recibió una nueva solicitud de devolución",
    subtitulo: "Pendiente de revisión · Financiamiento",
    parrafos: ["Ingrese al aplicativo con el perfil administrador para revisar los soportes y continuar el trámite."],
    datos: [["Radicado", radicado], ["Estudiante", payload.nombreEstudiante + " — " + payload.documentoEstudiante],
      ["Programa", payload.programa + " (" + payload.nivel + " - " + payload.modalidad + ")"], ["Periodo", payload.periodo], ["Motivo", payload.motivo]],
    boton: urlApp_() ? { texto: "Abrir aplicativo", url: urlApp_() } : null,
  });
}

const TITULOS_ESTADO = {
  "ENVIADA A JEFATURA": ["Solicitudes pendientes por aprobación de Jefatura de Financiamiento", "Financiamiento revisó y envió solicitudes para su aprobación."],
  "ENVIADA A CARTERA": ["Solicitudes pendientes por revisión de Cartera", "La Jefatura de Financiamiento aprobó y envió solicitudes para su revisión."],
  "ENVIADA A CONTROL INTERNO": ["Solicitudes pendientes por revisión de Control Interno", "Cartera aprobó y envió solicitudes para su revisión."],
  "ENVIADA A TESORERÍA": ["Solicitudes pendientes por gestión de pago", "Control Interno aprobó y envió solicitudes a Tesorería."],
  "DEVUELTA POR JEFATURA": ["Solicitudes devueltas a Financiamiento", "La Jefatura de Financiamiento devolvió solicitudes con novedad."],
  "DEVUELTA POR CARTERA": ["Solicitudes devueltas a Financiamiento", "Cartera devolvió solicitudes con novedad."],
  "DEVUELTA POR CONTROL INTERNO": ["Solicitudes devueltas a Financiamiento", "Control Interno devolvió solicitudes con novedad."],
  "DEVUELTA POR TESORERÍA": ["Solicitudes devueltas a Financiamiento", "Tesorería devolvió solicitudes con novedad."]
};

const MENSAJES_ESTUDIANTE = {
  "PENDIENTE SUBSANACIÓN": ["Solicitud pendiente de subsanación", "Su solicitud requiere ajuste o complemento de información. Ingrese a Consultar estado con su radicado y documento para cargar el nuevo PDF."],
  "RECHAZADA POR FINANCIAMIENTO": ["Solicitud no aprobada", "Después de la revisión realizada, la solicitud no fue aprobada por Financiamiento."],
  "PAGO PROGRAMADO": ["Pago programado", "Tesorería registró la programación del pago correspondiente a su solicitud."],
  "PAGO REALIZADO": ["Solicitud finalizada", "Tesorería registró el pago realizado o gestionado. Su solicitud ha sido finalizada."]
};

function notificarCambios_(items, numLote) {
  const grupos = {};
  items.forEach(function(it) {
    if (!it) return;
    const esIcetex = up_(it.tipo) === "ICETEX";
    if (ESTADOS_ESTUDIANTE.indexOf(it.nuevoEstado) >= 0) {
      if (!esIcetex) { try { enviarCorreoEstudianteEstado_(it); } catch (e) { Logger.log(e.message); } }
      if (ESTADOS_CON_COPIA.indexOf(it.nuevoEstado) >= 0) { try { enviarCorreoTrazaCoordinadores_(it); } catch (e2) { Logger.log(e2.message); } }
      return;
    }
    if (!DESTINO_POR_ESTADO[it.nuevoEstado]) return;
    if (NOTIFICAR_AVANCE_ESTUDIANTE && !esIcetex && !it.reenvio && CORREO_ESTUDIANTE_POR_ESTADO[it.nuevoEstado] && it.correoEstudiante) {
      try { enviarCorreoEstudianteEstado_(it); } catch (e3) { Logger.log(e3.message); }
    }
    const kg = it.nuevoEstado + "|" + (esIcetex ? "ICETEX" : "") + "|" + (it.reenvio ? "REENVIO" : "");
    (grupos[kg] = grupos[kg] || []).push(it);
  });

  Object.keys(grupos).forEach(function(kg) {
    try { enviarCorreoInternoLote_(kg.split("|")[0], grupos[kg], numLote); } catch (e) { Logger.log(e.message); }
  });
}

function enviarCorreoInternoLote_(estado, lista, numLote) {
  const esIcx = up_(lista[0].tipo) === "ICETEX";
  const esReenvio = !!lista[0].reenvio;
  const rolDestino = (esIcx && estado.indexOf("DEVUELTA") === 0) ? "ICETEX" : DESTINO_POR_ESTADO[estado];
  const destinatario = obtenerCorreoPorRol_(rolDestino);
  const t = TITULOS_ESTADO[estado];
  const esSubs = !!lista[0].etiquetaEstado;
  const titulo = esReenvio ? "Solicitudes corregidas y reenviadas a Cartera" : esSubs ? "Subsanaciones recibidas pendientes de revisión de Financiamiento" : ((esIcx && estado.indexOf("DEVUELTA") === 0) ? "Solicitudes devueltas a ICETEX para corrección" : t[0]);
  const esIcetexNuevo = estado === "ENVIADA A JEFATURA" && up_(lista[0].tipo) === "ICETEX";
  const mensaje = esReenvio ? "Financiamiento corrigió las solicitudes que Cartera había devuelto y las reenvió directamente a Cartera para su revisión (no pasan nuevamente por Jefatura de Financiamiento)." : esSubs ? "El estudiante cargó la documentación solicitada." : (esIcetexNuevo ? "El perfil ICETEX radicó o corrigió solicitudes de devolución a ICETEX y las envió para su aprobación." : ((esIcx && estado.indexOf("DEVUELTA") === 0) ? t[1].replace("Financiamiento", "ICETEX") + " Ingrese al aplicativo para corregirlas y reenviarlas a Jefatura de Financiamiento." : t[1]));
  const devuelta = estado.indexOf("DEVUELTA") === 0;

  const th = "padding:8px;border:1px solid #E1E7F3;font-size:12px;";
  const filas = lista.map(function(it) {
    return "<tr><td style='" + th + "'>" + escaparHtml_(it.radicado) + "</td><td style='" + th + "'>" + escaparHtml_(it.nombre) + "</td>" +
      "<td style='" + th + "'>" + escaparHtml_(it.programa) + "</td><td style='" + th + "'>" + escaparHtml_(it.observacion || "") + "</td></tr>";
  }).join("");
  const tabla = "<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='border-collapse:collapse;margin:14px 0;'>" +
    "<tr style='background:#F4F5FF;color:#07043B;'><th align='left' style='" + th + "'>Radicado</th><th align='left' style='" + th + "'>Estudiante</th><th align='left' style='" + th + "'>Programa</th><th align='left' style='" + th + "'>Observación</th></tr>" + filas + "</table>";

  const plazo = PLAZOS_ALERTA.filter(function(p) { return p.rol === rolDestino; })[0];
  const cc = copiaCoordinadores_(estado);
  enviarCorreoInstitucional_({ to: destinatario, cc: cc.cc, subject: titulo + " (" + lista.length + ")" }, {
    etiqueta: esReenvio ? "Reenviada" : esSubs ? "Subsanación" : (devuelta ? "Devuelta con novedad" : "Nueva recepción"),
    titulo: titulo,
    subtitulo: "Trazabilidad interna · " + (numLote ? "Lote " + numLote : "Devoluciones"),
    parrafos: [escaparHtml_(mensaje) + " <b>" + lista.length + "</b> solicitud(es)" + (numLote ? " — lote <b>" + escaparHtml_(numLote) + "</b>" : "") + "."],
    tablaHtml: tabla,
    caja: plazo && !devuelta && !esSubs ? { tipo: "alerta", titulo: "Plazo de gestión", texto: "Se espera la gestión de estas solicitudes dentro de <b>" + plazo.dias + " días calendario</b> desde su recepción en " + escaparHtml_(plazo.area) + "." } : null,
    boton: urlApp_() ? { texto: "Abrir aplicativo", url: urlApp_() } : null,
    nota: cc.nota ? cc.nota.replace(/<[^>]+>/g, "") : "",
  });
}

// Devuelve los correos en copia (solo fuera de pruebas) y una nota informativa cuando está en pruebas.
function copiaCoordinadores_(estado) {
  if (ESTADOS_CON_COPIA.indexOf(estado) < 0) return { cc: "", nota: "" };
  if (MODO_PRUEBAS) {
    return { cc: "", nota: "<p style='color:#D90429;font-size:12px;padding:0 24px;'><b>Modo pruebas:</b> en producción este correo iría con copia a " + escaparHtml_(CORREOS_COPIA_COORDINADORES.join(", ")) + ".</p>" };
  }
  return { cc: CORREOS_COPIA_COORDINADORES.join(","), nota: "" };
}

// Aviso de trazabilidad para coordinadores cuando el resultado va al estudiante (pago programado / realizado).
function enviarCorreoTrazaCoordinadores_(it) {
  const t = CORREO_ESTUDIANTE_POR_ESTADO[it.nuevoEstado];
  if (!t) return;
  const cc = copiaCoordinadores_(it.nuevoEstado);
  const o = { to: obtenerCorreoPorRol_("ADMIN"), subject: "Trazabilidad de devoluciones: " + (t.asunto || t.titulo) + " (" + it.radicado + ")" };
  if (cc.cc) o.cc = cc.cc;
  const adjT = adjuntoComprobante_(it);
  if (adjT) o.attachments = [adjT];
  enviarCorreoInstitucional_(o, {
    etiqueta: "Trazabilidad",
    titulo: t.titulo,
    subtitulo: "Seguimiento interno · Financiamiento",
    datos: [["Radicado", it.radicado], ["Estudiante", it.nombre], ["Programa", it.programa || ""], ["Observación", it.observacion || "—"]],
    nota: cc.nota ? cc.nota.replace(/<[^>]+>/g, "") : "",
  });
}

// Devuelve el PDF del comprobante de pago (si existe) listo para adjuntar al correo.
function adjuntoComprobante_(it) {
  if (it.nuevoEstado !== "PAGO REALIZADO" || !it.comprobanteUrl) return null;
  try {
    const f = archivoPorUrl_(it.comprobanteUrl);
    if (!f) return null;
    if (f.getSize() > MAX_ADJUNTO_CORREO_BYTES) { Logger.log("Comprobante demasiado grande para adjuntar al correo (" + f.getSize() + " bytes)."); return null; }
    return f.getBlob().setName("Comprobante de pago - " + it.radicado + ".pdf");
  } catch (e) { Logger.log("Comprobante no adjuntado: " + e.message); return null; }
}

function enviarCorreoEstudianteEstado_(it) {
  const t = CORREO_ESTUDIANTE_POR_ESTADO[it.nuevoEstado];
  if (!t) return;
  const destinatario = MODO_PRUEBAS ? CORREO_PRUEBAS : it.correoEstudiante;
  const adj = adjuntoComprobante_(it);
  const mostrarObs = it.observacion && it.nuevoEstado !== "PAGO REALIZADO" && it.nuevoEstado !== "PAGO PROGRAMADO" && it.nuevoEstado.indexOf("ENVIADA") !== 0;
  const opcMail = { to: destinatario, subject: (t.asunto || t.titulo) + " (" + it.radicado + ")" };
  if (adj) opcMail.attachments = [adj];
  enviarCorreoInstitucional_(opcMail, {
    etiqueta: FASES_CORREO[Math.min(t.fase, FASES_CORREO.length - 1)],
    titulo: t.titulo,
    saludo: "Cordial saludo, <b>" + escaparHtml_(it.nombre) + "</b>.",
    parrafos: [escaparHtml_(t.mensaje)].concat(it.nuevoEstado === "PAGO REALIZADO" && !adj ? ["<b>Nota:</b> el comprobante de pago no pudo adjuntarse a este correo (supera el tamaño permitido por el correo); solicítelo a Financiamiento."] : []),
    progreso: { fase: t.fase, tipo: t.tipo },
    datos: [["Radicado", it.radicado], ["Programa", it.programa || ""]],
    caja: mostrarObs ? { tipo: t.tipo === "error" ? "error" : "alerta", titulo: "Observación", texto: escaparHtml_(it.observacion) } : null,
    boton: urlApp_() ? { texto: t.tipo === "alerta" ? "Cargar subsanación" : "Consultar estado", url: urlApp_() } : null,
    nota: MODO_PRUEBAS ? "<b>Modo pruebas:</b> correo real del estudiante: " + escaparHtml_(it.correoEstudiante) : ""
  });
}

function obtenerCorreoPorRol_(rolBuscado) {
  const ss = SpreadsheetApp.openById(APP_SPREADSHEET_ID);
  const hoja = ss.getSheetByName(HOJA_USUARIOS);
  if (!hoja || hoja.getLastRow() < 2) return CORREO_ADMIN;

  const datos = hoja.getDataRange().getValues();
  const m = mapaCols_(datos[0]);
  const correos = [];
  for (let i = 1; i < datos.length; i++) {
    const correo = String(g_(datos[i], m, "Correo") || "").trim();
    if (rolNorm_(g_(datos[i], m, "Rol")) === rolNorm_(rolBuscado) && up_(g_(datos[i], m, "Estado")) === "ACTIVO" && correo && correos.indexOf(correo) < 0) correos.push(correo);
  }
  return correos.length ? correos.join(",") : CORREO_ADMIN;
}

/*************************************************
 * HISTORIAL
 *************************************************/

function filaHistorial_(d) {
  const fecha = new Date();
  return [
    fecha, Utilities.formatDate(fecha, Session.getScriptTimeZone(), "HH:mm:ss"),
    d.radicado || "", d.usuario || "", d.rol || "", d.accion || "",
    d.estadoAnterior || "", d.estadoNuevo || "", d.etapaAnterior || "", d.etapaNueva || "",
    d.responsableAnterior || "", d.responsableNuevo || "", d.observacion || ""
  ];
}

function registrarHistorial_(d) {
  const ss = d.ss || SpreadsheetApp.openById(APP_SPREADSHEET_ID);
  registrarHistorialLote_(ss, [d]);
}

function registrarHistorialLote_(ss, lista) {
  let hoja = ss.getSheetByName(HOJA_HISTORIAL);
  if (!hoja || hoja.getLastRow() < 1) { prepararHojaHistorial_(ss); hoja = ss.getSheetByName(HOJA_HISTORIAL); }
  const filas = lista.map(filaHistorial_);
  hoja.getRange(hoja.getLastRow() + 1, 1, filas.length, filas[0].length).setValues(filas);
}

/*************************************************
 * UTILIDADES
 *************************************************/

function leerSolicitudes_() {
  const ss = SpreadsheetApp.openById(APP_SPREADSHEET_ID);
  if (!ss.getSheetByName(HOJA_PERIODOS) || leerPeriodos_(ss).length === 0) {
    if (!ss.getSheetByName(HOJA_SOLICITUDES)) throw new Error("No existe la hoja Solicitudes. Ejecute crearEstructuraAplicativo().");
    prepararHojaPeriodos_(ss);
  }
  const periodos = leerPeriodos_(ss);
  const hojas = [], periodoDeHoja = {};
  periodos.forEach(function(p) {
    if (p.hoja && !periodoDeHoja[p.hoja] && ss.getSheetByName(p.hoja)) { periodoDeHoja[p.hoja] = p.periodo; hojas.push(p.hoja); }
  });
  if (!hojas.length) throw new Error("No hay hojas de periodos. Ejecute crearEstructuraAplicativo().");

  let enc = null, m = null;
  const filas = [], origen = [];
  hojas.forEach(function(nombre) {
    const hoja = ss.getSheetByName(nombre);
    const lastCol = hoja.getLastColumn(), lastRow = hoja.getLastRow();
    if (lastCol < 1) return;
    const encs = hoja.getRange(1, 1, 1, lastCol).getValues()[0];
    if (!enc) { enc = encs; m = mapaCols_(enc); }
    const mh = mapaCols_(encs);
    const map = enc.map(function(h) { const j = mh[normalizarTexto_(h)]; return j === undefined ? -1 : j; });
    if (lastRow > 1) {
      hoja.getRange(2, 1, lastRow - 1, lastCol).getValues().forEach(function(raw, k) {
        filas.push(map.map(function(j) { return j < 0 ? "" : raw[j]; }));
        origen.push({ hoja: hoja, fila: k + 2, map: map, raw: raw });
      });
    }
  });
  if (!enc) throw new Error("No se encontraron encabezados en las hojas de solicitudes.");

  // Valores por defecto en memoria para filas anteriores a los periodos / al perfil ICETEX.
  const iPR = m[normalizarTexto_("Periodo recepción")], iTipo = m[normalizarTexto_("Tipo solicitud")];
  filas.forEach(function(f, i) {
    if (iPR !== undefined && !f[iPR]) f[iPR] = periodoDeHoja[origen[i].hoja.getName()] || "";
    if (iTipo !== undefined && !f[iTipo]) f[iTipo] = "ESTUDIANTE";
  });

  const activo = periodoActivo_(ss);
  return { ss: ss, hoja: ss.getSheetByName(activo ? activo.hoja : hojas[0]) || ss.getSheetByName(hojas[0]), encabezados: enc, filas: filas, m: m,
    origen: origen, periodos: periodos, periodoDeHoja: periodoDeHoja, activo: activo };
}

function buscarPos_(ctx, radicado) {
  const r = String(radicado || "").trim();
  for (let i = 0; i < ctx.filas.length; i++) {
    if (String(g_(ctx.filas[i], ctx.m, "Radicado")).trim() === r) return i;
  }
  return -1;
}

function escribirFila_(ctx, pos, fila) {
  const o = ctx.origen[pos];
  const row = o.raw.slice();
  ctx.encabezados.forEach(function(h, i) { if (o.map[i] >= 0) row[o.map[i]] = fila[i]; });
  const rango = o.hoja.getRange(o.fila, 1, 1, row.length);
  rango.clearDataValidations();
  rango.setValues([row]);
  o.raw = row;
  ctx.filas[pos] = fila;
}

function objetoSolicitud_(ctx, fila, hoy) {
  const tz = Session.getScriptTimeZone();
  const o = {};
  ctx.encabezados.forEach(function(h, i) {
    let v = fila[i];
    if (h === "Periodo") v = periodoTexto_(v);
    else if (v instanceof Date) v = Utilities.formatDate(v, tz, h === "Hora solicitud" ? "HH:mm:ss" : "dd/MM/yyyy HH:mm");
    else v = v === null || v === undefined ? "" : String(v);
    if (v !== "") o[h] = v;
  });

  const ini = g_(fila, ctx.m, "Fecha solicitud");
  const ult = g_(fila, ctx.m, "Última actualización");
  const fin = esFinal_(g_(fila, ctx.m, "Estado actual")) && ult instanceof Date ? ult : hoy;
  o["Días en proceso"] = String(diasHabiles_(ini, fin));
  return o;
}

function mapaCols_(enc) {
  const m = {};
  enc.forEach(function(h, i) { m[normalizarTexto_(h)] = i; });
  return m;
}

function g_(fila, m, nombre) {
  const i = m[normalizarTexto_(nombre)];
  return i === undefined ? "" : fila[i];
}

function s_(fila, m, nombre, valor) {
  const i = m[normalizarTexto_(nombre)];
  if (i === undefined) throw new Error("Falta la columna \"" + nombre + "\" en la hoja. Ejecute crearEstructuraAplicativo().");
  fila[i] = valor;
}

function obtenerOCrearHoja_(ss, nombre) {
  return ss.getSheetByName(nombre) || ss.insertSheet(nombre);
}

function asegurarEncabezados_(hoja, encabezados, color) {
  if (hoja.getLastRow() < 1) {
    hoja.getRange(1, 1, 1, encabezados.length).setValues([encabezados]);
  } else {
    const actuales = hoja.getRange(1, 1, 1, Math.max(hoja.getLastColumn(), 1)).getValues()[0].map(normalizarTexto_);
    encabezados.forEach(function(e) {
      if (actuales.indexOf(normalizarTexto_(e)) < 0) {
        hoja.getRange(1, hoja.getLastColumn() + 1).setValue(e);
        actuales.push(normalizarTexto_(e));
      }
    });
  }

  hoja.getRange(1, 1, 1, hoja.getLastColumn())
    .setFontWeight("bold").setBackground(color).setFontColor("#FFFFFF")
    .setHorizontalAlignment("center").setVerticalAlignment("middle").setWrap(true);
  hoja.getDataRange().setFontFamily("Arial").setFontSize(10).setVerticalAlignment("middle");
}

// Tolera "Control Interno", "CONTROL INTERNO", "control-interno", "Tesorería", etc.
function rolNorm_(x) {
  return normalizarTexto_(x).toUpperCase().replace(/[\s\-]+/g, "_");
}

function up_(x) {
  return String(x === null || x === undefined ? "" : x).trim().toUpperCase();
}

function normalizarTexto_(texto) {
  return texto === null || texto === undefined || texto === ""
    ? ""
    : texto.toString().trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

function limpiarNombreArchivo_(texto) {
  return String(texto).replace(/[\\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
}

function escaparHtml_(texto) {
  if (texto === null || texto === undefined) return "";
  return String(texto).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function formatearFecha_(fecha) {
  if (!fecha) return "";
  const f = new Date(fecha);
  if (isNaN(f.getTime())) return String(fecha);
  return Utilities.formatDate(f, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
}

function validarCorreo_(correo) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(correo || "").trim());
}

function numeroSeguro_(valor) {
  if (typeof valor === "number") return isNaN(valor) ? 0 : valor;
  let t = String(valor || "").trim();
  if (!t) return 0;
  t = t.replace(/[^0-9,.-]/g, "");
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  else if (t.indexOf(",") >= 0 && t.indexOf(".") >= 0) t = t.replace(/\./g, "").replace(",", ".");
  else if (t.indexOf(",") >= 0) t = t.replace(/,/g, "");
  const n = Number(t);
  return isNaN(n) ? 0 : n;
}

/*************************************************
 * AUTORIZACIÓN INICIAL (ejecutar una vez desde el editor)
 *************************************************/

function autorizarAplicativoDevoluciones() {
  crearEstructuraAplicativo();
  DriveApp.getFolderById(APP_FOLDER_ID);
  // Prueba de exportación (autoriza hojas de cálculo, Drive y conexiones externas).
  const tmp = SpreadsheetApp.create("prueba-permisos");
  exportarHoja_(tmp, "pdf");
  eliminarTemporal_(tmp);
  MailApp.sendEmail({
    to: CORREO_ADMIN,
    subject: "Devoluciones Sede Barranquilla: permisos del aplicativo autorizados",
    body: "El aplicativo de devoluciones quedó autorizado correctamente."
  });
  return "Permisos autorizados correctamente.";
}
