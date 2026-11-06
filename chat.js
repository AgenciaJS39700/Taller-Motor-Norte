/* chat.js — Asistente de Taller Motor Norte.
   · Responde las preguntas frecuentes de un taller con respuestas breves y profesionales.
   · Nunca da diagnósticos: si le cuentan un síntoma, ofrece cita de diagnosis (y, si suena a peligro, pide no circular y llamar).
   · Pide cita de verdad: consulta los huecos libres (/api/huecos) y solo confirma cuando el servidor ha guardado la cita (/api/citas).
   Funciona en el navegador, sin enviar las preguntas a ningún servicio externo. */
(function () {
  "use strict";
  var S = window.SITE || {}, T = window.TMN || {};
  var esc = T.esc || function (t) { return String(t); }, eur = T.eur || function (n) { return n + " €"; };
  var TEL = "628 22 47 19", TELH = "tel:+34628224719", WA = "https://wa.me/" + (S.wa || "34628224719");
  var DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

  /* ---------- interfaz ---------- */
  var fab = document.createElement("button");
  fab.type = "button"; fab.className = "ch-fab"; fab.id = "chFab"; fab.setAttribute("aria-controls", "chBox"); fab.setAttribute("aria-expanded", "false");
  fab.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 5h16v10H9l-5 4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="9" cy="10" r="1.2" fill="currentColor"/><circle cx="12" cy="10" r="1.2" fill="currentColor"/><circle cx="15" cy="10" r="1.2" fill="currentColor"/></svg><span>¿Te ayudo?</span>';
  var box = document.createElement("section");
  box.className = "ch-box"; box.id = "chBox"; box.hidden = true; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Asistente del taller");
  box.innerHTML = '<header class="ch-h"><span class="ch-av" aria-hidden="true">TM</span><div><b>Asistente del taller</b><small>Citas y dudas · respuesta al momento</small></div><button type="button" class="ch-x" id="chX" aria-label="Cerrar el asistente">✕</button></header>' +
    '<div class="ch-log" id="chLog" role="log" aria-live="polite"></div><div class="ch-chips" id="chChips"></div>' +
    '<form class="ch-f" id="chF" autocomplete="off"><label class="sr" for="chI">Escribe tu pregunta</label><input id="chI" maxlength="300" placeholder="Escribe tu pregunta…" enterkeyhint="send"><button type="submit" aria-label="Enviar">➤</button></form>' +
    '<p class="ch-pie">Asistente automático: no da diagnósticos. Para urgencias, llama al ' + TEL + '.</p>';
  document.body.appendChild(fab); document.body.appendChild(box);
  var log = box.querySelector("#chLog"), chips = box.querySelector("#chChips"), inp = box.querySelector("#chI");
  var abierto = false, saludado = false, flujo = null;

  function abrir(v) {
    abierto = v; box.hidden = !v; fab.setAttribute("aria-expanded", String(v)); document.documentElement.classList.toggle("ch-on", v);
    if (v) { if (!saludado) { saludado = true; hola(); } setTimeout(function () { if (window.matchMedia("(pointer:fine)").matches) inp.focus(); }, 60); } else fab.focus();
  }
  fab.addEventListener("click", function () { abrir(!abierto); });
  box.querySelector("#chX").addEventListener("click", function () { abrir(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && abierto) abrir(false); });

  function burbuja(html, yo) { var d = document.createElement("div"); d.className = "ch-m " + (yo ? "yo" : "bot"); d.innerHTML = html; log.appendChild(d); log.scrollTop = log.scrollHeight; return d; }
  function bot(html, opciones) { burbuja(html); ponChips(opciones || []); }
  function ponChips(o) {
    chips.innerHTML = o.map(function (x, i) { return x.href ? '<a class="ch-c" href="' + esc(x.href) + '"' + (/^https?:/.test(x.href) ? ' target="_blank" rel="noopener"' : "") + ">" + esc(x.t) + "</a>" : '<button type="button" class="ch-c" data-i="' + i + '">' + esc(x.t) + "</button>"; }).join("");
    chips._o = o;
  }
  chips.addEventListener("click", function (e) {
    var b = e.target.closest("button.ch-c"); if (!b) { if (e.target.closest("a.ch-c[href^='#']")) abrir(false); return; }
    var o = chips._o[+b.dataset.i]; if (!o) return;
    burbuja(esc(o.t), true); ponChips([]);
    if (o.f) o.f(); else responder(o.v || o.t);
  });
  box.querySelector("#chF").addEventListener("submit", function (e) {
    e.preventDefault(); var t = inp.value.trim(); if (!t) return; inp.value = "";
    burbuja(esc(t), true); ponChips([]);
    if (flujo) flujo(t); else responder(t);
  });

  var MENU = function () { return [{ t: "📅 Pedir cita", f: citaInicio }, { t: "Precios", v: "precios" }, { t: "Horario", v: "horario" }, { t: "Seguir mi reparación", v: "seguimiento" }, { t: "Coche de cortesía", v: "cortesia" }]; };
  function hola() { bot("¡Hola! Soy el asistente de <b>Taller Motor Norte</b>. Puedo darte cita al momento y resolver dudas sobre precios, plazos, garantía o el coche de cortesía. ¿En qué te ayudo?", MENU()); }

  /* ---------- preguntas frecuentes ---------- */
  function nrm(t) { return " " + String(t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[¿?¡!.,;:()"'«»]/g, " ").replace(/\s+/g, " ") + " "; }
  function horario() {
    var H = S.hours || [], N = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
    var t = function (d) { return (H[d] || []).map(function (r) { return r[0] + "–" + r[1]; }).join(" y ") || "cerrado"; };
    return "De lunes a viernes, " + t(0) + ". Sábados, " + t(5) + ". Domingos y festivos, cerrado.";
  }
  function precios() {
    var l = T.servicios || []; if (!l.length) return "Tienes los precios orientativos en la sección <a href='#servicios'>Servicios</a>.";
    return "Precios orientativos (IVA incluido, turismos estándar):<ul>" + l.slice(0, 10).map(function (s) { return "<li>" + esc(s.nombre) + ": desde <b>" + eur(s.precio) + "</b></li>"; }).join("") + "</ul>El precio final te lo damos cerrado y por escrito antes de empezar.";
  }
  var FAQ = [
    { k: ["horario", "hora abr", "abris", "abierto", "cerrais", "cierra", "sabado", "domingo", "festivo", "cuando abr"], r: function () { return horario(); }, o: function () { return [{ t: "📅 Pedir cita", f: citaInicio }]; } },
    { k: ["donde", "direccion", "ubicacion", "como llego", "llegar", "poligono", "mapa"], r: function () { return "Estamos en <b>C/ Herreros, nave 14 · Polígono Las Eras</b>, con aparcamiento en la puerta."; }, o: function () { return [{ t: "Ver contacto", href: "#cita" }]; } },
    { k: ["precio", "precios", "cuesta", "cuanto vale", "tarifa", "coste", "barato", "cobrais", "cuanto sale"], r: precios },
    { k: ["presupuesto", "sin compromiso", "valoracion"], r: function () { return "Sí. Te damos <b>presupuesto cerrado y por escrito</b> antes de empezar, sin compromiso. No hacemos ningún trabajo sin tu aprobación y, si aparece algo nuevo, te avisamos antes."; } },
    { k: ["tarda", "tardais", "plazo", "cuanto tiempo", "cuando esta", "mismo dia", "rapido", "urgente"], r: function () { return "La mayoría de reparaciones están en <b>24-48 h</b>. Los mantenimientos (aceite, pre-ITV, neumáticos) suelen estar el mismo día. Con el presupuesto te damos la hora de entrega."; } },
    { k: ["cortesia", "sustitucion", "coche de alquiler", "me dejais un coche", "coche mientras"], v: "cortesia", r: function () { return "Sí, tenemos <b>coche de cortesía</b> para reparaciones de más de un día, previa reserva. Pídelo al reservar la cita."; } },
    { k: ["garantia del fabricante", "garantia de la marca", "pierdo la garantia", "concesionario", "taller oficial", "libro de mantenimiento", "sellais"], r: function () { return "No pierdes la garantía del fabricante por hacer el mantenimiento con nosotros: seguimos el plan de tu marca, usamos recambio original o de calidad equivalente y <b>sellamos tu libro de mantenimiento</b>."; } },
    { k: ["garantia", "garantias", "si falla despues", "vuelve a fallar"], r: function () { return "Todas las reparaciones tienen <b>12 meses de garantía</b> en piezas y mano de obra, por escrito (la ley exige un mínimo de 3 meses o 2.000 km)."; } },
    { k: ["marca", "marcas", "hibrido", "electrico", "furgoneta", "moto", "camion", "todas las marcas"], r: function () { return "Trabajamos con <b>turismos y furgonetas de cualquier marca</b>, incluidos híbridos. Para eléctricos o vehículos industriales, consúltanos el trabajo concreto. No reparamos motos."; } },
    { k: ["recog", "domicilio", "a casa", "llevais", "venis a por"], r: function () { return "Sí: en el municipio podemos <b>recoger y devolver tu coche</b>, bajo petición. Indícalo al pedir la cita."; } },
    { k: ["pago", "pagar", "tarjeta", "efectivo", "bizum", "transferencia", "financ", "plazos"], r: function () { return "Puedes pagar con <b>tarjeta, efectivo, Bizum o transferencia</b>. Para importes altos, pregúntanos por el pago fraccionado."; } },
    { k: ["factura", "ticket", "iva"], r: function () { return "Siempre te damos <b>factura desglosada</b> con piezas, mano de obra e IVA. Si eres empresa o autónomo, dinos tu NIF/CIF y va a tu nombre."; } },
    { k: ["pieza vieja", "piezas viejas", "piezas sustituidas", "me devolveis", "pieza antigua"], r: function () { return "Sí, si las quieres <b>te entregamos las piezas sustituidas</b> junto con el coche."; } },
    { k: ["original", "recambio", "piezas de marca", "piezas"], r: function () { return "Usamos <b>recambio original o de calidad equivalente</b> homologado. En el presupuesto te indicamos qué pieza montamos y, si prefieres original de marca, te decimos la diferencia."; } },
    { k: ["sin cita", "sin pedir cita", "pasar sin", "me puedo pasar", "walk"], r: function () { return "Para comprobaciones rápidas (presión, niveles, luces) puedes venir sin cita. Para reparaciones o mantenimientos es mejor <b>reservar</b> y así no esperas."; }, o: function () { return [{ t: "📅 Pedir cita", f: citaInicio }]; } },
    { k: ["itv", "pre itv", "pasar la itv", "inspeccion"], r: function () { return "Hacemos la <b>revisión pre-ITV desde 39 €</b>: luces, emisiones, frenos y lo que mira la estación. La ITV en sí la hace la estación oficial; te dejamos el coche preparado."; }, o: function () { return [{ t: "📅 Pedir pre-ITV", f: function () { citaInicio("Revisión pre-ITV"); } }]; } },
    { k: ["cada cuanto", "kilometros", "cuando toca", "mantenimiento", "revision", "aceite"], r: function () { return "Depende de cada fabricante (el aceite suele cambiarse entre 15.000 y 30.000 km o una vez al año). Mira tu libro de mantenimiento o usa nuestra <a href='#revision'>calculadora de revisión</a>."; }, o: function () { return [{ t: "Abrir la calculadora", href: "#revision" }, { t: "📅 Pedir cita", f: citaInicio }]; } },
    { k: ["neumatico", "ruedas", "rueda", "pinchazo", "equilibrado", "alineado"], r: function () { return "Montaje y equilibrado <b>desde 19 € por rueda</b>. Si no tienes neumáticos, te los buscamos para tu medida y te damos precio cerrado."; } },
    { k: ["seguimiento", "como va mi coche", "mi reparacion", "estado de mi coche", "ya esta mi coche", "matricula"], r: function () { return "Puedes ver en qué paso está tu coche escribiendo la matrícula en <a href='#seguimiento'>Sigue tu reparación</a>. Ahí también apruebas el presupuesto."; }, o: function () { return [{ t: "Ir al seguimiento", href: "#seguimiento" }]; } },
    { k: ["persona", "humano", "hablar con", "llamar", "telefono", "whatsapp", "contacto", "correo", "email"], r: function () { return "Claro. Llámanos al <b>" + TEL + "</b> o escríbenos por WhatsApp; respondemos en el día."; }, o: function () { return [{ t: "Llamar", href: TELH }, { t: "WhatsApp", href: WA }]; } },
    { k: ["anular", "cancelar cita", "cambiar la cita", "cambiar cita", "mover la cita"], r: function () { return "Para cambiar o anular una cita, llámanos o escríbenos por WhatsApp con tu nombre y la hora reservada."; }, o: function () { return [{ t: "WhatsApp", href: WA }, { t: "Llamar", href: TELH }] ; } },
    { k: ["gracias", "vale", "perfecto", "genial"], r: function () { return "¡A ti! Si necesitas algo más, aquí estoy."; } },
    { k: ["hola", "buenas", "buenos dias", "buenas tardes"], r: function () { return "¡Hola! ¿Quieres pedir cita o tienes alguna duda?"; } }
  ];
  /* síntomas: sin diagnóstico a distancia */
  var SINTOMA = /\b(ruido|ruidos|chirri|chirria|vibra|vibracion|humo|olor|huele|pierde|gotea|fuga|mancha|no arranca|no enciende|se cala|calado|tirones|tiembla|testigo|piloto|luz roja|luz naranja|se calienta|calienta|temperatura|averia|falla|fallo|se para|no frena|frena mal|pedal|embrague patina|que le pasa|que puede ser|que tiene|por que)\b/;
  var PELIGRO = /\b(humo|quemado|no frena|frena mal|pedal|luz roja|testigo rojo|temperatura|se calienta|aceite|se para|direccion dura)\b/;
  function responder(t) {
    var n = nrm(t);
    if (/\b(cita|reserv|hueco|turno|apunt|llevar el coche|llevarlo)\b/.test(n) && !/\b(anular|cancelar|cambiar|mover)\b/.test(n)) return citaInicio();
    if (SINTOMA.test(n) && !/\b(precio|cuesta|horario|cortesia)\b/.test(n)) {
      return bot("No podemos decirte qué tiene tu coche sin verlo: un diagnóstico a distancia podría ser incorrecto." + (PELIGRO.test(n) ? " <b>Si notas humo, olor a quemado, un testigo rojo encendido o fallan los frenos, no sigas circulando y llámanos al " + TEL + ".</b>" : "") +
        " Te propongo una <b>cita de diagnosis</b> (desde 35 €, se descuenta si haces la reparación con nosotros).", [{ t: "📅 Cita de diagnosis", f: function () { citaInicio("Diagnosis electrónica"); } }, { t: "Llamar", href: TELH }]);
    }
    var mejor = null, pm = 0;
    FAQ.forEach(function (q) { var p = 0; q.k.forEach(function (k) { if (n.indexOf(" " + k) >= 0 || n.indexOf(k + " ") >= 0) p += k.length > 6 ? 2 : 1; }); if (p > pm) { pm = p; mejor = q; } });
    var sv = (T.servicios || []).filter(function (s) { return n.indexOf(nrm(s.nombre).trim().split(" ")[0]) >= 0 || nrm(s.nombre).indexOf(n.trim()) >= 0 && n.trim().length > 4; })[0];
    if (sv && (!mejor || /precio|cuesta|vale|cuanto|incluye/.test(n) || pm < 2)) {
      return bot("<b>" + esc(sv.nombre) + "</b>: desde <b>" + eur(sv.precio) + "</b> (IVA incluido). " + esc(sv.descr) + (sv.specs && sv.specs.length ? "<ul>" + sv.specs.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "") + "Precio orientativo: el definitivo te lo damos cerrado antes de empezar.",
        [{ t: "📅 Reservar " + sv.nombre.toLowerCase(), f: function () { citaInicio(sv.nombre); } }, { t: "Otra pregunta", f: function () { bot("Dime.", MENU()); } }]);
    }
    if (mejor) return bot(mejor.r(), mejor.o ? mejor.o() : [{ t: "📅 Pedir cita", f: citaInicio }, { t: "Otra pregunta", f: function () { bot("Dime, ¿qué más quieres saber?", MENU()); } }]);
    bot("No estoy seguro de haberte entendido. Puedo ayudarte con citas, precios, plazos, garantía o el coche de cortesía. Si lo prefieres, habla con nosotros.", [{ t: "📅 Pedir cita", f: citaInicio }, { t: "Precios", v: "precios" }, { t: "Llamar", href: TELH }, { t: "WhatsApp", href: WA }]);
  }

  /* ---------- pedir cita (datos reales del servidor) ---------- */
  var C = {};
  function cancelar() { flujo = null; C = {}; bot("Vale, lo dejamos aquí. ¿Te ayudo con otra cosa?", MENU()); }
  function esCancelar(t) { return /^\s*(cancelar|salir|dejalo|déjalo|no quiero)\s*$/i.test(t); }
  function citaInicio(serv) {
    C = { servicio: typeof serv === "string" ? serv : "" };
    if (C.servicio) return pideDia();
    var l = (T.servicios || []).slice(0, 8);
    flujo = function (t) { if (esCancelar(t)) return cancelar(); C.servicio = t.slice(0, 80); pideDia(); };
    bot("Perfecto, te doy cita. ¿Qué necesitas? Elige o escríbelo con tus palabras.", l.map(function (s) { return { t: s.nombre, f: function () { C.servicio = s.nombre; pideDia(); } }; }).concat([{ t: "Cancelar", f: cancelar }]));
  }
  function pideDia() {
    flujo = function (t) { if (esCancelar(t)) return cancelar(); bot("Elige uno de los días de abajo, por favor.", opcionesDia()); };
    bot("Para <b>" + esc(C.servicio) + "</b>, ¿qué día te viene bien?", opcionesDia());
  }
  function opcionesDia() {
    var o = [], d = new Date();
    for (var i = 0; o.length < 6 && i < 14; i++) {
      var x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i); if (x.getDay() === 0) continue;
      (function (f, et) { o.push({ t: et, f: function () { pideHora(f); } }); })(T.iso(x), i === 0 ? "Hoy" : i === 1 ? "Mañana" : DIAS[x.getDay()].replace(/^./, function (c) { return c.toUpperCase(); }) + " " + x.getDate());
    }
    return o.concat([{ t: "Cancelar", f: cancelar }]);
  }
  function pideHora(f) {
    C.fecha = f; flujo = null;
    var esp = burbuja("Miro las horas libres…");
    fetch("/api/huecos?fecha=" + f).then(function (r) { return r.json(); }).then(function (j) {
      esp.remove();
      var lib = (j.horas || []).filter(function (h) { return h.libre; });
      if (!lib.length) return bot("Ese día no nos quedan horas libres. Elige otro, por favor.", opcionesDia());
      flujo = function (t) { var h = (t.match(/\d{1,2}[:.]\d{2}/) || [""])[0].replace(".", ":").padStart(5, "0"); var ok = lib.filter(function (x) { return x.hora === h; })[0]; if (esCancelar(t)) return cancelar(); if (ok) { C.hora = h; pideNombre(); } else bot("Elige una de estas horas, por favor.", horasO(lib)); };
      bot("El " + esc(T.bonita(f)) + " tengo libre:", horasO(lib));
    }).catch(function () { esp.remove(); bot("No he podido consultar la agenda ahora mismo. Puedes llamarnos o escribirnos por WhatsApp.", [{ t: "Llamar", href: TELH }, { t: "WhatsApp", href: WA }]); flujo = null; });
  }
  function horasO(lib) { return lib.slice(0, 12).map(function (h) { return { t: h.hora, f: function () { C.hora = h.hora; pideNombre(); } }; }).concat([{ t: "Otro día", f: pideDia }]); }
  function pideNombre() {
    flujo = function (t) { if (esCancelar(t)) return cancelar(); if (t.trim().length < 2) return bot("Escribe tu nombre, por favor."); C.nombre = t.trim().slice(0, 60); pideTel(); };
    bot("Genial: " + esc(T.bonita(C.fecha)) + " a las <b>" + C.hora + "</b>. ¿A nombre de quién?", [{ t: "Cancelar", f: cancelar }]);
  }
  function pideTel() {
    flujo = function (t) { if (esCancelar(t)) return cancelar(); var v = t.replace(/[^\d+ ]/g, "").trim(); if (v.replace(/\D/g, "").length < 9) return bot("Necesito un teléfono de 9 cifras para avisarte."); C.telefono = v; pideCoche(); };
    bot("Gracias, " + esc(C.nombre.split(" ")[0]) + ". ¿Un teléfono para avisarte?");
  }
  function pideCoche() {
    flujo = function (t) { if (esCancelar(t)) return cancelar(); C.vehiculo = t.trim().slice(0, 80); confirmar(); };
    bot("¿Qué coche es? (marca, modelo y, si la sabes, la matrícula)", [{ t: "Prefiero decirlo en el taller", f: function () { C.vehiculo = ""; confirmar(); } }]);
  }
  function confirmar() {
    flujo = function (t) { if (esCancelar(t) || /^no\b/i.test(t)) return cancelar(); if (/^(si|sí|vale|ok|confirmo|acepto)/i.test(t.trim())) return enviar(); bot("¿Confirmo la cita?", optsConf()); };
    bot("Resumen de tu cita:<ul><li>" + esc(C.servicio) + "</li><li>" + esc(T.bonita(C.fecha)) + " a las " + C.hora + "</li><li>" + esc(C.nombre) + " · " + esc(C.telefono) + "</li>" + (C.vehiculo ? "<li>" + esc(C.vehiculo) + "</li>" : "") + "</ul><small>Usaremos tus datos solo para gestionar esta cita.</small>", optsConf());
  }
  function optsConf() { return [{ t: "✅ Confirmar cita", f: enviar }, { t: "Cambiar la hora", f: function () { pideHora(C.fecha); } }, { t: "Cancelar", f: cancelar }]; }
  function enviar() {
    flujo = null; var esp = burbuja("Reservando…");
    fetch("/api/citas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre: C.nombre, telefono: C.telefono, vehiculo: C.vehiculo, servicio: C.servicio, fecha: C.fecha, hora: C.hora, privacidad: true, origen: "chat" }) })
      .then(function (r) { return r.json().then(function (j) { j._ok = r.ok; j._st = r.status; return j; }); })
      .then(function (j) {
        esp.remove();
        if (j._ok && j.ok && j.cita) { bot("✅ <b>Cita registrada</b> para el " + esc(T.bonita(j.cita.fecha)) + " a las " + esc(j.cita.hora) + " (" + esc(j.cita.servicio) + "). Te llamaremos para confirmarla. ¡Gracias!", [{ t: "Otra pregunta", f: function () { bot("Dime.", MENU()); } }]); C = {}; return; }
        if (j._st === 409) return bot(esc(j.error || "Esa hora ya no está libre."), [{ t: "Ver otras horas", f: function () { pideHora(C.fecha); } }, { t: "Otro día", f: pideDia }]);
        bot(esc(j.error || "No he podido guardar la cita.") + " Si quieres, llámanos y te la damos por teléfono.", [{ t: "Llamar", href: TELH }, { t: "WhatsApp", href: WA }]);
      })
      .catch(function () { esp.remove(); bot("No he podido conectar con la agenda: la cita <b>no</b> se ha guardado. Llámanos o escríbenos por WhatsApp.", [{ t: "Llamar", href: TELH }, { t: "WhatsApp", href: WA }]); });
  }

  window.TMNChat = { abrir: function () { abrir(true); }, reservar: function (s) { if (!abierto) { abrir(true); } burbuja("Quiero reservar: " + esc(s), true); citaInicio(s); } };
})();
