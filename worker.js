/* worker.js — Taller Motor Norte · servidor de la demo (Cloudflare Worker + base de datos D1).
   Responde /api/*; el resto son los archivos de la web (assets).

   Público (la web y el asistente):
     GET  /api/web                     servicios visibles, contacto y horario
     GET  /api/huecos?fecha=AAAA-MM-DD  horas libres para pedir cita ese día
     POST /api/citas                   pedir cita (se guarda de verdad y devuelve la confirmación del servidor)
     GET  /api/seguimiento?m=MATRÍCULA en qué paso está la reparación (sin datos personales)
     POST /api/seguimiento/aprobar     aprobar el presupuesto (matrícula + 4 últimas cifras del teléfono)
     GET  /api/foto/<id>               fotos subidas desde el panel
   Panel del taller (/api/admin/*, con sesión):
     login · salir · yo · resumen · citas · citas/guardar · citas/config · reparaciones · reparaciones/guardar
     reparaciones/paso · reparaciones/borrar · facturas · facturas/nueva · facturas/anular · servicios
     servicios/guardar · servicios/borrar · servicios/foto · misdatos
   Contraseña del panel: secreto ADMIN_HASH (sha256 de la contraseña). Sin él, la demo usa «taller-demo»
   y se rellena con datos de ejemplo (facturas de los últimos 14 meses, citas y reparaciones). */

const te = new TextEncoder();
const PASOS = ["Recibido en el taller", "Diagnóstico", "Presupuesto enviado", "En reparación", "Listo para recoger", "Entregado"];
const CATS = { mant: "Mantenimiento", seg: "Seguridad", elec: "Electrónica y confort" };
const HORARIO = [[["08:30", "13:30"], ["15:30", "19:30"]], [["08:30", "13:30"], ["15:30", "19:30"]], [["08:30", "13:30"], ["15:30", "19:30"]], [["08:30", "13:30"], ["15:30", "19:30"]], [["08:30", "13:30"], ["15:30", "19:30"]], [["09:00", "13:00"]], []];
const METODOS = { tarjeta: "Tarjeta", efectivo: "Efectivo", bizum: "Bizum", transferencia: "Transferencia" };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    try { return await api(request, env, url); }
    catch (e) { console.log("error", e && e.stack || e); return json({ error: "Error del servidor. Inténtalo de nuevo en un momento." }, 500); }
  },
};

/* ------------------------------------------------------------------ utilidades */
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers } });
}
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (t) => hex(await crypto.subtle.digest("SHA-256", te.encode(t)));
const azar = (n = 32) => hex(crypto.getRandomValues(new Uint8Array(n)));
function igual(a, b) { a = String(a); b = String(b); if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
const limpiar = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const texto = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u0009\u000b-\u001f<>]/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, n);
const emailOk = (e) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(e);
const telOk = (t) => /^\+?[0-9 ]{9,15}$/.test(t);
const fechaOk = (f) => /^\d{4}-\d{2}-\d{2}$/.test(f) && !isNaN(Date.parse(f + "T12:00:00Z"));
const horaOk = (h) => /^\d{2}:\d{2}$/.test(h);
const r2 = (n) => Math.round(n * 100) / 100;
const matricula = (v) => { const s = String(v || "").toUpperCase().replace(/[^0-9A-Z]/g, ""); return /^\d{4}[BCDFGHJKLMNPRSTVWXYZ]{3}$/.test(s) || /^[A-Z]{1,2}\d{4}[A-Z]{0,2}$/.test(s) ? s : ""; };
const conEspacio = (m) => /^\d{4}[A-Z]{3}$/.test(m) ? m.slice(0, 4) + " " + m.slice(4) : m;
async function cuerpo(request) { try { return await request.json(); } catch { return {}; } }
function cookie(request, nombre) { const m = (request.headers.get("Cookie") || "").match(new RegExp("(?:^|;\\s*)" + nombre + "=([^;]+)")); return m ? decodeURIComponent(m[1]) : ""; }
const setCookie = (n, v, seg) => `${n}=${v}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${seg}`;
const ip = (r) => r.headers.get("CF-Connecting-IP") || "x";
function ahoraLocal() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour === "24" ? "00" : p.hour}:${p.minute}` };
}
const sumaDias = (f, n) => { const d = new Date(f + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diaSemana = (f) => (new Date(f + "T12:00:00Z").getUTCDay() + 6) % 7; // 0 = lunes
const minutos = (h) => +h.slice(0, 2) * 60 + +h.slice(3);
const hh = (m) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");

async function demasiados(env, clave, max = 8, mins = 15) {
  const ahora = Date.now();
  const r = await env.DB.prepare("SELECT n, hasta FROM intentos WHERE clave = ?").bind(clave).first();
  if (r && r.hasta > ahora && r.n >= max) return true;
  if (!r || r.hasta <= ahora) await env.DB.prepare("INSERT OR REPLACE INTO intentos (clave, n, hasta) VALUES (?, 1, ?)").bind(clave, ahora + mins * 6e4).run();
  else await env.DB.prepare("UPDATE intentos SET n = n + 1 WHERE clave = ?").bind(clave).run();
  return false;
}
async function ajustes(env) { const { results } = await env.DB.prepare("SELECT k, v FROM ajustes").all(); return Object.fromEntries((results || []).map((r) => [r.k, r.v])); }
async function ponAjuste(env, k, v) { await env.DB.prepare("INSERT INTO ajustes (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(k, v == null ? "" : String(v)).run(); }

/* ------------------------------------------------------------------ base de datos */
let preparado = false;
async function preparar(env) {
  if (preparado) return;
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS ajustes (k TEXT PRIMARY KEY, v TEXT)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS sesiones (token TEXT PRIMARY KEY, expira TEXT)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS intentos (clave TEXT PRIMARY KEY, n INTEGER, hasta INTEGER)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS fotos (id TEXT PRIMARY KEY, tipo TEXT, datos TEXT, creada TEXT DEFAULT (datetime('now')))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS servicios (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, nombre TEXT, cat TEXT, descr TEXT, specs TEXT, precio REAL, etiqueta TEXT, imagen TEXT, visible INTEGER DEFAULT 1, orden INTEGER DEFAULT 0)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS citas (id INTEGER PRIMARY KEY AUTOINCREMENT, fecha TEXT, hora TEXT, nombre TEXT, telefono TEXT, vehiculo TEXT, servicio TEXT, notas TEXT, estado TEXT DEFAULT 'pendiente', origen TEXT, creada TEXT DEFAULT (datetime('now')))"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS citas_f ON citas (fecha, hora)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS reparaciones (id INTEGER PRIMARY KEY AUTOINCREMENT, matricula TEXT, vehiculo TEXT, cliente TEXT, tel4 TEXT, mecanico TEXT, paso INTEGER DEFAULT 0, nota TEXT, entrega TEXT, presupuesto TEXT, aprobado INTEGER DEFAULT 0, foto TEXT, historial TEXT, activa INTEGER DEFAULT 1, actualizada TEXT)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS rep_m ON reparaciones (matricula, activa)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS facturas (id INTEGER PRIMARY KEY AUTOINCREMENT, anio INTEGER, numero INTEGER, fecha TEXT, hora TEXT, cliente TEXT, cliente_nif TEXT, cliente_dir TEXT, vehiculo TEXT, lineas TEXT, base REAL, iva REAL, total REAL, pct REAL, metodo TEXT, servicio TEXT, anulada INTEGER DEFAULT 0, creada TEXT DEFAULT (datetime('now')), UNIQUE (anio, numero))"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS fac_f ON facturas (fecha)"),
  ]);
  await sembrar(env);
  preparado = true;
}

const SERVICIOS = [
  ["aceite", "Cambio de aceite y filtros", "mant", "Aceite sintético, filtro de aceite y revisión de niveles.", "Aceite sintético homologado por el fabricante\nFiltro de aceite nuevo\nRevisión de 20 puntos y niveles\nSello en el libro de mantenimiento", 69, "Más pedido", "img/aceite"],
  ["distribucion", "Kit de distribución", "mant", "Correa, tensor y bomba de agua cuando corresponde.", "Correa, tensores y rodillos\nBomba de agua si el fabricante lo indica\nLíquido refrigerante nuevo", 290, "", "img/distribucion"],
  ["aire", "Aire acondicionado", "elec", "Recarga, desinfección y comprobación de fugas.", "Recarga de gas por peso\nPrueba de estanqueidad\nDesinfección del circuito", 59, "", "img/aire"],
  ["frenos", "Frenos", "seg", "Pastillas y discos con prueba en carretera.", "Pastillas y/o discos\nRevisión del líquido de frenos\nPrueba en carretera", 89, "", "img/frenos"],
  ["neumaticos", "Neumáticos", "seg", "Montaje, equilibrado y alineado.", "Montaje y equilibrado\nVálvula nueva\nAlineado opcional", 19, "Por rueda", "img/neumaticos"],
  ["bateria", "Batería", "elec", "Test de carga y sustitución con instalación.", "Test de batería y alternador\nBatería nueva con 2 años de garantía\nReciclaje de la usada", 95, "", "img/bateria"],
  ["itv", "Revisión pre-ITV", "seg", "Comprobamos luces, emisiones, frenos y más.", "Luces y señalización\nEmisiones y frenos\nInforme de lo que conviene arreglar antes", 39, "", "img/itv"],
  ["diagnosis", "Diagnosis electrónica", "elec", "Lectura de averías y borrado de testigos.", "Lectura de la centralita\nInforme con fotos por WhatsApp\nSe descuenta si haces la reparación", 35, "", "img/diagnosis"],
];

function azarFijo(semilla) { let h = 2166136261; for (const c of String(semilla)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1e6) / 1e6; }; }

async function sembrar(env) {
  const hay = await env.DB.prepare("SELECT COUNT(*) n FROM servicios").first();
  if (!hay.n) await env.DB.batch(SERVICIOS.map((s, i) => env.DB.prepare("INSERT OR IGNORE INTO servicios (slug, nombre, cat, descr, specs, precio, etiqueta, imagen, visible, orden) VALUES (?,?,?,?,?,?,?,?,1,?)").bind(s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7], i)));
  await env.DB.prepare("INSERT OR IGNORE INTO ajustes (k, v) VALUES ('capacidad', '2'), ('cerrado', '[]'), ('iva', '21')").run();
  if (env.ADMIN_HASH) return; // en real no se inventan datos
  const { fecha: hoy } = ahoraLocal();
  // datos del titular de ejemplo
  await env.DB.prepare("INSERT OR IGNORE INTO ajustes (k, v) VALUES ('f_razon','Motor Norte S.L. (ficticio)'),('f_nif','B12345678'),('f_dir','C/ Herreros, nave 14 · Polígono Las Eras'),('f_cp','39700 Castro Urdiales (Cantabria)'),('f_tel','628 22 47 19'),('f_email','info@agencia-js.com'),('f_gestoria','gestoria@ejemplo.es')").run();
  const fac = await env.DB.prepare("SELECT COUNT(*) n FROM facturas").first();
  if (!fac.n) {
    const rnd = azarFijo("tmn-facturas"), CL = ["Laura Gómez", "Javier Ruiz", "Marta Sánchez", "Pedro Alonso", "Ana Fernández", "Luis Martín", "Carmen Díaz", "Iñaki Etxeberria", "Rosa Pérez", "David Torres", "Sara López", "Jorge Herrera", "Elena Castro", "Miguel Ortega", "Lucía Vidal", "Transportes Cantábrico S.L.", "Raúl Moreno", "Nerea Gil"];
    const COCHE = ["Seat León", "VW Golf", "Renault Clio", "Peugeot 308", "Toyota Corolla", "Ford Focus", "Citroën C4", "Kia Ceed", "Dacia Sandero", "Opel Corsa", "Hyundai Tucson", "Ford Transit"];
    const TRAB = [["Cambio de aceite y filtros", "mant", 69, 130], ["Kit de distribución", "mant", 290, 620], ["Pastillas y discos de freno", "seg", 89, 340], ["Neumáticos (montaje y equilibrado)", "seg", 76, 420], ["Batería nueva", "elec", 95, 190], ["Revisión pre-ITV", "seg", 39, 70], ["Diagnosis electrónica", "elec", 35, 60], ["Recarga de aire acondicionado", "elec", 59, 95], ["Embrague", "mant", 480, 890], ["Amortiguadores", "seg", 220, 460]];
    const MES = [0.85, 0.9, 1.0, 1.05, 1.1, 1.2, 1.25, 0.7, 1.15, 1.05, 1.0, 1.2]; // agosto flojo, verano y diciembre fuertes
    const DIA = [1.25, 1.05, 1.0, 1.0, 1.15, 0.6, 0];
    const inicio = sumaDias(hoy.slice(0, 7) + "-01", -400), filas = [], num = {};
    for (let f = inicio; f <= hoy; f = sumaDias(f, 1)) {
      const d = diaSemana(f); if (!DIA[d]) continue;
      const base = 3.1 * MES[+f.slice(5, 7) - 1] * DIA[d];
      let n = Math.floor(base + rnd() * 1.6 - 0.4); if (f === hoy) n = Math.min(n, 2);
      for (let k = 0; k < n; k++) {
        const t = TRAB[Math.floor(rnd() * rnd() * TRAB.length)], total = r2(t[2] + rnd() * (t[3] - t[2])), anio = +f.slice(0, 4);
        num[anio] = (num[anio] || 0) + 1;
        const base_ = r2(total / 1.21), h = hh(510 + Math.floor(rnd() * 9) * 60 + (d === 5 ? 30 : 0) + Math.floor(rnd() * 50));
        filas.push([anio, num[anio], f, h, CL[Math.floor(rnd() * CL.length)], COCHE[Math.floor(rnd() * COCHE.length)] + " · " + String(1000 + Math.floor(rnd() * 8999)) + " " + ["KLM", "MNP", "LBC", "JRT", "HGF"][Math.floor(rnd() * 5)], JSON.stringify([{ c: t[0], i: total }]), base_, r2(total - base_), total, ["tarjeta", "tarjeta", "efectivo", "bizum", "transferencia"][Math.floor(rnd() * 5)], t[1]]);
      }
    }
    // pocas sentencias con muchas filas (datos propios de ejemplo, sin parámetros): así la primera visita gasta muy poca CPU
    const lit = (v) => typeof v === "number" ? String(v) : "'" + String(v).replace(/'/g, "''") + "'";
    const sentencias = [];
    for (let i = 0; i < filas.length; i += 150) sentencias.push(env.DB.prepare("INSERT OR IGNORE INTO facturas (anio, numero, fecha, hora, cliente, vehiculo, lineas, base, iva, total, metodo, servicio, pct) VALUES " + filas.slice(i, i + 150).map((x) => "(" + x.map(lit).join(",") + ",21)").join(",")));
    await env.DB.batch(sentencias);
  }
  const rep = await env.DB.prepare("SELECT COUNT(*) n FROM reparaciones").first();
  if (!rep.n) {
    const pres = JSON.stringify([{ c: "Pastillas delanteras", i: 72 }, { c: "Discos delanteros (par)", i: 98 }, { c: "Líquido de frenos", i: 24 }, { c: "Mano de obra (1,2 h)", i: 54 }]);
    const hist = (n) => JSON.stringify(PASOS.slice(0, n + 1).map((p, i) => ({ p: i, t: hoy + " " + hh(522 + i * 70) })));
    await env.DB.batch([
      env.DB.prepare("INSERT INTO reparaciones (matricula, vehiculo, cliente, tel4, mecanico, paso, nota, entrega, presupuesto, foto, historial, actualizada) VALUES ('1234KLM','Seat León','Cliente de ejemplo','4719','Javi',2,'Hemos revisado los frenos: te enviamos el presupuesto para que lo apruebes.','hoy 18:30',?, 'img/frenos', ?, datetime('now'))").bind(pres, hist(2)),
      env.DB.prepare("INSERT INTO reparaciones (matricula, vehiculo, cliente, tel4, mecanico, paso, nota, entrega, presupuesto, aprobado, foto, historial, actualizada) VALUES ('5678MNP','Peugeot 308','Cliente de ejemplo','1111','Marta',3,'Cambiando el kit de distribución.','mañana 13:00',?,1,'img/distribucion', ?, datetime('now'))").bind(JSON.stringify([{ c: "Kit de distribución con bomba de agua", i: 389 }, { c: "Mano de obra (3,5 h)", i: 158 }]), hist(3)),
      env.DB.prepare("INSERT INTO reparaciones (matricula, vehiculo, cliente, tel4, mecanico, paso, nota, entrega, presupuesto, aprobado, foto, historial, actualizada) VALUES ('9012LBC','Renault Clio','Cliente de ejemplo','2222','Javi',4,'¡Listo! Lavado de cortesía incluido.','ya está listo',?,1,'img/aceite', ?, datetime('now'))").bind(JSON.stringify([{ c: "Cambio de aceite y filtros", i: 89 }]), hist(4)),
    ]);
  }
  const ci = await env.DB.prepare("SELECT COUNT(*) n FROM citas").first();
  if (!ci.n) {
    const C = [[0, "Ana Fernández", "Kia Ceed · 3344 JRT", "Revisión pre-ITV", "confirmada"], [1, "Pedro Alonso", "Ford Focus · 8877 HGF", "Frenos", "pendiente"], [1, "Rosa Pérez", "Opel Corsa · 1029 LBC", "Cambio de aceite y filtros", "confirmada"], [2, "Luis Martín", "Toyota Corolla · 5521 MNP", "Diagnosis electrónica", "pendiente"], [4, "Elena Castro", "VW Golf · 7410 KLM", "Neumáticos", "confirmada"]];
    let k = 0;
    for (const c of C) {
      let f = sumaDias(hoy, c[0]); while (diaSemana(f) === 6) f = sumaDias(f, 1);
      const hs = franjas(f); if (!hs.length) continue;
      await env.DB.prepare("INSERT INTO citas (fecha, hora, nombre, telefono, vehiculo, servicio, notas, estado, origen) VALUES (?,?,?,?,?,?,?,?, 'web')").bind(f, hs[(k++ * 3) % hs.length], c[1], "600 000 00" + k, c[2], c[3], "", c[4]).run();
    }
  }
}

/* ------------------------------------------------------------------ citas: horas disponibles */
function franjas(fecha) { // horas de inicio de cita (cada hora) según el horario del taller
  const out = [];
  for (const [a, b] of HORARIO[diaSemana(fecha)] || []) for (let m = minutos(a); m + 60 <= minutos(b); m += 60) out.push(hh(m));
  return out;
}
async function huecos(env, fecha) {
  const aj = await ajustes(env), cap = Math.min(Math.max(+aj.capacidad || 2, 1), 10);
  let cerrado = []; try { cerrado = JSON.parse(aj.cerrado || "[]"); } catch {}
  const { fecha: hoy, hora } = ahoraLocal();
  if (fecha < hoy || fecha > sumaDias(hoy, 60) || cerrado.includes(fecha)) return { fecha, cerrado: true, horas: [] };
  const { results } = await env.DB.prepare("SELECT hora, COUNT(*) n FROM citas WHERE fecha = ? AND estado != 'anulada' GROUP BY hora").bind(fecha).all();
  const ocup = Object.fromEntries((results || []).map((r) => [r.hora, r.n]));
  const horas = franjas(fecha).filter((h) => fecha > hoy || minutos(h) >= minutos(hora) + 60).map((h) => ({ hora: h, libre: (ocup[h] || 0) < cap }));
  return { fecha, cerrado: !horas.length, horas };
}

/* ------------------------------------------------------------------ rutas */
async function api(request, env, url) {
  const p = url.pathname, m = request.method;
  if (m === "POST" && request.headers.get("Origin") && request.headers.get("Origin") !== url.origin) return json({ error: "Origen no permitido" }, 403);
  if (!env.DB) return json({ error: "Base de datos no configurada" }, 503);
  await preparar(env);
  if (p === "/api/web" && m === "GET") return json(await web(env), 200, { "Cache-Control": "public, max-age=20" });
  if (p === "/api/huecos" && m === "GET") { const f = url.searchParams.get("fecha") || ""; return fechaOk(f) ? json(await huecos(env, f)) : json({ error: "Fecha no válida" }, 400); }
  if (p === "/api/citas" && m === "POST") return await pedirCita(request, env);
  if (p === "/api/seguimiento" && m === "GET") return await seguimiento(request, env, url);
  if (p === "/api/seguimiento/aprobar" && m === "POST") return await aprobar(request, env);
  if (p.startsWith("/api/foto/") && m === "GET") return await verFoto(env, p.slice(10));
  if (p.startsWith("/api/admin/")) return await admin(request, env, url, p.slice(11), m);
  return json({ error: "No encontrado" }, 404);
}

async function web(env) {
  const { results } = await env.DB.prepare("SELECT slug, nombre, cat, descr, specs, precio, etiqueta, imagen FROM servicios WHERE visible = 1 ORDER BY orden, id").all();
  const aj = await ajustes(env);
  return { servicios: (results || []).map((s) => ({ ...s, specs: (s.specs || "").split("\n").filter(Boolean) })), cats: CATS, telefono: aj.f_tel || "628 22 47 19", horario: HORARIO, demo: !env.ADMIN_HASH };
}

async function pedirCita(request, env) {
  const b = await cuerpo(request);
  if (b.web) return json({ ok: true }); // campo trampa para robots
  if (await demasiados(env, "cita:" + ip(request), 6, 60)) return json({ error: "Has pedido varias citas seguidas. Llámanos o escríbenos por WhatsApp." }, 429);
  const nombre = limpiar(b.nombre, 60), tel = limpiar(b.telefono, 20), veh = limpiar(b.vehiculo, 80), serv = limpiar(b.servicio, 80), notas = texto(b.notas, 400), fecha = String(b.fecha || ""), hora = String(b.hora || "");
  if (nombre.length < 2) return json({ error: "Escribe tu nombre." }, 400);
  if (!telOk(tel)) return json({ error: "Escribe un teléfono válido (9 cifras)." }, 400);
  if (!serv) return json({ error: "Dinos qué necesitas." }, 400);
  if (!b.privacidad) return json({ error: "Tienes que aceptar el uso de tus datos para gestionar la cita." }, 400);
  if (!fechaOk(fecha) || !horaOk(hora)) return json({ error: "Elige día y hora." }, 400);
  const h = await huecos(env, fecha), hueco = h.horas.find((x) => x.hora === hora);
  if (h.cerrado && !h.horas.length) return json({ error: "Ese día no abrimos o ya ha pasado. Elige otro, por favor.", huecos: h }, 409);
  if (!hueco || !hueco.libre) return json({ error: "Esa hora ya no está libre. Elige otra, por favor.", huecos: h }, 409);
  const r = await env.DB.prepare("INSERT INTO citas (fecha, hora, nombre, telefono, vehiculo, servicio, notas, estado, origen) VALUES (?,?,?,?,?,?,?, 'pendiente', ?)").bind(fecha, hora, nombre, tel, veh, serv, notas, b.origen === "chat" ? "chat" : "web").run();
  // comprobación final por si dos personas reservaron a la vez la última plaza
  const cap = Math.max(+(await env.DB.prepare("SELECT v FROM ajustes WHERE k='capacidad'").first() || {}).v || 2, 1);
  const n = await env.DB.prepare("SELECT COUNT(*) n FROM citas WHERE fecha = ? AND hora = ? AND estado != 'anulada' AND id <= ?").bind(fecha, hora, r.meta.last_row_id).first();
  if (n.n > cap) { await env.DB.prepare("DELETE FROM citas WHERE id = ?").bind(r.meta.last_row_id).run(); return json({ error: "Alguien acaba de reservar esa hora. Elige otra, por favor." }, 409); }
  return json({ ok: true, cita: { id: r.meta.last_row_id, fecha, hora, servicio: serv, estado: "pendiente" } });
}

function repPublica(r) {
  let pres = []; try { pres = JSON.parse(r.presupuesto || "[]"); } catch {}
  let hist = []; try { hist = JSON.parse(r.historial || "[]"); } catch {}
  return { matricula: conEspacio(r.matricula), vehiculo: r.vehiculo, mecanico: r.mecanico, paso: r.paso, pasos: PASOS.slice(0, 5), nota: r.nota, entrega: r.entrega, presupuesto: pres, total: r2(pres.reduce((a, x) => a + (+x.i || 0), 0)), aprobado: !!r.aprobado, foto: /^img\/[a-z0-9-]+$/.test(r.foto || "") ? r.foto + "-m.webp" : r.foto || "", historial: hist };
}
async function seguimiento(request, env, url) {
  if (await demasiados(env, "seg:" + ip(request), 40, 15)) return json({ error: "Demasiadas consultas. Espera unos minutos." }, 429);
  const mt = matricula(url.searchParams.get("m"));
  if (!mt) return json({ error: "Escribe una matrícula como 1234 KLM." }, 400);
  const r = await env.DB.prepare("SELECT * FROM reparaciones WHERE matricula = ? AND activa = 1 ORDER BY id DESC LIMIT 1").bind(mt).first();
  if (!r) return json({ error: "No tenemos ningún coche en el taller con esa matrícula. Si lo acabas de dejar, puede que aún no esté dado de alta." }, 404);
  return json({ reparacion: repPublica(r) });
}
async function aprobar(request, env) {
  const b = await cuerpo(request), mt = matricula(b.m), t4 = String(b.tel4 || "").replace(/\D/g, "");
  if (await demasiados(env, "apr:" + ip(request), 8, 15)) return json({ error: "Demasiados intentos. Espera 15 minutos o llámanos." }, 429);
  const r = mt && await env.DB.prepare("SELECT * FROM reparaciones WHERE matricula = ? AND activa = 1 ORDER BY id DESC LIMIT 1").bind(mt).first();
  if (!r) return json({ error: "No encontramos esa reparación." }, 404);
  if (t4.length !== 4 || !igual(t4, r.tel4 || "")) return json({ error: "Las 4 últimas cifras del teléfono no coinciden con las que nos diste." }, 403);
  if (r.paso !== 2 || r.aprobado) return json({ error: "Este presupuesto ya no está pendiente de aprobar." }, 409);
  let hist = []; try { hist = JSON.parse(r.historial || "[]"); } catch {}
  const { fecha, hora } = ahoraLocal(); hist.push({ p: 3, t: fecha + " " + hora, aprobado: true });
  // demo: el coche de ejemplo no se modifica, para que el siguiente visitante también pueda probarlo
  if (!env.ADMIN_HASH && mt === "1234KLM") return json({ ok: true, reparacion: repPublica({ ...r, aprobado: 1, paso: 3, historial: JSON.stringify(hist) }) });
  await env.DB.prepare("UPDATE reparaciones SET aprobado = 1, paso = 3, historial = ?, actualizada = datetime('now') WHERE id = ?").bind(JSON.stringify(hist), r.id).run();
  return json({ ok: true, reparacion: repPublica({ ...r, aprobado: 1, paso: 3, historial: JSON.stringify(hist) }) });
}

/* ------------------------------------------------------------------ fotos */
const TIPOS_IMG = { "image/jpeg": 1, "image/png": 1, "image/webp": 1 };
async function guardarFoto(env, dataUrl) {
  const m = String(dataUrl || "").match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m || !TIPOS_IMG[m[1]]) return { error: "La foto debe ser JPG, PNG o WebP." };
  if (m[2].length > 900000) return { error: "La foto es demasiado grande (máx. ~650 KB)." };
  const id = azar(12);
  await env.DB.prepare("INSERT INTO fotos (id, tipo, datos) VALUES (?,?,?)").bind(id, m[1], m[2]).run();
  return { id, url: "/api/foto/" + id };
}
async function verFoto(env, id) {
  if (!/^[0-9a-f]{24}$/.test(id)) return json({ error: "No encontrado" }, 404);
  const f = await env.DB.prepare("SELECT tipo, datos FROM fotos WHERE id = ?").bind(id).first();
  if (!f) return json({ error: "No encontrado" }, 404);
  const bin = Uint8Array.from(atob(f.datos), (c) => c.charCodeAt(0));
  return new Response(bin, { headers: { "Content-Type": f.tipo, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
}
const imagenOk = (v) => /^img\/[a-z0-9-]+$/.test(v) || /^\/api\/foto\/[0-9a-f]{24}$/.test(v) ? v : "";

/* ------------------------------------------------------------------ panel */
async function sesionOk(env, request) {
  const t = cookie(request, "tmn_a"); if (!t) return null;
  const h = await sha256(t);
  return await env.DB.prepare("SELECT token FROM sesiones WHERE token = ? AND expira > datetime('now')").bind(h).first();
}

async function admin(request, env, url, ruta, m) {
  if (ruta === "login" && m === "POST") {
    const b = await cuerpo(request);
    if (await demasiados(env, "adm:" + ip(request), 8, 15)) return json({ error: "Demasiados intentos. Espera 15 minutos." }, 429);
    const esperado = env.ADMIN_HASH || (await sha256("taller-demo"));
    if (!igual(await sha256(String(b.clave || "")), esperado)) return json({ error: "Contraseña incorrecta." }, 401);
    const seg = b.recordar ? 30 * 86400 : 12 * 3600, token = azar();
    await env.DB.prepare("DELETE FROM sesiones WHERE expira <= datetime('now')").run();
    await env.DB.prepare("INSERT INTO sesiones (token, expira) VALUES (?, datetime('now', ?))").bind(await sha256(token), `+${seg} seconds`).run();
    return json({ ok: true, demo: !env.ADMIN_HASH }, 200, { "Set-Cookie": setCookie("tmn_a", token, seg) });
  }
  const s = await sesionOk(env, request);
  if (!s && ruta === "yo" && m === "GET") return json({ ok: false }); // la pantalla de acceso pregunta sin ensuciar la consola
  if (!s) return json({ error: "Entra con la contraseña del taller." }, 401);
  if (ruta === "salir" && m === "POST") { await env.DB.prepare("DELETE FROM sesiones WHERE token = ?").bind(s.token).run(); return json({ ok: true }, 200, { "Set-Cookie": setCookie("tmn_a", "", 0) }); }
  if (ruta === "yo" && m === "GET") return json({ ok: true, demo: !env.ADMIN_HASH, hoy: ahoraLocal().fecha, pasos: PASOS, cats: CATS, metodos: METODOS });
  if (ruta === "resumen" && m === "GET") return await resumen(env, url);

  /* --- citas --- */
  if (ruta === "citas" && m === "GET") {
    const { fecha: hoy } = ahoraLocal(), desde = fechaOk(url.searchParams.get("desde")) ? url.searchParams.get("desde") : hoy, hasta = fechaOk(url.searchParams.get("hasta")) ? url.searchParams.get("hasta") : sumaDias(desde, 13);
    const { results } = await env.DB.prepare("SELECT * FROM citas WHERE fecha BETWEEN ? AND ? ORDER BY fecha, hora, id").bind(desde, hasta).all();
    const aj = await ajustes(env); let cerrado = []; try { cerrado = JSON.parse(aj.cerrado || "[]"); } catch {}
    return json({ citas: results || [], desde, hasta, capacidad: +aj.capacidad || 2, cerrado });
  }
  if (ruta === "citas/huecos" && m === "GET") { const f = url.searchParams.get("fecha") || ""; return fechaOk(f) ? json({ ...(await huecos(env, f)), todas: franjas(f) }) : json({ error: "Fecha no válida" }, 400); }
  if (ruta === "citas/guardar" && m === "POST") {
    const b = await cuerpo(request), id = +b.id || 0;
    const v = { fecha: String(b.fecha || ""), hora: String(b.hora || ""), nombre: limpiar(b.nombre, 60), telefono: limpiar(b.telefono, 20), vehiculo: limpiar(b.vehiculo, 80), servicio: limpiar(b.servicio, 80), notas: texto(b.notas, 400), estado: ["pendiente", "confirmada", "hecha", "anulada", "noshow"].includes(b.estado) ? b.estado : "pendiente" };
    if (!fechaOk(v.fecha) || !horaOk(v.hora)) return json({ error: "Elige día y hora." }, 400);
    if (v.nombre.length < 2) return json({ error: "Escribe el nombre del cliente." }, 400);
    if (v.telefono && !telOk(v.telefono)) return json({ error: "El teléfono no parece correcto." }, 400);
    if (id) await env.DB.prepare("UPDATE citas SET fecha=?, hora=?, nombre=?, telefono=?, vehiculo=?, servicio=?, notas=?, estado=? WHERE id=?").bind(v.fecha, v.hora, v.nombre, v.telefono, v.vehiculo, v.servicio, v.notas, v.estado, id).run();
    else await env.DB.prepare("INSERT INTO citas (fecha, hora, nombre, telefono, vehiculo, servicio, notas, estado, origen) VALUES (?,?,?,?,?,?,?,?, 'panel')").bind(v.fecha, v.hora, v.nombre, v.telefono, v.vehiculo, v.servicio, v.notas, v.estado).run();
    return json({ ok: true });
  }
  if (ruta === "citas/config" && m === "POST") {
    const b = await cuerpo(request), cap = Math.min(Math.max(parseInt(b.capacidad, 10) || 0, 1), 10);
    const cerr = [...new Set((Array.isArray(b.cerrado) ? b.cerrado : []).filter(fechaOk))].sort().slice(0, 120);
    await ponAjuste(env, "capacidad", cap); await ponAjuste(env, "cerrado", JSON.stringify(cerr));
    return json({ ok: true, capacidad: cap, cerrado: cerr });
  }

  /* --- reparaciones (sigue tu reparación) --- */
  if (ruta === "reparaciones" && m === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM reparaciones WHERE activa = 1 OR actualizada > datetime('now','-30 days') ORDER BY activa DESC, actualizada DESC LIMIT 200").all();
    return json({ reparaciones: (results || []).map((r) => ({ ...repPublica(r), id: r.id, cliente: r.cliente, tel4: r.tel4, activa: r.activa, matricula_raw: r.matricula })) });
  }
  if (ruta === "reparaciones/guardar" && m === "POST") {
    const b = await cuerpo(request), id = +b.id || 0, mt = matricula(b.matricula);
    if (!mt) return json({ error: "Escribe una matrícula válida (1234 KLM)." }, 400);
    const lineas = (Array.isArray(b.presupuesto) ? b.presupuesto : []).map((x) => ({ c: limpiar(x.c, 80), i: r2(Math.min(Math.max(+x.i || 0, 0), 99999)) })).filter((x) => x.c).slice(0, 20);
    const foto = imagenOk(b.foto), t4 = String(b.tel4 || "").replace(/\D/g, "").slice(-4);
    if (t4 && t4.length !== 4) return json({ error: "Pon las 4 últimas cifras del teléfono del cliente." }, 400);
    const otra = await env.DB.prepare("SELECT id FROM reparaciones WHERE matricula = ? AND activa = 1 AND id != ?").bind(mt, id).first();
    if (otra) return json({ error: "Ya hay una reparación abierta con esa matrícula." }, 409);
    const v = [mt, limpiar(b.vehiculo, 60), limpiar(b.cliente, 60), t4, limpiar(b.mecanico, 30), texto(b.nota, 300), limpiar(b.entrega, 40), JSON.stringify(lineas), foto || null];
    if (id) await env.DB.prepare("UPDATE reparaciones SET matricula=?, vehiculo=?, cliente=?, tel4=?, mecanico=?, nota=?, entrega=?, presupuesto=?, foto=?, actualizada=datetime('now') WHERE id=?").bind(...v, id).run();
    else { const { fecha, hora } = ahoraLocal(); await env.DB.prepare("INSERT INTO reparaciones (matricula, vehiculo, cliente, tel4, mecanico, nota, entrega, presupuesto, foto, paso, historial, actualizada) VALUES (?,?,?,?,?,?,?,?,?,0,?,datetime('now'))").bind(...v, JSON.stringify([{ p: 0, t: fecha + " " + hora }])).run(); }
    return json({ ok: true });
  }
  if (ruta === "reparaciones/paso" && m === "POST") {
    const b = await cuerpo(request), paso = parseInt(b.paso, 10);
    if (!(paso >= 0 && paso <= 5)) return json({ error: "Paso no válido." }, 400);
    const r = await env.DB.prepare("SELECT * FROM reparaciones WHERE id = ?").bind(+b.id || 0).first();
    if (!r) return json({ error: "No encontrada." }, 404);
    let hist = []; try { hist = JSON.parse(r.historial || "[]"); } catch {}
    const { fecha, hora } = ahoraLocal(); hist.push({ p: paso, t: fecha + " " + hora });
    const nota = b.nota != null ? texto(b.nota, 300) : r.nota, entrega = b.entrega != null ? limpiar(b.entrega, 40) : r.entrega;
    await env.DB.prepare("UPDATE reparaciones SET paso=?, nota=?, entrega=?, historial=?, activa=?, aprobado=CASE WHEN ? >= 3 THEN 1 ELSE aprobado END, actualizada=datetime('now') WHERE id=?").bind(paso, nota, entrega, JSON.stringify(hist.slice(-30)), paso === 5 ? 0 : 1, paso, r.id).run();
    return json({ ok: true });
  }
  if (ruta === "reparaciones/borrar" && m === "POST") { const b = await cuerpo(request); await env.DB.prepare("DELETE FROM reparaciones WHERE id = ?").bind(+b.id || 0).run(); return json({ ok: true }); }

  /* --- facturas --- */
  if (ruta === "facturas" && m === "GET") {
    const { fecha: hoy } = ahoraLocal();
    const desde = fechaOk(url.searchParams.get("desde")) ? url.searchParams.get("desde") : hoy.slice(0, 7) + "-01";
    const hasta = fechaOk(url.searchParams.get("hasta")) ? url.searchParams.get("hasta") : hoy;
    const q = limpiar(url.searchParams.get("q"), 40);
    const { results } = await env.DB.prepare("SELECT * FROM facturas WHERE fecha BETWEEN ?1 AND ?2 " + (q ? "AND (cliente LIKE ?3 OR vehiculo LIKE ?3) " : "") + "ORDER BY fecha DESC, numero DESC LIMIT 1000").bind(...(q ? [desde, hasta, "%" + q + "%"] : [desde, hasta])).all();
    const fs = (results || []).map((f) => { let l = []; try { l = JSON.parse(f.lineas || "[]"); } catch {} return { ...f, lineas: l, codigo: f.anio + "-" + String(f.numero).padStart(4, "0") }; });
    const ok = fs.filter((f) => !f.anulada);
    return json({ facturas: fs, desde, hasta, totales: { n: ok.length, base: r2(ok.reduce((a, f) => a + f.base, 0)), iva: r2(ok.reduce((a, f) => a + f.iva, 0)), total: r2(ok.reduce((a, f) => a + f.total, 0)) }, emisor: await emisor(env) });
  }
  if (ruta === "facturas/nueva" && m === "POST") {
    const b = await cuerpo(request), em = await emisor(env);
    if (!em.razon || !em.nif) return json({ error: "Antes rellena tus datos fiscales en «Mis datos» (nombre o razón social y NIF/CIF)." }, 400);
    const cliente = limpiar(b.cliente, 80); if (cliente.length < 2) return json({ error: "Escribe el nombre del cliente." }, 400);
    const lineas = (Array.isArray(b.lineas) ? b.lineas : []).map((x) => ({ c: limpiar(x.c, 120), i: r2(+String(x.i).replace(",", ".")) })).filter((x) => x.c && x.i > 0 && x.i < 1e6).slice(0, 25);
    if (!lineas.length) return json({ error: "Añade lo que se le ha hecho y su precio." }, 400);
    const pct = [0, 4, 10, 21].includes(+b.pct) ? +b.pct : +em.iva || 21, incl = b.iva_incluido !== false;
    let total, base;
    if (incl) { total = r2(lineas.reduce((a, x) => a + x.i, 0)); base = r2(total / (1 + pct / 100)); }
    else { base = r2(lineas.reduce((a, x) => a + x.i, 0)); total = r2(base * (1 + pct / 100)); }
    const nif = limpiar(b.cliente_nif, 20).toUpperCase(), { fecha, hora } = ahoraLocal(), anio = +fecha.slice(0, 4);
    const metodo = METODOS[b.metodo] ? b.metodo : "tarjeta";
    for (let intento = 0; intento < 4; intento++) {
      const ult = await env.DB.prepare("SELECT COALESCE(MAX(numero),0) n FROM facturas WHERE anio = ?").bind(anio).first();
      try {
        const r = await env.DB.prepare("INSERT INTO facturas (anio, numero, fecha, hora, cliente, cliente_nif, cliente_dir, vehiculo, lineas, base, iva, total, pct, metodo, servicio) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(anio, ult.n + 1, fecha, hora, cliente, nif || null, limpiar(b.cliente_dir, 140) || null, limpiar(b.vehiculo, 80) || null, JSON.stringify(lineas), base, r2(total - base), total, pct, metodo, CATS[b.cat] ? b.cat : null).run();
        const f = await env.DB.prepare("SELECT * FROM facturas WHERE id = ?").bind(r.meta.last_row_id).first();
        return json({ ok: true, factura: { ...f, lineas, codigo: anio + "-" + String(f.numero).padStart(4, "0") }, emisor: em });
      } catch (e) { if (!/UNIQUE/i.test(String(e))) throw e; }
    }
    return json({ error: "No se pudo numerar la factura. Inténtalo de nuevo." }, 409);
  }
  if (ruta === "facturas/anular" && m === "POST") { const b = await cuerpo(request); await env.DB.prepare("UPDATE facturas SET anulada = 1 WHERE id = ?").bind(+b.id || 0).run(); return json({ ok: true }); }

  /* --- servicios de la web --- */
  if (ruta === "servicios" && m === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM servicios ORDER BY orden, id").all();
    return json({ servicios: results || [] });
  }
  if (ruta === "servicios/guardar" && m === "POST") {
    const b = await cuerpo(request), id = +b.id || 0, nombre = limpiar(b.nombre, 60);
    if (nombre.length < 3) return json({ error: "Escribe el nombre del servicio." }, 400);
    const precio = +String(b.precio).replace(",", ".");
    if (!(precio >= 0 && precio < 100000)) return json({ error: "Escribe un precio válido." }, 400);
    const v = [nombre, CATS[b.cat] ? b.cat : "mant", limpiar(b.descr, 140), texto(b.specs, 600), r2(precio), limpiar(b.etiqueta, 20), imagenOk(b.imagen) || "img/diagnosis", b.visible === false ? 0 : 1];
    if (id) await env.DB.prepare("UPDATE servicios SET nombre=?, cat=?, descr=?, specs=?, precio=?, etiqueta=?, imagen=?, visible=? WHERE id=?").bind(...v, id).run();
    else {
      const base = nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "servicio";
      const ord = await env.DB.prepare("SELECT COALESCE(MAX(orden),0)+1 o FROM servicios").first();
      await env.DB.prepare("INSERT INTO servicios (nombre, cat, descr, specs, precio, etiqueta, imagen, visible, slug, orden) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(...v, base + "-" + azar(3), ord.o).run();
    }
    return json({ ok: true });
  }
  if (ruta === "servicios/borrar" && m === "POST") { const b = await cuerpo(request); await env.DB.prepare("DELETE FROM servicios WHERE id = ?").bind(+b.id || 0).run(); return json({ ok: true }); }
  if (ruta === "servicios/orden" && m === "POST") { const b = await cuerpo(request), ids = (Array.isArray(b.ids) ? b.ids : []).map((x) => +x).filter(Boolean).slice(0, 100); if (ids.length) await env.DB.batch(ids.map((x, i) => env.DB.prepare("UPDATE servicios SET orden = ? WHERE id = ?").bind(i, x))); return json({ ok: true }); }
  if (ruta === "foto" && m === "POST") {
    if (await demasiados(env, "foto:" + ip(request), 60, 60)) return json({ error: "Has subido muchas fotos seguidas. Espera un poco." }, 429);
    const r = await guardarFoto(env, (await cuerpo(request)).dataUrl); return r.error ? json(r, 400) : json({ ok: true, ...r });
  }

  /* --- mis datos (salen en cada factura) --- */
  if (ruta === "misdatos") {
    if (m === "GET") return json({ datos: await emisor(env) });
    if (m === "POST") {
      const b = await cuerpo(request), em = limpiar(b.email, 120).toLowerCase(), ge = limpiar(b.gestoria, 120).toLowerCase(), nif = limpiar(b.nif, 12).toUpperCase().replace(/[\s-]/g, "");
      if (em && !emailOk(em)) return json({ error: "El correo de la empresa no parece correcto." }, 400);
      if (ge && !emailOk(ge)) return json({ error: "El correo de la gestoría no parece correcto." }, 400);
      if (nif && !/^[A-Z0-9]{8,10}$/.test(nif)) return json({ error: "El NIF/CIF no parece correcto." }, 400);
      const iva = [0, 4, 10, 21].includes(+b.iva) ? +b.iva : 21;
      for (const [k, v] of [["f_razon", limpiar(b.razon, 80)], ["f_nif", nif], ["f_dir", limpiar(b.dir, 120)], ["f_cp", limpiar(b.cp, 80)], ["f_tel", limpiar(b.tel, 20)], ["f_email", em], ["f_gestoria", ge], ["iva", iva], ["f_pie", texto(b.pie, 300)]]) await ponAjuste(env, k, v);
      return json({ ok: true, datos: await emisor(env) });
    }
  }
  return json({ error: "No encontrado" }, 404);
}

async function emisor(env) {
  const a = await ajustes(env);
  return { razon: a.f_razon || "", nif: a.f_nif || "", dir: a.f_dir || "", cp: a.f_cp || "", tel: a.f_tel || "", email: a.f_email || "", gestoria: a.f_gestoria || "", iva: +a.iva || 21, pie: a.f_pie || "Garantía legal de la reparación: 3 meses o 2.000 km. Garantía del taller: 12 meses en piezas y mano de obra." };
}

/* ------------------------------------------------------------------ resumen de ventas */
function rango(periodo, ref) {
  const d = diaSemana(ref);
  if (periodo === "dia") return [ref, ref, sumaDias(ref, -1), sumaDias(ref, -1)];
  if (periodo === "semana") { const a = sumaDias(ref, -d); return [a, sumaDias(a, 6), sumaDias(a, -7), sumaDias(a, -1)]; }
  if (periodo === "anio") { const y = ref.slice(0, 4); return [y + "-01-01", y + "-12-31", (+y - 1) + "-01-01", (+y - 1) + "-12-31"]; }
  const mes0 = ref.slice(0, 7) + "-01", n = periodo === "trimestre" ? 3 : 1;
  const ini = periodo === "trimestre" ? ref.slice(0, 5) + String(Math.floor((+ref.slice(5, 7) - 1) / 3) * 3 + 1).padStart(2, "0") + "-01" : mes0;
  const fin = (() => { const x = new Date(ini + "T12:00:00Z"); x.setUTCMonth(x.getUTCMonth() + n); x.setUTCDate(0); return x.toISOString().slice(0, 10); })();
  const pIni = (() => { const x = new Date(ini + "T12:00:00Z"); x.setUTCMonth(x.getUTCMonth() - n); return x.toISOString().slice(0, 10); })();
  return [ini, fin, pIni, sumaDias(ini, -1)];
}
async function resumen(env, url) {
  const { fecha: hoy } = ahoraLocal(), periodo = ["dia", "semana", "mes", "trimestre", "anio"].includes(url.searchParams.get("periodo")) ? url.searchParams.get("periodo") : "mes";
  const ref = fechaOk(url.searchParams.get("ref")) ? url.searchParams.get("ref") : hoy;
  let [a, b, pa, pb] = rango(periodo, ref);
  // si el periodo está en curso, se compara con los mismos días del anterior (no con el periodo entero)
  const parcial = a <= hoy && hoy < b && periodo !== "dia";
  if (parcial) { const dias = Math.round((Date.parse(hoy) - Date.parse(a)) / 864e5); pb = sumaDias(pa, dias) < pb ? sumaDias(pa, dias) : pb; }
  const tot = (x, y) => env.DB.prepare("SELECT COUNT(*) n, COALESCE(SUM(total),0) total, COALESCE(SUM(base),0) base FROM facturas WHERE anulada = 0 AND fecha BETWEEN ? AND ?").bind(x, y).first();
  const [act, ant, primera] = await Promise.all([tot(a, b), tot(pa, pb), env.DB.prepare("SELECT MIN(fecha) f FROM facturas WHERE anulada = 0").first()]);
  const comparable = !!(primera && primera.f && primera.f <= pa); // si no hay datos de todo el periodo anterior, no se compara
  const desde12 = sumaDias(hoy.slice(0, 7) + "-01", -340).slice(0, 7) + "-01";
  const [dias, meses, cats, met, porDia] = await Promise.all([
    env.DB.prepare("SELECT CAST(strftime('%w', fecha) AS INTEGER) d, COUNT(*) n, SUM(total) total, COUNT(DISTINCT fecha) jornadas FROM facturas WHERE anulada = 0 AND fecha >= ? GROUP BY d").bind(desde12).all(),
    env.DB.prepare("SELECT substr(fecha,1,7) mes, COUNT(*) n, SUM(total) total FROM facturas WHERE anulada = 0 AND fecha >= ? GROUP BY mes ORDER BY mes").bind(desde12).all(),
    env.DB.prepare("SELECT COALESCE(servicio,'otros') cat, COUNT(*) n, SUM(total) total FROM facturas WHERE anulada = 0 AND fecha BETWEEN ? AND ? GROUP BY cat ORDER BY total DESC").bind(a, b).all(),
    env.DB.prepare("SELECT metodo, COUNT(*) n, SUM(total) total FROM facturas WHERE anulada = 0 AND fecha BETWEEN ? AND ? GROUP BY metodo ORDER BY total DESC").bind(a, b).all(),
    env.DB.prepare("SELECT fecha, COUNT(*) n, SUM(total) total FROM facturas WHERE anulada = 0 AND fecha BETWEEN ? AND ? GROUP BY fecha ORDER BY fecha").bind(a, b).all(),
  ]);
  const [citasHoy, pend, listos, enTaller] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) n FROM citas WHERE fecha = ? AND estado IN ('pendiente','confirmada')").bind(hoy).first(),
    env.DB.prepare("SELECT COUNT(*) n FROM citas WHERE fecha >= ? AND estado = 'pendiente'").bind(hoy).first(),
    env.DB.prepare("SELECT COUNT(*) n FROM reparaciones WHERE activa = 1 AND paso = 4").first(),
    env.DB.prepare("SELECT COUNT(*) n FROM reparaciones WHERE activa = 1").first(),
  ]);
  const NOMD = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  return json({
    periodo, parcial, desde: a, hasta: b, actual: { n: act.n, total: r2(act.total), base: r2(act.base), medio: act.n ? r2(act.total / act.n) : 0 }, anterior: { n: ant.n, total: r2(ant.total), comparable },
    dias: [1, 2, 3, 4, 5, 6, 0].map((d) => { const x = (dias.results || []).find((r) => r.d === d) || { n: 0, total: 0, jornadas: 0 }; return { dia: NOMD[d], n: x.n, total: r2(x.total || 0), media: x.jornadas ? r2(x.total / x.jornadas) : 0 }; }),
    meses: (meses.results || []).map((r) => ({ mes: r.mes, n: r.n, total: r2(r.total) })),
    cats: (cats.results || []).map((r) => ({ cat: CATS[r.cat] || "Otros", n: r.n, total: r2(r.total) })),
    metodos: (met.results || []).map((r) => ({ metodo: METODOS[r.metodo] || r.metodo, n: r.n, total: r2(r.total) })),
    porDia: (porDia.results || []).map((r) => ({ fecha: r.fecha, n: r.n, total: r2(r.total) })),
    hoy: { citas: citasHoy.n, pendientes: pend.n, listos: listos.n, enTaller: enTaller.n }, demo: !env.ADMIN_HASH,
  });
}
