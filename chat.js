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
  var I = window.I18N || { lang: "es", t: function (x, v) { return String(x).replace(/\{(\d)\}/g, function (m, i) { return v[+i]; }); } };
  var L = function (x, v) { return I.t(x, v || []); };

  /* ---------- interfaz ---------- */
  var fab = document.createElement("button");
  fab.type = "button"; fab.className = "ch-fab"; fab.id = "chFab"; fab.setAttribute("aria-controls", "chBox"); fab.setAttribute("aria-expanded", "false");
  fab.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 5h16v10H9l-5 4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="9" cy="10" r="1.2" fill="currentColor"/><circle cx="12" cy="10" r="1.2" fill="currentColor"/><circle cx="15" cy="10" r="1.2" fill="currentColor"/></svg><span>' + L("¿Te ayudo?") + '</span>';
  var box = document.createElement("section");
  box.className = "ch-box"; box.id = "chBox"; box.hidden = true; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", L("Asistente del taller"));
  box.innerHTML = '<header class="ch-h"><span class="ch-av" aria-hidden="true">TM</span><div><b>' + L("Asistente del taller") + '</b><small>' + L("Citas y dudas · respuesta al momento") + '</small></div><button type="button" class="ch-x" id="chX" aria-label="' + L("Cerrar el asistente") + '">✕</button></header>' +
    '<div class="ch-log" id="chLog" role="log" aria-live="polite"></div><div class="ch-chips" id="chChips"></div>' +
    '<form class="ch-f" id="chF" autocomplete="off"><label class="sr" for="chI">' + L("Escribe tu pregunta") + '</label><input id="chI" maxlength="300" placeholder="' + L("Escribe tu pregunta…") + '" enterkeyhint="send"><button type="submit" aria-label="' + L("Enviar") + '">➤</button></form>' +
    '<p class="ch-pie">' + L("Asistente automático: no da diagnósticos. Para urgencias, llama al {0}.", [TEL]) + '</p>';
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

  var MENU = function () { return [{ t: L("📅 Pedir cita"), f: citaInicio }, { t: L("Precios"), v: "precios" }, { t: L("Horario"), v: "horario" }, { t: L("Seguir mi reparación"), v: "seguimiento" }, { t: L("Coche de cortesía"), v: "cortesia" }]; };
  function hola() { bot(L("¡Hola! Soy el asistente de <b>Taller Motor Norte</b>. Puedo darte cita al momento y resolver dudas sobre precios, plazos, garantía o el coche de cortesía. ¿En qué te ayudo?"), MENU()); }

  /* ---------- preguntas frecuentes ---------- */
  function nrm(t) { return " " + String(t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[¿?¡!.,;:()"'«»]/g, " ").replace(/\s+/g, " ") + " "; }
  function horario() {
    var H = S.hours || [], N = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
    var t = function (d) { return (H[d] || []).map(function (r) { return r[0] + "–" + r[1]; }).join(" " + L("y") + " ") || L("cerrado"); };
    return L("De lunes a viernes, {0}. Sábados, {1}. Domingos y festivos, cerrado.", [t(0), t(5)]);
  }
  function precios() {
    var l = T.servicios || []; if (!l.length) return L("Tienes los precios orientativos en la sección <a href='#servicios'>Servicios</a>.");
    return L("Precios orientativos (IVA incluido, turismos estándar):") + "<ul>" + l.slice(0, 10).map(function (s) { return "<li>" + L("{0}: desde <b>{1}</b>", [esc(L(s.nombre)), eur(s.precio)]) + "</li>"; }).join("") + "</ul>" + L("El precio final te lo damos cerrado y por escrito antes de empezar.");
  }
  var FAQ = [
    { k: ["orari", "orario", "aperto", "apre", "chiude", "sabato", "domenica", "opening", "open", "hours", "horaire", "ouvert", "offnungszeit", "geoffnet", "offen", "ordutegi", "irekita", "obert", "aberto", "horari", "dissabte", "saturday", "samedi", "samstag", "larunbat", "sabado", "sunday", "sonntag", "dimanche", "igande", "diumenge", "horario", "hora abr", "abris", "abierto", "cerrais", "cierra", "sabado", "domingo", "festivo", "cuando abr"], r: function () { return horario(); }, o: function () { return [{ t: L("📅 Pedir cita"), f: citaInicio }]; } },
    { k: ["dove", "indirizzo", "come arrivo", "where", "address", "location", "adresse", "ou etes", "wo ", "anschrift", "non dago", "helbide", "on sou", "adreca", "onde", "enderezo", "donde", "direccion", "ubicacion", "como llego", "llegar", "poligono", "mapa"], r: function () { return L("Estamos en <b>C/ Herreros, nave 14 · Polígono Las Eras</b>, con aparcamiento en la puerta."); }, o: function () { return [{ t: L("Ver contacto"), href: "#cita" }]; } },
    { k: ["prezzo", "prezzi", "quanto costa", "costa", "kostet", "quanto viene", "price", "prices", "cost", "how much", "prix", "combien", "tarif", "preis", "kosten", "wie viel", "prezio", "zenbat", "preu", "quant costa", "prezo", "canto custa", "precio", "precios", "cuesta", "cuanto vale", "tarifa", "coste", "barato", "cobrais", "cuanto sale"], r: precios },
    { k: ["preventivo", "quote", "estimate", "devis", "kostenvoranschlag", "angebot", "aurrekontu", "pressupost", "orzamento", "presupuesto", "sin compromiso", "valoracion"], r: function () { return L("Sí. Te damos <b>presupuesto cerrado y por escrito</b> antes de empezar, sin compromiso. No hacemos ningún trabajo sin tu aprobación y, si aparece algo nuevo, te avisamos antes."); } },
    { k: ["quanto tempo", "quanto ci vuole", "tempi", "how long", "take long", "combien de temps", "delai", "wie lange", "dauer", "zenbat denbora", "quant triga", "canto tarda", "tarda", "tardais", "plazo", "cuanto tiempo", "cuando esta", "mismo dia", "rapido", "urgente"], r: function () { return L("La mayoría de reparaciones están en <b>24-48 h</b>. Los mantenimientos (aceite, pre-ITV, neumáticos) suelen estar el mismo día. Con el presupuesto te damos la hora de entrega."); } },
    { k: ["auto di cortesia", "cortesia", "auto sostitutiva", "courtesy", "loan car", "replacement car", "vehicule de pret", "voiture de courtoisie", "ersatzwagen", "leihwagen", "ordezko", "cotxe de cortesia", "coche de cortesia", "cortesia", "sustitucion", "coche de alquiler", "me dejais un coche", "coche mientras"], v: "cortesia", r: function () { return L("Sí, tenemos <b>coche de cortesía</b> para reparaciones de más de un día, previa reserva. Pídelo al reservar la cita."); } },
    { k: ["garantia del fabricante", "garantia de la marca", "pierdo la garantia", "concesionario", "taller oficial", "libro de mantenimiento", "sellais"], r: function () { return L("No pierdes la garantía del fabricante por hacer el mantenimiento con nosotros: seguimos el plan de tu marca, usamos recambio original o de calidad equivalente y <b>sellamos tu libro de mantenimiento</b>."); } },
    { k: ["garanzia", "warranty", "guarantee", "garantie", "gewahrleistung", "berme", "garantia", "garantia", "garantias", "si falla despues", "vuelve a fallar"], r: function () { return L("Todas las reparaciones tienen <b>12 meses de garantía</b> en piezas y mano de obra, por escrito (la ley exige un mínimo de 3 meses o 2.000 km)."); } },
    { k: ["marche", "ibrid", "elettric", "furgone", "brand", "make", "hybrid", "electric", "marque", "hybride", "electrique", "marke", "elektro", "transporter", "marka", "hibrido", "furgoneta", "marca", "marcas", "hibrido", "electrico", "furgoneta", "moto", "camion", "todas las marcas"], r: function () { return L("Trabajamos con <b>turismos y furgonetas de cualquier marca</b>, incluidos híbridos. Para eléctricos o vehículos industriales, consúltanos el trabajo concreto. No reparamos motos."); } },
    { k: ["ritir", "venite a prendere", "pick up", "pickup", "collect", "chercher", "abholen", "abhol", "jaso", "recolli", "recoller", "recog", "domicilio", "a casa", "llevais", "venis a por"], r: function () { return L("Sí: en el municipio podemos <b>recoger y devolver tu coche</b>, bajo petición. Indícalo al pedir la cita."); } },
    { k: ["pagare", "pagamento", "carta", "contanti", "bonifico", "pay", "card", "cash", "payer", "carte", "especes", "bezahl", "karte", "ordaindu", "txartel", "pagament", "pagamento", "pago", "pagar", "tarjeta", "efectivo", "bizum", "transferencia", "financ", "plazos"], r: function () { return L("Puedes pagar con <b>tarjeta, efectivo, Bizum o transferencia</b>. Para importes altos, pregúntanos por el pago fraccionado."); } },
    { k: ["fattura", "ricevuta", "invoice", "receipt", "vat", "facture", "rechnung", "faktura", "tva", "factura", "ticket", "iva"], r: function () { return L("Siempre te damos <b>factura desglosada</b> con piezas, mano de obra e IVA. Si eres empresa o autónomo, dinos tu NIF/CIF y va a tu nombre."); } },
    { k: ["pieza vieja", "piezas viejas", "piezas sustituidas", "me devolveis", "pieza antigua"], r: function () { return L("Sí, si las quieres <b>te entregamos las piezas sustituidas</b> junto con el coche."); } },
    { k: ["ricambi", "pezzi", "parts", "spare", "pieces", "ersatzteil", "teile", "pieza", "pesa", "recanvi", "recambio", "ordezko pieza", "original", "recambio", "piezas de marca", "piezas"], r: function () { return L("Usamos <b>recambio original o de calidad equivalente</b> homologado. En el presupuesto te indicamos qué pieza montamos y, si prefieres original de marca, te decimos la diferencia."); } },
    { k: ["sin cita", "sin pedir cita", "pasar sin", "me puedo pasar", "walk"], r: function () { return L("Para comprobaciones rápidas (presión, niveles, luces) puedes venir sin cita. Para reparaciones o mantenimientos es mejor <b>reservar</b> y así no esperas."); }, o: function () { return [{ t: L("📅 Pedir cita"), f: citaInicio }]; } },
    { k: ["revisione", "mot", "inspection", "controle technique", "tuv", "hauptuntersuchung", "azterketa", "itv", "pre itv", "pasar la itv", "inspeccion"], r: function () { return L("Hacemos la <b>revisión pre-ITV desde 39 €</b>: luces, emisiones, frenos y lo que mira la estación. La ITV en sí la hace la estación oficial; te dejamos el coche preparado."); }, o: function () { return [{ t: L("📅 Pedir pre-ITV"), f: function () { citaInicio("Revisión pre-ITV"); } }]; } },
    { k: ["tagliando", "manutenzione", "ogni quanto", "service", "servicing", "oil", "how often", "entretien", "vidange", "huile", "wartung", "inspektion", "olio", "mantentze", "manteniment", "mantemento", "revisio", "cada cuanto", "kilometros", "cuando toca", "mantenimiento", "revision", "aceite"], r: function () { return L("Depende de cada fabricante (el aceite suele cambiarse entre 15.000 y 30.000 km o una vez al año). Mira tu libro de mantenimiento o usa nuestra <a href='#revision'>calculadora de revisión</a>."); }, o: function () { return [{ t: L("Abrir la calculadora"), href: "#revision" }, { t: L("📅 Pedir cita"), f: citaInicio }]; } },
    { k: ["pneumatic", "gomme", "gomma", "ruota", "foratura", "tyre", "tire", "tyres", "wheel", "puncture", "pneu", "roue", "crevaison", "reifen", "gurpil", "pneumatic", "roda", "pneumatico", "neumatico", "ruedas", "rueda", "pinchazo", "equilibrado", "alineado"], r: function () { return L("Montaje y equilibrado <b>desde 19 € por rueda</b>. Si no tienes neumáticos, te los buscamos para tu medida y te damos precio cerrado."); } },
    { k: ["la mia auto", "stato", "monitoraggio", "track", "status", "my car", "suivi", "ma voiture", "mein auto", "status", "jarraipen", "nire autoa", "seguiment", "el meu cotxe", "seguimento", "o meu coche", "seguimiento", "como va mi coche", "mi reparacion", "estado de mi coche", "ya esta mi coche", "matricula"], r: function () { return L("Puedes ver en qué paso está tu coche escribiendo la matrícula en <a href='#seguimiento'>Sigue tu reparación</a>. Ahí también apruebas el presupuesto."); }, o: function () { return [{ t: L("Ir al seguimiento"), href: "#seguimiento" }]; } },
    { k: ["telefono", "chiamare", "parlare con", "contatto", "human", "phone", "call", "contact", "telephone", "appeler", "anrufen", "telefon", "kontakt", "deitu", "trucar", "chamar", "persona", "humano", "hablar con", "llamar", "telefono", "whatsapp", "contacto", "correo", "email"], r: function () { return L("Claro. Llámanos al <b>{0}</b> o escríbenos por WhatsApp; respondemos en el día.", [TEL]); }, o: function () { return [{ t: L("Llamar"), href: TELH }, { t: L("WhatsApp"), href: WA }]; } },
    { k: ["anular", "cancelar cita", "cambiar la cita", "cambiar cita", "mover la cita"], r: function () { return L("Para cambiar o anular una cita, llámanos o escríbenos por WhatsApp con tu nombre y la hora reservada."); }, o: function () { return [{ t: L("WhatsApp"), href: WA }, { t: L("Llamar"), href: TELH }] ; } },
    { k: ["grazie", "thanks", "thank you", "merci", "danke", "eskerrik asko", "mila esker", "gracies", "grazas", "ok", "gracias", "vale", "perfecto", "genial"], r: function () { return L("¡A ti! Si necesitas algo más, aquí estoy."); } },
    { k: ["ciao", "buongiorno", "salve", "hello", "hi", "bonjour", "salut", "hallo", "guten tag", "kaixo", "egun on", "bon dia", "ola", "bos dias", "hola", "buenas", "buenos dias", "buenas tardes"], r: function () { return L("¡Hola! ¿Quieres pedir cita o tienes alguna duda?"); } }
  ];
  /* palabras para reconocer cada servicio en los 8 idiomas */
  var SVK = {
    "Cambio de aceite y filtros": ["cambio de aceite", "aceite", "oil change", "oil", "vidange", "huile", "olwechsel", "ol ", "olio", "cambio olio", "olio-aldaketa", "olioa", "canvi d oli", "oli ", "cambio de aceite"],
    "Kit de distribución": ["distribuci", "timing belt", "cambelt", "courroie", "zahnriemen", "distribuzione", "cinghia", "banaketa", "correa"],
    "Aire acondicionado": ["aire acondicionado", "aire condicionat", "aire girotu", "air con", "aircon", "air conditioning", "clim", "klima", "aria condizionata", "climatizz"],
    "Frenos": ["freno", "frenos", "pastilla", "pastille", "disc", "brake", "pads", "frein", "plaquette", "bremse", "bremsen", "freni", "pastiglie", "balazta", "fre ", "frens", "freos"],
    "Neumáticos": ["neumatic", "rueda", "tyre", "tire", "pneu", "reifen", "gomme", "pneumatic", "gurpil", "roda"],
    "Batería": ["bateria", "battery", "batterie", "batteria"],
    "Revisión pre-ITV": ["itv", "mot ", "controle technique", "tuv", "hauptuntersuchung", "revisione", "azterketa"],
    "Diagnosis electrónica": ["diagnos", "diagnostic", "diagnose", "diagnosi"]
  };
  /* síntomas: sin diagnóstico a distancia */
  var SINTOMA = /\b(rumore|cigol|fumo|odore|perdita|spia|non parte|si spegne|surriscald|guasto|vibra|cosa ha|problema|noise|squeak|smoke|smell|leak|warning light|light on|won t start|doesn t start|stalls|overheat|brake|brakes|vibrat|what s wrong|problem|bruit|grince|fumee|odeur|fuite|voyant|demarre pas|surchauffe|frein|panne|gerausch|quietsch|rauch|geruch|leck|kontrollleuchte|springt nicht an|uberhitz|bremse|panne|defekt|zarata|ke |usain|ihes|argia|ez da abiatzen|balazta|matxura|soroll|fum|olor|fuita|llum|no arrenca|fre |frens|avaria|ruido|fume|cheiro|perde|luz|non arranca|freo|avaria|ruidos|chirri|chirria|vibra|vibracion|humo|olor|huele|pierde|gotea|fuga|mancha|no arranca|no enciende|se cala|calado|tirones|tiembla|testigo|piloto|luz roja|luz naranja|se calienta|calienta|temperatura|averia|falla|fallo|se para|no frena|frena mal|pedal|embrague patina|que le pasa|que puede ser|que tiene|por que)\b/;
  var PELIGRO = /\b(fumo|bruciato|spia rossa|non frena|freni|surriscald|smoke|burning|brake|red light|overheat|fumee|brule|frein|voyant rouge|surchauffe|rauch|verbrannt|bremse|rote|uberhitz|ke |erre|balazta|argi gorri|fum|cremat|fre |frens|llum vermella|fume|queimado|freo|luz vermella|humo|quemado|no frena|frena mal|pedal|luz roja|testigo rojo|temperatura|se calienta|aceite|se para|direccion dura)\b/;
  function responder(t) {
    var n = nrm(t);
    if (/\b(cita|reserv|hueco|turno|apunt|llevar el coche|llevarlo|appointment|book|booking|slot|rendez|rdv|termin|hitzordu|txanda|hora lliure|prenot|appuntamento)/.test(n) && !/\b(anular|cancelar|cambiar|mover|cancel|annul|absag|storn|verschieb|ezeztatu|aldatu|anul la|annull|disdir|spostar)/.test(n)) return citaInicio();
    if (SINTOMA.test(n) && !/\b(precio|cuesta|horario|cortesia|price|cost|prix|preis|kostet|prezio|preu|prezo|prezzo|costa)\b/.test(n)) {
      return bot(L("No podemos decirte qué tiene tu coche sin verlo: un diagnóstico a distancia podría ser incorrecto.") + (PELIGRO.test(n) ? " <b>" + L("Si notas humo, olor a quemado, un testigo rojo encendido o fallan los frenos, no sigas circulando y llámanos al {0}.", [TEL]) + "</b>" : "") +
        " " + L("Te propongo una <b>cita de diagnosis</b> (desde 35 €, se descuenta si haces la reparación con nosotros)."), [{ t: L("📅 Cita de diagnosis"), f: function () { citaInicio("Diagnosis electrónica"); } }, { t: L("Llamar"), href: TELH }]);
    }
    var mejor = null, pm = 0;
    FAQ.forEach(function (q) { var p = 0; q.k.forEach(function (k) { if (n.indexOf(" " + k) >= 0 || n.indexOf(k + " ") >= 0) p += k.length > 6 ? 2 : 1; }); if (p > pm) { pm = p; mejor = q; } });
    var sv = (T.servicios || []).filter(function (s) { return (SVK[s.nombre] || []).some(function (k) { return n.indexOf(" " + k) >= 0; }); })[0] || (T.servicios || []).filter(function (s) { return [s.nombre, L(s.nombre)].some(function (nm) { nm = nrm(nm).trim(); return n.indexOf(" " + nm.split(" ")[0]) >= 0 || nm.indexOf(n.trim()) >= 0 && n.trim().length > 4; }); })[0];
    if (sv && (!mejor || /precio|cuesta|vale|cuanto|incluye|price|cost|how much|prix|combien|coute|preis|kostet|wie viel|prezio|zenbat|preu|quant|prezo|canto|custa|prezzo|costa|quanto|include/.test(n) || pm < 2)) {
      return bot(L("<b>{0}</b>: desde <b>{1}</b> (IVA incluido).", [esc(L(sv.nombre)), eur(sv.precio)]) + " " + esc(L(sv.descr)) + (sv.specs && sv.specs.length ? "<ul>" + sv.specs.map(function (x) { return "<li>" + esc(L(x)) + "</li>"; }).join("") + "</ul>" : "") + L("Precio orientativo: el definitivo te lo damos cerrado antes de empezar."),
        [{ t: L("📅 Reservar {0}", [L(sv.nombre).toLowerCase()]), f: function () { citaInicio(sv.nombre); } }, { t: L("Otra pregunta"), f: function () { bot(L("Dime."), MENU()); } }]);
    }
    if (mejor) return bot(mejor.r(), mejor.o ? mejor.o() : [{ t: L("📅 Pedir cita"), f: citaInicio }, { t: L("Otra pregunta"), f: function () { bot(L("Dime, ¿qué más quieres saber?"), MENU()); } }]);
    bot(L("No estoy seguro de haberte entendido. Puedo ayudarte con citas, precios, plazos, garantía o el coche de cortesía. Si lo prefieres, habla con nosotros."), [{ t: L("📅 Pedir cita"), f: citaInicio }, { t: L("Precios"), v: "precios" }, { t: L("Llamar"), href: TELH }, { t: L("WhatsApp"), href: WA }]);
  }

  /* ---------- pedir cita (datos reales del servidor) ---------- */
  var C = {};
  function cancelar() { flujo = null; C = {}; bot(L("Vale, lo dejamos aquí. ¿Te ayudo con otra cosa?"), MENU()); }
  function esCancelar(t) { return /^\s*(cancelar|salir|dejalo|déjalo|no quiero|cancel|stop|annuler|abbrechen|utzi|ezeztatu|cancel·lar|deixa-ho|deixao)\s*$/i.test(t); }
  function citaInicio(serv) {
    C = { servicio: typeof serv === "string" ? serv : "" };
    if (C.servicio) return pideDia();
    var l = (T.servicios || []).slice(0, 8);
    flujo = function (t) { if (esCancelar(t)) return cancelar(); C.servicio = t.slice(0, 80); pideDia(); };
    bot(L("Perfecto, te doy cita. ¿Qué necesitas? Elige o escríbelo con tus palabras."), l.map(function (s) { return { t: L(s.nombre), f: function () { C.servicio = s.nombre; pideDia(); } }; }).concat([{ t: L("Cancelar"), f: cancelar }]));
  }
  function pideDia() {
    flujo = function (t) { if (esCancelar(t)) return cancelar(); bot(L("Elige uno de los días de abajo, por favor."), opcionesDia()); };
    bot(L("Para <b>{0}</b>, ¿qué día te viene bien?", [esc(L(C.servicio))]), opcionesDia());
  }
  function opcionesDia() {
    var o = [], d = new Date();
    for (var i = 0; o.length < 6 && i < 14; i++) {
      var x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i); if (x.getDay() === 0) continue;
      (function (f, et) { o.push({ t: et, f: function () { pideHora(f); } }); })(T.iso(x), i === 0 ? L("Hoy") : i === 1 ? L("Mañana") : diaCorto(x));
    }
    return o.concat([{ t: L("Cancelar"), f: cancelar }]);
  }
  function pideHora(f) {
    C.fecha = f; flujo = null;
    var esp = burbuja(L("Miro las horas libres…"));
    fetch("/api/huecos?fecha=" + f).then(function (r) { return r.json(); }).then(function (j) {
      esp.remove();
      var lib = (j.horas || []).filter(function (h) { return h.libre; });
      if (!lib.length) return bot(L("Ese día no nos quedan horas libres. Elige otro, por favor."), opcionesDia());
      flujo = function (t) { var h = (t.match(/\d{1,2}[:.]\d{2}/) || [""])[0].replace(".", ":").padStart(5, "0"); var ok = lib.filter(function (x) { return x.hora === h; })[0]; if (esCancelar(t)) return cancelar(); if (ok) { C.hora = h; pideNombre(); } else bot(L("Elige una de estas horas, por favor."), horasO(lib)); };
      bot(L("El {0} tengo libre:", [esc(T.bonita(f))]), horasO(lib));
    }).catch(function () { esp.remove(); bot(L("No he podido consultar la agenda ahora mismo. Puedes llamarnos o escribirnos por WhatsApp."), [{ t: L("Llamar"), href: TELH }, { t: L("WhatsApp"), href: WA }]); flujo = null; });
  }
  function diaCorto(x) { if (I.lang === "es") return DIAS[x.getDay()].replace(/^./, function (c) { return c.toUpperCase(); }) + " " + x.getDate(); var w = x.toLocaleDateString(I.locale, { weekday: "short", day: "numeric" }); return w.replace(/^./, function (c) { return c.toUpperCase(); }); }
  function horasO(lib) { return lib.slice(0, 12).map(function (h) { return { t: h.hora, f: function () { C.hora = h.hora; pideNombre(); } }; }).concat([{ t: L("Otro día"), f: pideDia }]); }
  function pideNombre() {
    flujo = function (t) { if (esCancelar(t)) return cancelar(); if (t.trim().length < 2) return bot(L("Escribe tu nombre, por favor.")); C.nombre = t.trim().slice(0, 60); pideTel(); };
    bot(L("Genial: {0} a las <b>{1}</b>. ¿A nombre de quién?", [esc(T.bonita(C.fecha)), C.hora]), [{ t: L("Cancelar"), f: cancelar }]);
  }
  function pideTel() {
    flujo = function (t) { if (esCancelar(t)) return cancelar(); var v = t.replace(/[^\d+ ]/g, "").trim(); if (v.replace(/\D/g, "").length < 9) return bot(L("Necesito un teléfono de 9 cifras para avisarte.")); C.telefono = v; pideCoche(); };
    bot(L("Gracias, {0}. ¿Un teléfono para avisarte?", [esc(C.nombre.split(" ")[0])]));
  }
  function pideCoche() {
    flujo = function (t) { if (esCancelar(t)) return cancelar(); C.vehiculo = t.trim().slice(0, 80); confirmar(); };
    bot(L("¿Qué coche es? (marca, modelo y, si la sabes, la matrícula)"), [{ t: L("Prefiero decirlo en el taller"), f: function () { C.vehiculo = ""; confirmar(); } }]);
  }
  function confirmar() {
    flujo = function (t) { if (esCancelar(t) || /^(no|non|nein|ez)\b/i.test(t)) return cancelar(); if (/^(si|sí|vale|ok|confirmo|acepto|yes|yep|oui|ja|bai|d'acord|confirm|bestätig|accept)/i.test(t.trim())) return enviar(); bot(L("¿Confirmo la cita?"), optsConf()); };
    bot(L("Resumen de tu cita:") + "<ul><li>" + esc(L(C.servicio)) + "</li><li>" + L("{0} a las {1}", [esc(T.bonita(C.fecha)), C.hora]) + "</li><li>" + esc(C.nombre) + " · " + esc(C.telefono) + "</li>" + (C.vehiculo ? "<li>" + esc(C.vehiculo) + "</li>" : "") + "</ul><small>" + L("Usaremos tus datos solo para gestionar esta cita.") + "</small>", optsConf());
  }
  function optsConf() { return [{ t: L("✅ Confirmar cita"), f: enviar }, { t: L("Cambiar la hora"), f: function () { pideHora(C.fecha); } }, { t: L("Cancelar"), f: cancelar }]; }
  function enviar() {
    flujo = null; var esp = burbuja(L("Reservando…"));
    fetch("/api/citas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre: C.nombre, telefono: C.telefono, vehiculo: C.vehiculo, servicio: C.servicio, fecha: C.fecha, hora: C.hora, privacidad: true, origen: "chat" }) })
      .then(function (r) { return r.json().then(function (j) { j._ok = r.ok; j._st = r.status; return j; }); })
      .then(function (j) {
        esp.remove();
        if (j._ok && j.ok && j.cita) { bot(L("✅ <b>Cita registrada</b> para el {0} a las {1} ({2}). Te llamaremos para confirmarla. ¡Gracias!", [esc(T.bonita(j.cita.fecha)), esc(j.cita.hora), esc(L(j.cita.servicio))]), [{ t: L("Otra pregunta"), f: function () { bot(L("Dime."), MENU()); } }]); C = {}; return; }
        if (j._st === 409) return bot(esc(L(j.error || "Esa hora ya no está libre.")), [{ t: L("Ver otras horas"), f: function () { pideHora(C.fecha); } }, { t: L("Otro día"), f: pideDia }]);
        bot(esc(L(j.error || "No he podido guardar la cita.")) + " " + L("Si quieres, llámanos y te la damos por teléfono."), [{ t: L("Llamar"), href: TELH }, { t: L("WhatsApp"), href: WA }]);
      })
      .catch(function () { esp.remove(); bot(L("No he podido conectar con la agenda: la cita <b>no</b> se ha guardado. Llámanos o escríbenos por WhatsApp."), [{ t: L("Llamar"), href: TELH }, { t: L("WhatsApp"), href: WA }]); });
  }

  window.TMNChat = { abrir: function () { abrir(true); }, reservar: function (s) { if (!abierto) { abrir(true); } burbuja(L("Quiero reservar: {0}", [esc(L(s))]), true); citaInicio(s); } };
})();
