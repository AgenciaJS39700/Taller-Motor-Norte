/* /extra.js — Taller Motor Norte: parallax de la banda, testigos del salpicadero y seguimiento de la reparación (datos reales del panel del taller) */
(function () {
  "use strict";
  var S = window.SITE || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var esc = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var wa = function (t) { return "https://wa.me/" + (S.wa || "") + "?text=" + encodeURIComponent(t); };

  /* ---------- Testigos del salpicadero ---------- */
  var ICON = {
    motor: '<path d="M10 26h6v-6h8l4-4h12v6h6l4 6h4v14h-4l-4 6H28l-6-6h-6v-6h-6z"/><path d="M24 16v-4h12v4"/>',
    aceite: '<path d="M6 34l10-6h14l6 6h12l10-8v4l-12 14H18L6 38z"/><path d="M30 28v-6h-6M58 24c0 4-3 6-3 8a3 3 0 0 0 6 0c0-2-3-4-3-8z"/>',
    bateria: '<rect x="8" y="18" width="48" height="32" rx="3"/><path d="M16 18v-5h8v5M40 18v-5h8v5M17 34h8M21 30v8M39 34h8"/>',
    temp: '<path d="M32 8v28"/><circle cx="32" cy="42" r="7"/><path d="M32 14h7M32 21h7M32 28h7M8 54c4-3 8-3 12 0s8 3 12 0 8-3 12 0 8 3 12 0"/>',
    frenos: '<circle cx="32" cy="32" r="16"/><path d="M14 16a24 24 0 0 0 0 32M50 16a24 24 0 0 1 0 32M32 22v12"/><circle cx="32" cy="40" r="1.6" fill="currentColor"/>',
    abs: '<circle cx="32" cy="32" r="16"/><path d="M14 16a24 24 0 0 0 0 32M50 16a24 24 0 0 1 0 32"/><text x="32" y="37" text-anchor="middle" font-size="12" font-weight="800" font-family="system-ui,sans-serif" fill="currentColor" stroke="none">ABS</text>',
    airbag: '<circle cx="22" cy="14" r="5"/><path d="M18 22l-4 16h14l6 14M24 38l8-8"/><circle cx="44" cy="30" r="12"/>',
    tpms: '<path d="M16 18c-6 6-6 22 0 28h32c6-6 6-22 0-28z"/><path d="M14 50h4M24 50h4M36 50h4M46 50h4M32 24v12"/><circle cx="32" cy="41" r="1.6" fill="currentColor"/>'
  };
  var T = [
    { id: "motor", n: "Fallo de motor", l: "a", short: "Motor", what: "La centralita ha detectado un fallo en el motor o en las emisiones (sondas, bujías, catalizador…).", todo: ["Si parpadea: reduce la marcha y no fuerces el motor.", "Si está fijo: puedes circular con calma hasta el taller.", "Lo leemos con la diagnosis y te decimos el fallo exacto."], svc: "Diagnosis electrónica" },
    { id: "aceite", n: "Presión de aceite", l: "r", short: "Aceite", what: "El motor no tiene presión de aceite suficiente. Circular así puede gripar el motor en minutos.", todo: ["Detén el coche en cuanto sea seguro y apaga el motor.", "Comprueba el nivel con la varilla (en frío).", "No sigas circulando: te recogemos con la grúa."], svc: "Cambio de aceite y filtros" },
    { id: "bateria", n: "Carga de batería", l: "r", short: "Batería", what: "El sistema de carga no funciona: alternador, correa o batería. El coche se quedará sin corriente.", todo: ["Apaga lo que no necesites (aire, radio, asientos).", "Ve directo al taller sin apagar el motor si estás cerca.", "Hacemos test de carga gratis al traer el coche."], svc: "Batería" },
    { id: "temp", n: "Temperatura del motor", l: "r", short: "Temperatura", what: "El motor se está calentando demasiado: falta de refrigerante, termostato o ventilador.", todo: ["Para en cuanto puedas y deja el motor al ralentí 1 minuto.", "No abras el depósito de refrigerante en caliente.", "Llámanos: valoramos si puede venir rodando o con grúa."], svc: "Diagnosis electrónica" },
    { id: "frenos", n: "Sistema de frenos", l: "r", short: "Frenos", what: "Freno de mano puesto, nivel de líquido bajo o fallo en el circuito de frenos.", todo: ["Comprueba que el freno de mano esté quitado.", "Si sigue encendido, no circules: la frenada puede fallar.", "Revisamos líquido, pastillas y discos en el día."], svc: "Frenos" },
    { id: "abs", n: "ABS", l: "a", short: "ABS", what: "El antibloqueo de frenos está desactivado. Frenas, pero las ruedas pueden bloquearse en una frenada fuerte.", todo: ["Puedes circular con más distancia de seguridad.", "Suele ser un sensor de rueda sucio o dañado.", "Pide cita pronto: lo diagnosticamos en 30 minutos."], svc: "Frenos" },
    { id: "airbag", n: "Airbag", l: "a", short: "Airbag", what: "Hay un fallo en el sistema de airbags o pretensores: en caso de accidente podrían no saltar.", todo: ["El coche funciona, pero la seguridad pasiva está limitada.", "No manipules los conectores bajo los asientos.", "Es motivo de ITV desfavorable: revísalo antes."], svc: "Diagnosis electrónica" },
    { id: "tpms", n: "Presión de neumáticos", l: "a", short: "Neumáticos", what: "Uno o varios neumáticos han perdido presión, o hay un pinchazo lento.", todo: ["Revisa la presión en la próxima gasolinera.", "Si una rueda se ve baja, cambia a la de repuesto.", "Reparamos pinchazos y reiniciamos el sensor."], svc: "Neumáticos" }
  ];
  var dash = $("#dash");
  if (dash) {
    var svg = function (p) { return '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + p + "</svg>"; };
    dash.innerHTML = '<div><div class="tw-g" role="group" aria-label="Testigos del salpicadero">' + T.map(function (t) {
      return '<button type="button" class="tw" data-id="' + t.id + '" data-l="' + t.l + '" aria-pressed="false" aria-label="' + esc(t.n) + '">' + svg(ICON[t.id]) + "<small>" + esc(t.short) + "</small></button>";
    }).join("") + '</div><p class="tw-d hint" style="background:none;border:0;padding:.8rem 0 0;min-height:0">Rojo: para en cuanto puedas. Ámbar: puedes circular con precaución y pedir cita pronto.</p></div><div class="tw-d" id="twd" aria-live="polite"></div>';
    var det = $("#twd");
    var show = function (id, user) {
      var t = T.filter(function (x) { return x.id === id; })[0];
      [].forEach.call(dash.querySelectorAll(".tw"), function (b) { var on = b.dataset.id === id; b.setAttribute("aria-pressed", String(on)); b.classList.toggle("blink", on && t.l === "r"); });
      det.innerHTML = '<span class="lvl ' + t.l + '"><i></i>' + (t.l === "r" ? "Urgente · para el coche" : "Precaución · pide cita pronto") + "</span><h3>" + esc(t.n) + "</h3><p>" + esc(t.what) + "</p><ul>" + t.todo.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + '</ul><div class="trk-a"><a class="btn btn-main" target="_blank" rel="noopener" href="' + wa("Hola, se me ha encendido el testigo de " + t.n.toLowerCase() + ". ¿Me podéis dar cita? Servicio: " + t.svc) + '">' + (S.icons && S.icons.wa || "") + "Pedir cita por este testigo</a>" + (t.l === "r" ? '<a class="btn btn-ghost" href="tel:+' + esc(S.wa || "") + '">Llamar ahora</a>' : "") + '</div><p class="hint">Orientativo. Consulta siempre el manual de tu coche: cada marca usa símbolos parecidos.</p>';
      if (user && window.innerWidth < 900) det.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
    };
    dash.addEventListener("click", function (e) { var b = e.target.closest(".tw"); if (b) show(b.dataset.id, true); });
    show("motor");
  }

  /* ---------- Seguimiento de la reparación ---------- */
  var trk = $("#trk");
  if (trk) {
    /* Datos reales: el taller mueve cada paso desde su panel y aquí se ve al momento (/api/seguimiento). */
    trk.innerHTML = '<form class="trk-f" id="trkf" novalidate><label class="plate"><span>E</span><input id="mat" maxlength="9" autocomplete="off" autocapitalize="characters" placeholder="1234 KLM" aria-label="Matrícula"></label><button class="btn btn-main" type="submit">Ver mi coche</button><button class="btn btn-ghost" type="button" id="trkd">Probar la demo</button></form><p class="stt" id="trks" role="status" aria-live="polite"></p>' +
      '<div class="trk-c" id="trkc"><div class="trk-ph"><img id="trkimg" src="img/frenos-m.webp" alt="Foto del mecánico" loading="lazy" decoding="async"><span class="live"><i></i>Foto del mecánico</span></div><div class="trk-b"><div><h3 id="trkt"></h3><div class="eta"><span>Mecánico: <b id="mec"></b></span><span>Entrega estimada: <b id="eta"></b></span></div><p class="trk-n" id="trkn"></p></div><div class="bar" aria-hidden="true"><i id="trkbar"></i></div><div class="stps" id="stps"></div><div id="bud"></div></div></div>';
    var plate = "", R = null, timer = 0;
    var eur = function (n) { return Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " €"; };
    var draw = function () {
      var r = R, cur = Math.min(r.paso, 4);
      $("#trkt").textContent = (r.vehiculo || "Tu coche") + " · " + r.matricula;
      $("#mec").textContent = r.mecanico || "—";
      $("#eta").textContent = r.entrega || "te avisamos";
      $("#trkn").textContent = r.nota || "";
      if (r.foto) { $("#trkimg").src = r.foto; }
      $("#trkbar").style.width = (cur / 4 * 100) + "%";
      $("#stps").innerHTML = r.pasos.map(function (s, i) {
        var h = (r.historial || []).filter(function (x) { return x.p === i; }).pop();
        var sub = i === 2 && r.aprobado ? "Aprobado" : h ? h.t.slice(11) + (h.t.slice(0, 10) === new Date().toISOString().slice(0, 10) ? " · hoy" : " · " + h.t.slice(8, 10) + "/" + h.t.slice(5, 7)) : "";
        return '<div class="stp2 ' + (i < cur ? "done" : i === cur ? "now" : "") + '"><span class="dot">' + (i < cur ? "✓" : i + 1) + "</span><span><b>" + esc(s) + "</b><small>" + esc(sub) + "</small></span></div>";
      }).join("");
      var b = $("#bud");
      if (r.paso === 2 && !r.aprobado && r.presupuesto.length) {
        b.innerHTML = '<div class="bud">' + r.presupuesto.map(function (x) { return "<div><span>" + esc(x.c) + "</span><span>" + eur(x.i) + "</span></div>"; }).join("") + "<div><span>Total cerrado (IVA incl.)</span><span>" + eur(r.total) + '</span></div></div>' +
          '<form class="apr" id="aprf" novalidate><label for="t4">Para aprobarlo, escribe las 4 últimas cifras de tu teléfono</label><div class="trk-a" style="margin-top:.4rem"><input id="t4" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="0000"><button class="btn btn-main" type="submit">Aprobar presupuesto</button><a class="btn btn-ghost" target="_blank" rel="noopener" href="' + wa("Hola, tengo una duda sobre el presupuesto del coche " + r.matricula) + '">Tengo una duda</a></div>' + (window.TMN_DEMO ? '<small class="hint">Demo: las cifras son 4719.</small>' : "") + '<p class="stt" id="aprs" role="alert"></p></form>';
        $("#aprf").addEventListener("submit", function (e) {
          e.preventDefault(); var t4 = $("#t4").value.replace(/\D/g, ""), st = $("#aprs");
          if (t4.length !== 4) { st.textContent = "Escribe 4 cifras."; return; }
          var bt = $("#aprf .btn-main"); bt.disabled = true; st.textContent = "Enviando…";
          fetch("/api/seguimiento/aprobar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ m: plate, tel4: t4 }) })
            .then(function (x) { return x.json().then(function (j) { if (!x.ok) throw new Error(j.error || "No se ha podido aprobar."); return j; }); })
            .then(function (j) { R = j.reparacion; if (window.TMN_DEMO && plate === "1234KLM") clearInterval(timer); draw(); $("#trks").textContent = "¡Presupuesto aprobado! Ya estamos trabajando en tu coche."; })
            .catch(function (x) { st.textContent = /fetch|network/i.test(x.message) ? "No se ha podido conectar. Inténtalo de nuevo." : x.message; bt.disabled = false; });
        });
      } else if (r.paso === 4) {
        b.innerHTML = '<div class="trk-a"><a class="btn btn-wa" target="_blank" rel="noopener" href="' + wa("Hola, paso a recoger el coche " + r.matricula) + '">' + (S.icons && S.icons.wa || "") + "Avisar de que voy</a></div>";
      } else b.innerHTML = "";
    };
    var cargar = function (p, silencio) {
      plate = p; if (!silencio) $("#trks").textContent = "Buscando tu coche…";
      return fetch("/api/seguimiento?m=" + encodeURIComponent(p)).then(function (x) { return x.json().then(function (j) { if (!x.ok) throw new Error(j.error || "No encontrado."); return j; }); })
        .then(function (j) { R = j.reparacion; $("#trkc").classList.add("on"); if (!silencio) $("#trks").textContent = R.paso >= 4 ? "Tu coche está listo." : "Se actualiza solo: no hace falta recargar."; draw();
          clearInterval(timer); timer = setInterval(function () { if (!document.hidden && document.contains(trk)) cargar(plate, true).catch(function () {}); }, 30000); })
        .catch(function (x) { if (silencio) return; $("#trkc").classList.remove("on"); clearInterval(timer); $("#trks").textContent = /fetch|network|JSON/i.test(x.message) ? "No se ha podido conectar con el taller. Inténtalo en un momento." : x.message; });
    };
    $("#trkf").addEventListener("submit", function (e) {
      e.preventDefault();
      var v = $("#mat").value.toUpperCase().replace(/[^0-9A-Z]/g, "");
      if (!/^\d{4}[A-Z]{3}$/.test(v) && !/^[A-Z]{1,2}\d{4}[A-Z]{0,2}$/.test(v)) { $("#trks").textContent = "Escribe una matrícula como 1234 KLM o pulsa «Probar la demo»."; return; }
      cargar(v);
    });
    $("#trkd").addEventListener("click", function () { $("#mat").value = "1234 KLM"; cargar("1234KLM"); });
  }
})();
