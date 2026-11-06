/* admin.js — Panel de Taller Motor Norte: resumen de ventas, citas, reparaciones, facturas, servicios y datos fiscales. */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var esc = function (t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var eur = function (n) { return Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €"; };
  var eur0 = function (n) { return Number(n || 0).toLocaleString("es-ES", { maximumFractionDigits: 0 }) + " €"; };
  var iso = function (d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  var fNum = function (f) { return f ? f.slice(8, 10) + "/" + f.slice(5, 7) + "/" + f.slice(0, 4) : ""; };
  var sum = function (f, n) { var d = new Date(f + "T12:00:00"); d.setDate(d.getDate() + n); return iso(d); };
  var MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  var CATS = { mant: "Mantenimiento", seg: "Seguridad", elec: "Electrónica y confort" }, METN = { tarjeta: "Tarjeta", efectivo: "Efectivo", bizum: "Bizum", transferencia: "Transferencia" };
  var PASOS = ["Recibido en el taller", "Diagnóstico", "Presupuesto enviado", "En reparación", "Listo para recoger", "Entregado"];
  var IMGS = ["aceite", "distribucion", "aire", "frenos", "neumaticos", "bateria", "itv", "diagnosis"];
  var YO = {}, HOY = iso(new Date());
  function importe(v) { v = String(v || "").replace(/[€\s]/g, ""); if (v.indexOf(",") >= 0) v = v.replace(/\./g, "").replace(",", "."); else if (/^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, ""); return parseFloat(v) || 0; }
  var waUrl = function (tel, txt) { var t = String(tel || "").replace(/\D/g, ""); if (t.length === 9) t = "34" + t; return t.length >= 11 ? "https://wa.me/" + t + "?text=" + encodeURIComponent(txt) : ""; };
  var pl = function (n, a, b) { return n + " " + (n === 1 ? a : b); };
  var nombre1 = function (n) { return String(n || "").split(" ")[0]; };

  function api(ruta, datos) {
    return fetch("/api/admin/" + ruta, datos === undefined ? { credentials: "same-origin" } : { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(datos) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (r.status === 401 && ruta !== "login") { salida(); } if (!r.ok) throw new Error(j.error || "No se ha podido completar."); return j; }); })
      .catch(function (e) { if (/fetch|network/i.test(e.message)) throw new Error("No hay conexión con el servidor. Inténtalo de nuevo."); throw e; });
  }
  var tt; function toast(t) { var x = $("#toast"); x.textContent = t; x.hidden = false; clearTimeout(tt); tt = setTimeout(function () { x.hidden = true; }, 3200); }

  /* ---------- acceso con candado y ojo ---------- */
  function ojo(inp, ver) { inp.type = ver ? "text" : "password"; var b = inp.parentNode.querySelector(".ojo"); if (b) { b.setAttribute("aria-pressed", String(ver)); b.setAttribute("aria-label", ver ? "Ocultar contraseña" : "Mostrar contraseña"); b.title = b.getAttribute("aria-label"); } }
  document.addEventListener("click", function (e) { var b = e.target.closest(".ojo"); if (!b) return; var i = document.getElementById(b.dataset.ojo); ojo(i, i.type === "password"); i.focus(); });
  function salida() { $("#app").hidden = true; $("#login").hidden = false; ojo($("#lc"), false); $("#lc").value = ""; }
  function entrada(j) { YO = j; HOY = j.hoy || HOY; $("#login").hidden = true; $("#app").hidden = false; $("#demoAv").hidden = !j.demo; ir(location.hash.slice(1) || "resumen"); }
  $("#flog").addEventListener("submit", function (e) {
    e.preventDefault(); $("#le").textContent = "";
    var c = $("#lc").value; if (!c) { $("#le").textContent = "Escribe la contraseña."; return; }
    var b = $("#flog .btn-p"); b.disabled = true;
    api("login", { clave: c, recordar: $("#lr").checked }).then(function () { return api("yo"); }).then(entrada).catch(function (x) { $("#le").textContent = x.message; }).then(function () { b.disabled = false; });
  });
  $("#salir").addEventListener("click", function () { api("salir", {}).catch(function () {}).then(salida); });
  api("yo").then(function (j) { if (j.ok) entrada(j); }).catch(function () {});

  /* ---------- pestañas ---------- */
  var CARGA = { resumen: resumen, citas: citas, reps: reps, clis: clientes, pres: presupuestos, facs: facturas, caja: caja, mecs: mecanicos, servs: servicios, datos: misDatos };
  function ir(t) {
    if (!CARGA[t]) t = "resumen";
    $$(".tabs button").forEach(function (b) { b.setAttribute("aria-selected", String(b.dataset.t === t)); });
    $$(".sec").forEach(function (s) { s.hidden = s.id !== "s-" + t; });
    if (location.hash.slice(1) !== t) history.replaceState(null, "", "#" + t);
    CARGA[t]();
  }
  $(".tabs").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { ir(b.dataset.t); b.scrollIntoView({ block: "nearest", inline: "nearest" }); } });
  document.addEventListener("click", function (e) { if (e.target.closest("dialog [data-x]")) e.target.closest("dialog").close(); });

  /* ---------- RESUMEN ---------- */
  var RP = "mes", RREF = null;
  $("#rSeg").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; RP = b.dataset.p; RREF = null; $$("#rSeg button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); resumen(); });
  function mover(n) { var r = RREF || HOY, d = new Date(r + "T12:00:00"); if (RP === "dia") d.setDate(d.getDate() + n); else if (RP === "semana") d.setDate(d.getDate() + 7 * n); else if (RP === "mes") { d.setDate(1); d.setMonth(d.getMonth() + n); } else if (RP === "trimestre") { d.setDate(1); d.setMonth(d.getMonth() + 3 * n); } else d.setFullYear(d.getFullYear() + n); RREF = iso(d); resumen(); }
  $("#rAnt").addEventListener("click", function () { mover(-1); }); $("#rSig").addEventListener("click", function () { mover(1); });
  function nombreP(j) { var a = j.desde, b = j.hasta, d = new Date(a + "T12:00:00"); if (j.periodo === "dia") return (a === HOY ? "Hoy, " : "") + fNum(a); if (j.periodo === "semana") return "Semana del " + fNum(a) + " al " + fNum(b); if (j.periodo === "mes") return MESES[d.getMonth()].replace(/^./, function (c) { return c.toUpperCase(); }) + " de " + d.getFullYear(); if (j.periodo === "trimestre") return (Math.floor(d.getMonth() / 3) + 1) + "º trimestre de " + d.getFullYear(); return "Año " + d.getFullYear(); }
  function barras(el, l, val, lab, txt) {
    var mx = Math.max.apply(null, l.map(val).concat([1])), best = l.reduce(function (a, x) { return val(x) > val(a) ? x : a; }, l[0] || {});
    el.innerHTML = l.length ? l.map(function (x) { return '<div class="bar' + (x === best && val(x) > 0 ? " pico" : "") + '"><span title="' + esc(lab(x)) + '">' + esc(lab(x)) + '</span><span class="t" role="img" aria-label="' + esc(lab(x) + ": " + txt(x)) + '"><i style="width:' + (val(x) / mx * 100).toFixed(1) + '%"></i></span><b>' + esc(txt(x)) + "</b></div>"; }).join("") : '<p class="vacio">Sin datos en este periodo.</p>';
  }
  function resumen() {
    api("resumen?periodo=" + RP + (RREF ? "&ref=" + RREF : "")).then(function (j) {
      $("#rP").textContent = nombreP(j);
      var a = j.actual, p = j.anterior, dif = p.total && p.comparable ? Math.round((a.total - p.total) / p.total * 100) : null;
      $("#rK").innerHTML = '<div class="card kpi"><span>Facturado (IVA incl.)</span><b>' + eur0(a.total) + '</b><span class="d ' + (dif == null ? "" : dif >= 0 ? "up" : "dn") + '">' + (dif == null ? "Sin datos del periodo anterior" : (dif >= 0 ? "▲ " : "▼ ") + Math.abs(dif) + " % frente " + (j.parcial ? "a los mismos días del periodo anterior" : "al periodo anterior")) + "</span></div>" +
        '<div class="card kpi"><span>Facturas</span><b>' + a.n + '</b><span>' + eur0(a.base) + " sin IVA</span></div>" +
        '<div class="card kpi"><span>Ticket medio</span><b>' + eur0(a.medio) + "</b><span>por factura</span></div>";
      $("#rH").innerHTML = '<div class="card kpi"><span>Citas hoy</span><b>' + j.hoy.citas + '</b><span><a href="#citas" data-ir="citas">Ver agenda</a></span></div>' +
        '<div class="card kpi"><span>Citas por confirmar</span><b>' + j.hoy.pendientes + '</b><span>' + (j.hoy.pendientes ? "Llama para confirmarlas" : "Todo al día") + "</span></div>" +
        '<div class="card kpi"><span>Coches en el taller</span><b>' + j.hoy.enTaller + '</b><span><a href="#reps" data-ir="reps">Ver reparaciones</a></span></div>' +
        '<div class="card kpi"><span>Listos para recoger</span><b>' + j.hoy.listos + "</b><span>Pendientes de facturar y entregar</span></div>";
      barras($("#rDias"), j.dias.filter(function (d) { return d.dia !== "Domingo" || d.n; }), function (x) { return x.media; }, function (x) { return x.dia; }, function (x) { return eur0(x.media) + "/día"; });
      var M = j.meses, mx = Math.max.apply(null, M.map(function (x) { return x.total; }).concat([1])), top = M.slice().sort(function (a, b) { return b.total - a.total; }).slice(0, 3).map(function (x) { return x.mes; });
      $("#rMes").innerHTML = M.map(function (x) { var h = Math.max(2, x.total / mx * 100); return '<div class="' + (top.indexOf(x.mes) >= 0 ? "pico" : "") + '" style="--h:' + h.toFixed(1) + '%" title="' + esc(MESES[+x.mes.slice(5) - 1] + " " + x.mes.slice(0, 4) + ": " + eur0(x.total)) + '"><em>' + (top.indexOf(x.mes) >= 0 ? Math.round(x.total / 1000) + "k" : "") + '</em><i style="height:' + h.toFixed(1) + '%"></i></div>'; }).join("");
      $("#rMesL").innerHTML = M.map(function (x) { return "<span>" + MESES[+x.mes.slice(5) - 1].slice(0, 3) + "</span>"; }).join("");
      $("#rMesN").textContent = top.length ? "Mejores meses: " + top.map(function (m) { return MESES[+m.slice(5) - 1] + " " + m.slice(0, 4); }).join(", ") + "." : "";
      barras($("#rCat"), j.cats, function (x) { return x.total; }, function (x) { return x.cat; }, function (x) { return eur0(x.total) + " · " + x.n; });
      barras($("#rMet"), j.metodos, function (x) { return x.total; }, function (x) { return x.metodo; }, function (x) { return eur0(x.total) + " · " + x.n; });
    }).catch(function (x) { toast(x.message); });
  }
  document.addEventListener("click", function (e) { var a = e.target.closest("[data-ir]"); if (a) { e.preventDefault(); ir(a.dataset.ir); scrollTo(0, 0); } });

  /* ---------- CITAS ---------- */
  var CD = HOY, CFG = { capacidad: 2, cerrado: [] }, CITAS = [];
  var EST = { pendiente: ["Por confirmar", "warn"], confirmada: ["Confirmada", "ok"], hecha: ["Hecha", ""], noshow: ["No vino", "bad"], anulada: ["Anulada", "bad"] };
  $("#cAnt").addEventListener("click", function () { CD = sum(CD, -14); citas(); }); $("#cSig").addEventListener("click", function () { CD = sum(CD, 14); citas(); }); $("#cHoy").addEventListener("click", function () { CD = HOY; citas(); });
  function citas() {
    api("citas?desde=" + CD + "&hasta=" + sum(CD, 13)).then(function (j) {
      CITAS = j.citas; CFG = { capacidad: j.capacidad, cerrado: j.cerrado || [] };
      $("#cP").textContent = "Del " + fNum(j.desde) + " al " + fNum(j.hasta);
      var por = {}; j.citas.forEach(function (c) { (por[c.fecha] = por[c.fecha] || []).push(c); });
      var html = "";
      for (var f = j.desde; f <= j.hasta; f = sum(f, 1)) {
        var l = por[f] || [], d = new Date(f + "T12:00:00"), cerr = CFG.cerrado.indexOf(f) >= 0;
        if (!l.length && (d.getDay() === 0 || f < HOY)) continue;
        html += '<div class="dia"><h3>' + (f === HOY ? "Hoy · " : "") + d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" }) + (cerr ? ' <span class="pill bad">Cerrado</span>' : "") + "</h3>" +
          (l.length ? l.map(function (c) {
            var e = EST[c.estado] || EST.pendiente, tel = String(c.telefono || "").replace(/\D/g, "");
            return '<div class="cita"><span class="h">' + esc(c.hora) + "</span><div><b>" + esc(c.nombre) + '</b> <span class="pill ' + e[1] + '">' + e[0] + "</span>" + (c.origen === "chat" ? ' <span class="pill">Asistente</span>' : c.origen === "web" ? ' <span class="pill">Web</span>' : "") +
              '<div class="small">' + esc(c.servicio) + (c.vehiculo ? " · " + esc(c.vehiculo) : "") + (c.telefono ? " · " + esc(c.telefono) : "") + "</div>" + (c.notas ? '<div class="small muted">' + esc(c.notas) + "</div>" : "") + "</div>" +
              '<div class="acc">' + (c.estado === "pendiente" ? '<button class="btn btn-s btn-p" data-ce="confirmada" data-id="' + c.id + '">Confirmar</button>' : "") + (c.estado === "confirmada" || c.estado === "pendiente" ? '<button class="btn btn-s" data-ce="hecha" data-id="' + c.id + '">Hecha</button><button class="btn btn-s" data-ce="noshow" data-id="' + c.id + '">No vino</button><button class="btn btn-s btn-d" data-ce="anulada" data-id="' + c.id + '">Anular</button>' : "") +
              '<button class="btn btn-s" data-cedit="' + c.id + '">Editar</button>' + (tel.length >= 9 ? '<a class="btn btn-s" target="_blank" rel="noopener" href="https://wa.me/' + (tel.length === 9 ? "34" + tel : tel) + "?text=" + encodeURIComponent("Hola " + c.nombre.split(" ")[0] + ", te confirmamos tu cita en Taller Motor Norte el " + d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" }) + " a las " + c.hora + ". ¡Te esperamos!") + '">WhatsApp</a>' : "") + "</div></div>";
          }).join("") : '<p class="vacio">Sin citas.</p>') + "</div>";
      }
      $("#cLista").innerHTML = html || '<p class="vacio">No hay citas en estas dos semanas.</p>';
      $("#cCap").value = CFG.capacidad; pintaCerrados();
    }).catch(function (x) { toast(x.message); });
  }
  function pintaCerrados() { $("#cCeL").innerHTML = CFG.cerrado.length ? CFG.cerrado.map(function (f) { return '<span class="pill">' + fNum(f) + ' <button type="button" data-qc="' + f + '" aria-label="Quitar ' + fNum(f) + '" style="border:0;background:none;color:inherit;cursor:pointer;padding:0 0 0 .3rem">✕</button></span>'; }).join("") : '<span class="small muted">Ningún día cerrado.</span>'; }
  $("#cCeA").addEventListener("click", function () { var v = $("#cCe").value; if (!v) return; if (CFG.cerrado.indexOf(v) < 0) CFG.cerrado.push(v); CFG.cerrado.sort(); pintaCerrados(); $("#cCe").value = ""; });
  $("#cCeL").addEventListener("click", function (e) { var b = e.target.closest("[data-qc]"); if (!b) return; CFG.cerrado = CFG.cerrado.filter(function (f) { return f !== b.dataset.qc; }); pintaCerrados(); });
  $("#cCfgG").addEventListener("click", function () { $("#cCfgE").textContent = ""; api("citas/config", { capacidad: $("#cCap").value, cerrado: CFG.cerrado }).then(function () { toast("Guardado. La web ya ofrece las horas con estos ajustes."); citas(); }).catch(function (x) { $("#cCfgE").textContent = x.message; }); });
  $("#cLista").addEventListener("click", function (e) {
    var b = e.target.closest("[data-ce]");
    if (b) { var c = CITAS.filter(function (x) { return x.id === +b.dataset.id; })[0]; if (!c) return; if (b.dataset.ce === "anulada" && !confirm("¿Anular la cita de " + c.nombre + "?")) return; api("citas/guardar", Object.assign({}, c, { estado: b.dataset.ce })).then(function () { toast("Cita actualizada."); citas(); }).catch(function (x) { toast(x.message); }); return; }
    var ed = e.target.closest("[data-cedit]"); if (ed) editarCita(CITAS.filter(function (x) { return x.id === +ed.dataset.cedit; })[0]);
  });
  var citaId = 0;
  function horasDe(f, sel) {
    var s = $("#ciH"); s.innerHTML = "<option>Cargando…</option>";
    return api("citas/huecos?fecha=" + f).then(function (j) {
      var libre = {}; (j.horas || []).forEach(function (h) { libre[h.hora] = h.libre; });
      var hs = j.todas || []; if (sel && hs.indexOf(sel) < 0) hs = hs.concat([sel]).sort();
      s.innerHTML = hs.length ? hs.map(function (h) { return '<option value="' + h + '"' + (h === sel ? " selected" : "") + ">" + h + (libre[h] === false && h !== sel ? " · completo" : "") + "</option>"; }).join("") : '<option value="">El taller está cerrado ese día</option>';
    }).catch(function () { s.innerHTML = '<option value="">No se han cargado las horas</option>'; });
  }
  $("#ciF").addEventListener("change", function () { horasDe(this.value); });
  function editarCita(c, pre) {
    pre = pre || {}; citaId = c ? c.id : 0; $("#dCitaT").textContent = c ? "Editar cita" : "Nueva cita"; $("#ciErr").textContent = "";
    var f = c ? c.fecha : (CD < HOY ? HOY : CD); $("#ciF").value = f;
    $("#ciN").value = c ? c.nombre : pre.nombre || ""; $("#ciT").value = c ? c.telefono || "" : pre.telefono || ""; $("#ciV").value = c ? c.vehiculo || "" : pre.vehiculo || ""; $("#ciS").value = c ? c.servicio || "" : ""; $("#ciE").value = c ? c.estado : "confirmada"; $("#ciO").value = c ? c.notas || "" : "";
    horasDe(f, c && c.hora); $("#dCita").showModal(); $("#ciN").focus();
  }
  $("#cNueva").addEventListener("click", function () { editarCita(null); });
  $("#ciG").addEventListener("click", function () {
    $("#ciErr").textContent = "";
    api("citas/guardar", { id: citaId, fecha: $("#ciF").value, hora: $("#ciH").value, nombre: $("#ciN").value, telefono: $("#ciT").value, vehiculo: $("#ciV").value, servicio: $("#ciS").value, estado: $("#ciE").value, notas: $("#ciO").value })
      .then(function () { $("#dCita").close(); toast("Cita guardada."); CD = $("#ciF").value < CD || $("#ciF").value > sum(CD, 13) ? $("#ciF").value : CD; citas(); }).catch(function (x) { $("#ciErr").textContent = x.message; });
  });

  /* ---------- REPARACIONES ---------- */
  var REPS = [], repId = 0, repFoto = "", RESENAS = "";
  function pedirResena(r) {
    var d = $("#dRes"), url = waUrl(r.telefono, "Hola " + nombre1(r.cliente) + ", gracias por confiar en Taller Motor Norte. ¿Qué tal va tu " + (r.vehiculo || "coche") + "? Si estás contento, nos ayudaría mucho una reseña en Google (es un minuto): " + RESENAS);
    if (!RESENAS) { $("#dResB").innerHTML = "<p>Para pedir reseñas, pega en <b>Mis datos</b> el enlace de reseñas de tu Perfil de Empresa de Google.</p>"; $("#dResA").innerHTML = '<button class="btn" type="button" data-x>Ahora no</button><button class="btn btn-p" type="button" data-ir="datos">Ir a Mis datos</button>'; }
    else if (!url) { $("#dResB").innerHTML = "<p>No tenemos el teléfono completo de este cliente. Añádelo en su reparación o en su ficha para enviarle la petición de reseña por WhatsApp.</p>"; $("#dResA").innerHTML = '<button class="btn btn-p" type="button" data-x>Entendido</button>'; }
    else { $("#dResB").innerHTML = "<p>Has entregado el " + esc(r.vehiculo || "coche") + " de <b>" + esc(r.cliente || "tu cliente") + "</b>. Es el mejor momento para pedirle una reseña: se abrirá WhatsApp con el mensaje y el enlace ya escritos.</p>"; $("#dResA").innerHTML = '<button class="btn" type="button" data-x>Ahora no</button><a class="btn btn-p" href="' + esc(url) + '" target="_blank" rel="noopener" data-x>Pedir reseña por WhatsApp</a>'; }
    d.showModal();
  }
  $("#dRes").addEventListener("click", function (e) { if (e.target.closest("[data-ir]")) $("#dRes").close(); });
  function plate(m) { return '<span class="plate"><span>E</span><b>' + esc(m) + "</b></span>"; }
  function reps() {
    api("reparaciones").then(function (j) {
      REPS = j.reparaciones; RESENAS = j.resenas || ""; var act = REPS.filter(function (r) { return r.activa; }), ent = REPS.filter(function (r) { return !r.activa; });
      $("#rpLista").innerHTML = act.length ? act.map(function (r) {
        return '<article class="card rep"><h3>' + plate(r.matricula) + " " + esc(r.vehiculo || "") + "</h3>" +
          '<div class="small muted">' + esc(r.cliente || "Sin nombre") + (r.mecanico ? " · Mecánico: " + esc(r.mecanico) : "") + (r.entrega ? " · Entrega: " + esc(r.entrega) : "") + "</div>" +
          (r.paso === 2 ? '<p class="small" style="margin:.5rem 0 0">' + (r.aprobado ? '<span class="pill ok">Presupuesto aprobado</span>' : '<span class="pill warn">Esperando que el cliente apruebe ' + eur(r.total) + "</span>") + "</p>" : "") +
          '<div class="pasos" role="group" aria-label="Paso de la reparación">' + PASOS.map(function (p, i) { return '<button type="button" data-paso="' + i + '" data-id="' + r.id + '" class="' + (i < r.paso ? "hecho" : i === r.paso ? "ahora" : "") + '" aria-pressed="' + (i === r.paso) + '"><span class="d">' + (i < r.paso ? "✓" : i + 1) + "</span>" + p + "</button>"; }).join("") + "</div>" +
          '<div class="row"><button class="btn btn-s" type="button" data-red="' + r.id + '">Editar y presupuesto</button>' + (r.paso >= 3 ? '<button class="btn btn-s btn-p" type="button" data-rfac="' + r.id + '">🧾 Facturar</button>' : "") + '<button class="btn btn-s" type="button" data-rhor="' + r.id + '">⏱️ Horas</button>' + "</div></article>";
      }).join("") : '<div class="card"><p class="vacio">No hay coches en el taller ahora mismo.</p></div>';
      $("#rpEnt").innerHTML = ent.length ? ent.map(function (r) { var h = (r.historial || []).slice(-1)[0]; return "<tr><td>" + plate(r.matricula) + "</td><td>" + esc(r.vehiculo || "") + "</td><td>" + esc(r.cliente || "") + "</td><td>" + (h ? fNum(h.t.slice(0, 10)) : "") + '</td><td class="n"><button class="btn btn-s" type="button" data-paso="4" data-id="' + r.id + '">Reabrir</button></td></tr>'; }).join("") : '<tr><td colspan="5" class="vacio">Ninguno.</td></tr>';
    }).catch(function (x) { toast(x.message); });
  }
  $("#s-reps").addEventListener("click", function (e) {
    var p = e.target.closest("[data-paso]");
    if (p) { var paso = +p.dataset.paso, r = REPS.filter(function (x) { return x.id === +p.dataset.id; })[0]; if (!r) return;
      if (paso === 5 && !confirm("¿Marcar " + r.matricula + " como entregado? Dejará de verse en «Sigue tu reparación».")) return;
      var nota = paso === 4 ? "¡Listo! Puedes pasar a recogerlo." : paso === 3 ? (r.paso < 3 ? "Estamos trabajando en tu coche." : r.nota) : r.nota;
      api("reparaciones/paso", { id: r.id, paso: paso, nota: nota, entrega: paso === 4 ? "ya está listo" : undefined }).then(function () { toast(PASOS[paso] + (paso === 5 ? " · ya no sale en el seguimiento." : " · el cliente ya lo ve en la web.")); reps(); if (paso === 5) pedirResena(r); }).catch(function (x) { toast(x.message); }); return; }
    var ed = e.target.closest("[data-red]"); if (ed) { editarRep(REPS.filter(function (x) { return x.id === +ed.dataset.red; })[0]); return; }
    var ho = e.target.closest("[data-rhor]"); if (ho) { var rh = REPS.filter(function (x) { return x.id === +ho.dataset.rhor; })[0]; apuntarHoras({ mecanico: rh.mecanico, matricula: rh.matricula, trabajo: (rh.presupuesto[0] || {}).c || "" }); return; }
    var fa = e.target.closest("[data-rfac]"); if (fa) { var rr = REPS.filter(function (x) { return x.id === +fa.dataset.rfac; })[0]; nuevaFactura({ cliente: rr.cliente === "Cliente de ejemplo" ? "" : rr.cliente, vehiculo: (rr.vehiculo || "") + " · " + rr.matricula, telefono: rr.telefono, lineas: rr.presupuesto }); }
  });
  function lineas(cont, l) {
    cont.innerHTML = ""; (l.length ? l : [{ c: "", i: "" }]).forEach(function (x) { addLinea(cont, x); });
  }
  function addLinea(cont, x) {
    var d = document.createElement("div"); d.className = "lin";
    d.innerHTML = '<input aria-label="Concepto" maxlength="120" placeholder="Concepto" value="' + esc(x.c || "") + '"><input aria-label="Precio en euros" inputmode="decimal" placeholder="0,00 €" value="' + esc(x.i === "" || x.i == null ? "" : String(x.i).replace(".", ",")) + '"><button type="button" aria-label="Quitar línea">✕</button>';
    d.querySelector("button").addEventListener("click", function () { d.remove(); if (!cont.children.length) addLinea(cont, {}); cont.dispatchEvent(new Event("input", { bubbles: true })); });
    cont.appendChild(d);
  }
  function leeLineas(cont) { return $$(".lin", cont).map(function (d) { var i = d.querySelectorAll("input"); return { c: i[0].value.trim(), i: importe(i[1].value) }; }).filter(function (x) { return x.c || x.i; }); }
  function fotos(cont, sel, extra) {
    var l = IMGS.map(function (n) { return "img/" + n; }); if (extra && l.indexOf(extra) < 0) l.unshift(extra);
    cont.innerHTML = l.map(function (s) { var src = /^\/api\//.test(s) ? s : s + "-m.webp"; return '<button type="button" data-f="' + esc(s) + '" aria-pressed="' + (s === sel) + '" aria-label="Elegir esta foto"><img src="' + esc(src) + '" alt="" loading="lazy"></button>'; }).join("");
  }
  function subirFoto(input, ok) {
    var f = input.files && input.files[0]; input.value = ""; if (!f) return;
    if (!/^image\//.test(f.type)) { toast("Elige una imagen."); return; }
    var img = new Image(), url = URL.createObjectURL(f);
    img.onload = function () {
      var max = 1200, w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h)), c = document.createElement("canvas");
      c.width = Math.round(w * k); c.height = Math.round(h * k); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      var q = 0.82, d = c.toDataURL("image/jpeg", q); while (d.length > 880000 && q > 0.4) { q -= 0.1; d = c.toDataURL("image/jpeg", q); }
      toast("Subiendo foto…");
      api("foto", { dataUrl: d }).then(function (j) { toast("Foto subida."); ok(j.url); }).catch(function (x) { toast(x.message); });
    };
    img.onerror = function () { toast("No se ha podido leer la foto."); }; img.src = url;
  }
  function editarRep(r) {
    repId = r ? r.id : 0; repFoto = r ? r.foto || "" : "img/diagnosis-m.webp"; $("#rpErr").textContent = ""; $("#dRepT").textContent = r ? "Editar " + r.matricula : "Coche nuevo en el taller";
    $("#rpM").value = r ? r.matricula : ""; $("#rpV").value = r ? r.vehiculo || "" : ""; $("#rpC").value = r ? r.cliente || "" : ""; $("#rpT").value = r ? r.telefono || "" : ""; $("#rpK").value = r ? r.mecanico || "" : ""; $("#rpE").value = r ? r.entrega || "" : ""; $("#rpN").value = r ? r.nota || "" : "";
    lineas($("#rpL"), r ? r.presupuesto : []); pintaRepFotos(); $("#rpB").hidden = !r; $("#dRep").showModal(); $("#rpM").focus();
  }
  function pintaRepFotos() { var sel = (repFoto || "").replace(/-m\.webp$/, ""); fotos($("#rpF"), sel, /^\/api\//.test(repFoto) ? repFoto : ""); }
  $("#rpF").addEventListener("click", function (e) { var b = e.target.closest("[data-f]"); if (!b) return; var v = b.dataset.f; repFoto = /^\/api\//.test(v) ? v : v + "-m.webp"; pintaRepFotos(); });
  $("#rpFU").addEventListener("change", function () { subirFoto(this, function (u) { repFoto = u; pintaRepFotos(); }); });
  $("#rpLA").addEventListener("click", function () { addLinea($("#rpL"), {}); });
  $("#rpNueva").addEventListener("click", function () { editarRep(null); });
  $("#rpG").addEventListener("click", function () {
    $("#rpErr").textContent = "";
    var f = repFoto.replace(/-m\.webp$/, ""); // la web guarda la ruta base (img/frenos) o la de la foto subida
    api("reparaciones/guardar", { id: repId, matricula: $("#rpM").value, vehiculo: $("#rpV").value, cliente: $("#rpC").value, telefono: $("#rpT").value, tel4: (REPS.filter(function (x) { return x.id === repId; })[0] || {}).tel4 || "", mecanico: $("#rpK").value, entrega: $("#rpE").value, nota: $("#rpN").value, presupuesto: leeLineas($("#rpL")), foto: f })
      .then(function () { $("#dRep").close(); toast("Guardado. El cliente ya lo ve con su matrícula."); reps(); }).catch(function (x) { $("#rpErr").textContent = x.message; });
  });
  $("#rpB").addEventListener("click", function () { if (!confirm("¿Borrar esta reparación? No se puede deshacer.")) return; api("reparaciones/borrar", { id: repId }).then(function () { $("#dRep").close(); toast("Borrada."); reps(); }).catch(function (x) { $("#rpErr").textContent = x.message; }); });

  /* ---------- FACTURAS ---------- */
  var FP = "mes", FD = null, EMISOR = {};
  $("#fMes").value = HOY.slice(0, 7);
  $("#fSeg").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; FP = b.dataset.p; $$("#fSeg button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); facturas(); });
  $("#fMes").addEventListener("change", facturas);
  var fqT; $("#fQ").addEventListener("input", function () { clearTimeout(fqT); fqT = setTimeout(facturas, 300); });
  function rangoF() {
    var m = $("#fMes").value || HOY.slice(0, 7), y = +m.slice(0, 4), mo = +m.slice(5, 7);
    if (FP === "anio") return [y + "-01-01", y + "-12-31", "Año " + y];
    if (FP === "trimestre") { var t = Math.floor((mo - 1) / 3), a = new Date(y, t * 3, 1), b = new Date(y, t * 3 + 3, 0); return [iso(a), iso(b), (t + 1) + "º trimestre de " + y]; }
    return [m + "-01", iso(new Date(y, mo, 0)), MESES[mo - 1].replace(/^./, function (c) { return c.toUpperCase(); }) + " de " + y];
  }
  function facturas() {
    var r = rangoF(), q = $("#fQ").value.trim();
    api("facturas?desde=" + r[0] + "&hasta=" + r[1] + (q ? "&q=" + encodeURIComponent(q) : "")).then(function (j) {
      FD = j; FD.nombre = r[2]; EMISOR = j.emisor || {};
      $("#fP").textContent = r[2] + (q ? " · búsqueda: «" + q + "»" : "");
      var t = j.totales;
      $("#fK").innerHTML = '<div class="card kpi"><span>Facturas</span><b>' + t.n + '</b></div><div class="card kpi"><span>Base imponible</span><b>' + eur0(t.base) + '</b></div><div class="card kpi"><span>IVA</span><b>' + eur0(t.iva) + '</b></div><div class="card kpi"><span>Total</span><b>' + eur0(t.total) + "</b></div>";
      var por = {}, ord = []; j.facturas.forEach(function (f) { var k = f.fecha.slice(0, 7); if (!por[k]) { por[k] = []; ord.push(k); } por[k].push(f); });
      $("#fLista").innerHTML = ord.length ? ord.map(function (k) {
        var l = por[k], tot = l.filter(function (f) { return !f.anulada; }).reduce(function (a, f) { return a + f.total; }, 0);
        return '<div class="mes"><h3><span>' + MESES[+k.slice(5) - 1] + " " + k.slice(0, 4) + "</span><span>" + pl(l.length, "factura", "facturas") + " · " + eur(tot) + '</span></h3><div class="tw"><table><thead><tr><th>Nº</th><th>Fecha</th><th>Cliente</th><th>Coche</th><th class="n">Total</th><th></th></tr></thead><tbody>' +
          l.map(function (f) { return "<tr" + (f.anulada ? ' style="opacity:.55"' : "") + "><td><b>" + esc(f.codigo) + "</b>" + (f.anulada ? ' <span class="pill bad">Anulada</span>' : "") + (f.serie === "R" ? ' <span class="pill warn">Rectificativa</span>' : f.rectificada ? ' <span class="pill bad">Rectificada</span>' : "") + "</td><td>" + fNum(f.fecha) + "</td><td>" + esc(f.cliente) + '</td><td class="small">' + esc(f.vehiculo || "") + '</td><td class="n">' + eur(f.total) + '</td><td class="n"><button class="btn btn-s" type="button" data-fver="' + f.id + '">Ver / imprimir</button></td></tr>'; }).join("") + "</tbody></table></div></div>";
      }).join("") : '<p class="vacio">No hay facturas en este periodo.</p>';
    }).catch(function (x) { toast(x.message); });
  }
  function htmlFactura(f, em) {
    var L = f.lineas || [], incl = true, pct = f.pct;
    var filas = L.map(function (x) { var base = x.i / (1 + pct / 100); return "<tr><td>" + esc(x.c) + '</td><td class="n">' + eur(base) + "</td></tr>"; }).join("");
    var R = f.serie === "R";
    return '<div class="fac"><div class="cab"><div><h1>' + (R ? "FACTURA RECTIFICATIVA" : "FACTURA") + '</h1><div><b>' + esc(em.razon || "(Rellena tus datos)") + "</b><br>NIF/CIF: " + esc(em.nif || "—") + "<br>" + esc(em.dir || "") + (em.cp ? "<br>" + esc(em.cp) : "") + (em.tel ? "<br>Tel. " + esc(em.tel) : "") + (em.email ? " · " + esc(em.email) : "") + '</div></div><div class="num">Nº <b>' + esc(f.codigo) + "</b><br>Fecha: " + fNum(f.fecha) + "<br>Forma de pago: " + esc(METN[f.metodo] || f.metodo || "") + (f.anulada ? '<br><b class="demo">ANULADA</b>' : "") + (f.rectificada ? '<br><b class="demo">RECTIFICADA</b>' : "") + "</div></div>" +
      (R ? '<div class="cli"><b>Rectifica la factura Nº ' + esc(f.original ? f.original.codigo : "") + "</b>" + (f.original ? " de " + fNum(f.original.fecha) : "") + "<br><b>Motivo:</b> " + esc(f.motivo || "") + "</div>" : "") +
      '<div class="cli"><b>Cliente:</b> ' + esc(f.cliente) + (f.cliente_nif ? "<br><b>NIF/CIF:</b> " + esc(f.cliente_nif) : "") + (f.cliente_dir ? "<br><b>Dirección:</b> " + esc(f.cliente_dir) : "") + (f.vehiculo ? "<br><b>Vehículo:</b> " + esc(f.vehiculo) : "") + "</div>" +
      '<table><thead><tr><th>Concepto</th><th class="n">Importe (sin IVA)</th></tr></thead><tbody>' + filas + "</tbody></table>" +
      '<div class="tt"><div><span>Base imponible</span><span>' + eur(f.base) + "</span></div><div><span>IVA " + pct + " %</span><span>" + eur(f.iva) + '</span></div><div class="g"><span>TOTAL</span><span>' + eur(f.total) + "</span></div></div>" +
      '<div class="pie">' + esc(em.pie || "") + (YO.demo ? '<br><span class="demo">DEMOSTRACIÓN · datos ficticios, no es una factura real.</span>' : "") + "</div></div>";
  }
  var VER = null;
  function verFactura(f, em) { VER = { f: f, em: em }; $("#dVerT").textContent = (f.serie === "R" ? "Rectificativa " : "Factura ") + f.codigo; $("#verB").innerHTML = htmlFactura(f, em); $("#verR").hidden = f.serie === "R" || !!f.rectificada; $("#dVer").showModal(); }
  /* rectificativa: resta el importe de una factura ya emitida (no se borra nada) */
  function totRect() { var s = leeLineas($("#reL")).reduce(function (a, x) { return a + x.i; }, 0); $("#reT").innerHTML = '<div class="g"><span>Se resta</span><span>−' + eur(s) + "</span></div>"; }
  $("#reL").addEventListener("input", totRect);
  $("#verR").addEventListener("click", function () { if (!VER) return; var f = VER.f; $("#dVer").close(); $("#reE").textContent = ""; $("#reM").value = ""; $("#dRectT").textContent = "Rectificar la factura " + f.codigo; lineas($("#reL"), f.lineas); totRect(); $("#dRect").showModal(); $("#reM").focus(); });
  $("#reG").addEventListener("click", function () {
    var f = VER && VER.f; if (!f) return; $("#reE").textContent = "";
    api("facturas/rectificar", { id: f.id, motivo: $("#reM").value, lineas: leeLineas($("#reL")) }).then(function (j) { $("#dRect").close(); toast("Rectificativa " + j.factura.codigo + " emitida."); verFactura(j.factura, j.emisor); if (!$("#s-facs").hidden) facturas(); }).catch(function (x) { $("#reE").textContent = x.message; });
  });
  $("#fLista").addEventListener("click", function (e) { var b = e.target.closest("[data-fver]"); if (!b) return; var f = FD.facturas.filter(function (x) { return x.id === +b.dataset.fver; })[0]; verFactura(f, EMISOR); });
  function imprimir(html) { $("#imp").innerHTML = html; document.body.classList.add("imp-f"); var fin = function () { document.body.classList.remove("imp-f"); removeEventListener("afterprint", fin); }; addEventListener("afterprint", fin); setTimeout(function () { window.print(); setTimeout(fin, 1500); }, 50); }
  $("#verP").addEventListener("click", function () { if (VER && !$("#dVer")._pre) imprimir(htmlFactura(VER.f, VER.em)); });
  $("#fImpL").addEventListener("click", function () {
    if (!FD) return; var t = FD.totales, em = EMISOR;
    imprimir('<div class="fac"><div class="cab"><div><h1>LISTADO DE FACTURAS</h1><b>' + esc(em.razon) + "</b> · NIF/CIF " + esc(em.nif) + '</div><div class="num">' + esc(FD.nombre) + "<br>Emitido: " + fNum(HOY) + '</div></div><table><thead><tr><th>Nº</th><th>Fecha</th><th>Cliente</th><th class="n">Base</th><th class="n">IVA</th><th class="n">Total</th></tr></thead><tbody>' +
      FD.facturas.slice().reverse().map(function (f) { return "<tr><td>" + esc(f.codigo) + (f.anulada ? " (anulada)" : "") + "</td><td>" + fNum(f.fecha) + "</td><td>" + esc(f.cliente) + '</td><td class="n">' + eur(f.anulada ? 0 : f.base) + '</td><td class="n">' + eur(f.anulada ? 0 : f.iva) + '</td><td class="n">' + eur(f.anulada ? 0 : f.total) + "</td></tr>"; }).join("") +
      '</tbody></table><div class="tt"><div><span>Base imponible</span><span>' + eur(t.base) + "</span></div><div><span>IVA</span><span>" + eur(t.iva) + '</span></div><div class="g"><span>TOTAL</span><span>' + eur(t.total) + "</span></div></div>" + (YO.demo ? '<div class="pie demo">DEMOSTRACIÓN · datos ficticios.</div>' : "") + "</div>");
  });
  $("#fCsv").addEventListener("click", function () {
    if (!FD) return; var q = function (v) { v = String(v == null ? "" : v); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }, n = function (x) { return String(x.toFixed(2)).replace(".", ","); };
    var filas = [["Número", "Fecha", "Cliente", "NIF/CIF cliente", "Vehículo", "Concepto", "Base", "IVA %", "IVA", "Total", "Forma de pago", "Estado"]].concat(FD.facturas.slice().reverse().map(function (f) { return [f.codigo, fNum(f.fecha), f.cliente, f.cliente_nif || "", f.vehiculo || "", (f.lineas || []).map(function (x) { return x.c; }).join(" + "), n(f.base), f.pct, n(f.iva), n(f.total), METN[f.metodo] || f.metodo, f.anulada ? "Anulada" : "Emitida"]; }));
    var csv = "﻿" + filas.map(function (r) { return r.map(q).join(";"); }).join("\r\n"), a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = "facturas-" + FD.desde + "_" + FD.hasta + ".csv"; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast("Descargado. Se abre con Excel o Google Sheets.");
  });

  /* enviar a la gestoría desde el correo de la empresa (Gmail, Outlook o el programa de correo) */
  function enlaceCorreo(de, para, asunto, cuerpo) {
    var q = encodeURIComponent, dom = (de.split("@")[1] || "").toLowerCase();
    if (/^(gmail|googlemail)\.com$/.test(dom)) return { app: "Gmail", url: "https://mail.google.com/mail/?view=cm&fs=1&authuser=" + q(de) + "&to=" + q(para) + "&su=" + q(asunto) + "&body=" + q(cuerpo) };
    if (/^(outlook|hotmail|live|msn)\.[a-z.]+$/.test(dom)) return { app: "Outlook", url: "https://outlook.live.com/mail/0/deeplink/compose?to=" + q(para) + "&subject=" + q(asunto) + "&body=" + q(cuerpo) };
    return { app: "tu programa de correo", url: "mailto:" + q(para) + "?subject=" + q(asunto) + "&body=" + q(cuerpo) };
  }
  function textoGestoria(corto) {
    var t = FD.totales, em = EMISOR, L = [], pad = function (a, b) { a = String(a); b = String(b); return a + new Array(Math.max(1, 52 - a.length - b.length) + 1).join(" ") + b; };
    L.push(em.razon + " · NIF/CIF " + em.nif); L.push("FACTURAS EMITIDAS · " + FD.nombre.toUpperCase()); L.push("");
    if (corto) { var dias = {}; FD.facturas.forEach(function (f) { if (f.anulada) return; var d = dias[f.fecha] = dias[f.fecha] || { n: 0, t: 0 }; d.n++; d.t += f.total; }); Object.keys(dias).sort().forEach(function (d) { L.push(pad(fNum(d) + " (" + dias[d].n + " facturas)", eur(dias[d].t))); }); }
    else FD.facturas.slice().reverse().forEach(function (f) { L.push(pad(f.codigo + "  " + fNum(f.fecha) + "  " + f.cliente.slice(0, 22) + (f.anulada ? " (ANULADA)" : ""), f.anulada ? "0,00 €" : eur(f.total))); });
    L.push(""); L.push(pad("Número de facturas", t.n)); L.push(pad("Base imponible", eur(t.base))); L.push(pad("IVA repercutido", eur(t.iva))); L.push(pad("TOTAL", eur(t.total)));
    if (YO.demo) { L.push(""); L.push("DATOS DE EJEMPLO (demostración)."); }
    return L.join("\n");
  }
  $("#fGest").addEventListener("click", function () {
    if (!FD) return; var em = EMISOR, d = $("#dGest"); $("#dGestE").textContent = "";
    if (!em.email || !em.gestoria) { $("#dGestB").innerHTML = "<p>Antes tienes que escribir <b>" + (!em.email ? "el correo de la empresa" : "") + (!em.email && !em.gestoria ? "</b> y <b>" : "") + (!em.gestoria ? "el correo de la gestoría" : "") + "</b> en <b>Mis datos</b>.</p>"; $("#dGestA").innerHTML = '<button class="btn" type="button" data-x>Cancelar</button><button class="btn btn-p" type="button" data-ir="datos">Ir a Mis datos</button>'; d.showModal(); return; }
    var asunto = "Facturas emitidas · " + em.razon + " · " + FD.nombre, cuerpo = "Hola,\n\nOs envío el listado de facturas emitidas del periodo.\n\n" + textoGestoria(false) + "\n\nSi necesitáis las facturas en PDF o el archivo para Excel, os lo paso.\n\nUn saludo,\n" + em.razon;
    var completo = cuerpo, en = enlaceCorreo(em.email, em.gestoria, asunto, cuerpo);
    if (en.url.length > 7000) { cuerpo = "Hola,\n\nOs envío el resumen de facturas del periodo (por días; el detalle va en el archivo para Excel adjunto).\n\n" + textoGestoria(true) + "\n\nUn saludo,\n" + em.razon; en = enlaceCorreo(em.email, em.gestoria, asunto, cuerpo); }
    $("#dGestB").innerHTML = "<p>Se abrirá <b>" + esc(en.app) + "</b> con <b>" + esc(em.email) + "</b> y el correo ya escrito para <b>" + esc(em.gestoria) + "</b>. Revísalo y pulsa <b>Enviar</b>.</p><p class=\"small muted\">Asunto: " + esc(asunto) + "</p>" + (completo !== cuerpo ? '<p class="small muted">Es un periodo largo: el correo va resumido por días. Descarga el archivo para Excel y adjúntalo, o copia el detalle con «Copiar el texto».</p>' : "");
    $("#dGestA").innerHTML = '<button class="btn" type="button" data-x>Cancelar</button><button class="btn" type="button" data-cp>Copiar el texto</button><a class="btn btn-p" href="' + esc(en.url) + '" target="_blank" rel="noopener" data-ab>Abrir ' + esc(en.app === "tu programa de correo" ? "mi correo" : en.app) + "</a>";
    d._texto = completo; d.showModal();
  });
  $("#dGest").addEventListener("click", function (e) {
    var d = $("#dGest");
    if (e.target.closest("[data-ir]")) { d.close(); return; }
    if (e.target.closest("[data-cp]")) { (navigator.clipboard ? navigator.clipboard.writeText(d._texto) : Promise.reject()).then(function () { toast("Texto copiado. Pégalo en tu correo."); }).catch(function () { $("#dGestE").textContent = "No se ha podido copiar. Mantén pulsado el texto para copiarlo."; }); return; }
    if (e.target.closest("[data-ab]")) setTimeout(function () { d.close(); }, 300);
  });

  /* nueva factura: solo cliente, lo que se ha hecho y precio */
  function totalesFac() {
    var l = leeLineas($("#faL")), pct = +$("#faI").value, s = l.reduce(function (a, x) { return a + x.i; }, 0), incl = $("#faInc").checked;
    var base = incl ? s / (1 + pct / 100) : s, tot = incl ? s : s * (1 + pct / 100);
    $("#faT").innerHTML = "<div><span>Base imponible</span><span>" + eur(base) + "</span></div><div><span>IVA " + pct + " %</span><span>" + eur(tot - base) + '</span></div><div class="g"><span>Total</span><span>' + eur(tot) + "</span></div>";
  }
  ["#faL", "#faI", "#faInc"].forEach(function (s) { $(s).addEventListener("input", totalesFac); $(s).addEventListener("change", totalesFac); });
  $("#faLA").addEventListener("click", function () { addLinea($("#faL"), {}); });
  function nuevaFactura(pre) {
    pre = pre || {}; $("#faErr").textContent = ""; $("#faC").value = pre.cliente || ""; $("#faV").value = pre.vehiculo || ""; $("#faN").value = ""; $("#faD").value = ""; $("#faTel").value = pre.telefono || ""; $("#faInc").checked = true; $("#faM").value = "tarjeta";
    lineas($("#faL"), pre.lineas || []);
    api("misdatos").then(function (j) { EMISOR = j.datos; $("#faI").value = String(j.datos.iva || 21); totalesFac(); if (!j.datos.razon || !j.datos.nif) $("#faErr").textContent = "Antes de emitir, rellena tu nombre o razón social y tu NIF en «Mis datos»."; }).catch(function () {});
    totalesFac(); $("#dFac").showModal(); $("#faC").focus();
  }
  $("#fNueva").addEventListener("click", function () { nuevaFactura(); });
  $("#faG").addEventListener("click", function () {
    $("#faErr").textContent = ""; var b = $("#faG"); b.disabled = true;
    api("facturas/nueva", { cliente: $("#faC").value, vehiculo: $("#faV").value, telefono: $("#faTel").value, cliente_nif: $("#faN").value, cliente_dir: $("#faD").value, lineas: leeLineas($("#faL")), pct: +$("#faI").value, iva_incluido: $("#faInc").checked, metodo: $("#faM").value, cat: $("#faK").value })
      .then(function (j) { $("#dFac").close(); toast("Factura " + j.factura.codigo + " emitida y archivada."); verFactura(j.factura, j.emisor); if (!$("#s-facs").hidden) facturas(); })
      .catch(function (x) { $("#faErr").textContent = x.message; }).then(function () { b.disabled = false; });
  });

  /* ---------- CLIENTES (ficha por matrícula y recordatorios) ---------- */
  var CLIS = [], FICHA = null, CLN = 24, RECT = false;
  var clT; $("#clQ").addEventListener("input", function () { clearTimeout(clT); CLN = 24; clT = setTimeout(clientes, 300); });
  document.addEventListener("click", function (e) { if (e.target.closest("#clMas")) { CLN += 48; pintaClientes(); } if (e.target.closest("#recMas")) { RECT = true; pintaRec(); } });
  function clientes() {
    var q = $("#clQ").value.trim();
    api("clientes" + (q ? "?q=" + encodeURIComponent(q) : "")).then(function (j) {
      CLIS = j.clientes; $("#clP").textContent = pl(j.total, "vehículo", "vehículos") + (q ? (j.total === 1 ? " encontrado" : " encontrados") : " en tu base de clientes") + ". La ficha se completa sola con facturas, citas y reparaciones.";
      pintaClientes();
    }).catch(function (x) { toast(x.message); });
    recordatorios();
  }
  function pintaClientes() {
      $("#clLista").innerHTML = CLIS.length ? CLIS.slice(0, CLN).map(function (c) {
        var itv = c.itv ? Math.round((new Date(c.itv + "T12:00:00") - new Date(HOY + "T12:00:00")) / 864e5) : null;
        return '<article class="card cli"><h3>' + plate(c.matricula_txt) + " " + esc(c.vehiculo || "") + "</h3><div class=\"small\"><b>" + esc(c.cliente || "Sin nombre") + "</b>" + (c.telefono ? " · " + esc(c.telefono) : "") + '</div><div class="small muted">' + pl(c.visitas, "visita", "visitas") + " · " + eur0(c.gastado) + (c.ultima ? " · última " + fNum(c.ultima) : "") + "</div>" +
          (itv != null ? '<div style="margin-top:.4rem"><span class="pill ' + (itv < 0 ? "bad" : itv <= 30 ? "warn" : "") + '">ITV ' + (itv < 0 ? "caducada hace " + pl(-itv, "día", "días") : itv === 0 ? "hoy" : "en " + pl(itv, "día", "días")) + "</span></div>" : "") +
          '<div class="row"><button class="btn btn-s btn-p" type="button" data-ficha="' + esc(c.matricula) + '">Ver ficha</button></div></article>';
      }).join("") + (CLIS.length > CLN ? '<div style="grid-column:1/-1;text-align:center"><button class="btn" type="button" id="clMas">Ver más (' + (CLIS.length - CLN) + ")</button></div>" : "") : '<div class="card"><p class="vacio">No hay ningún cliente con esa búsqueda.</p></div>';
  }
  function recordatorios() {
    api("recordatorios").then(function (j) {
      var L = j.itv.map(function (v) { return { t: "itv", v: v, txt: "ITV " + (v.dias < 0 ? "caducada hace " + pl(-v.dias, "día", "días") : v.dias === 0 ? "hoy" : "en " + pl(v.dias, "día", "días")) + " (" + fNum(v.itv) + ")", msg: "Hola " + nombre1(v.cliente) + ", te escribimos de " + j.taller + ". La ITV de tu " + (v.vehiculo || "coche") + " (" + v.matricula_txt + ") " + (v.dias < 0 ? "caducó el " : "vence el ") + fNum(v.itv) + ". ¿Quieres que te la dejemos preparada con una revisión pre-ITV? Responde a este mensaje y te damos cita." }; })
        .concat(j.revision.map(function (v) { return { t: "rev", v: v, txt: "Última visita: " + fNum(v.ultima) + " · le toca revisión", msg: "Hola " + nombre1(v.cliente) + ", te escribimos de " + j.taller + ". Hace casi un año de la última revisión de tu " + (v.vehiculo || "coche") + " (" + v.matricula_txt + "). ¿Te damos cita para el mantenimiento? Responde a este mensaje y te buscamos hueco." }; }));
      $("#clRec")._l = L; pintaRec();
    }).catch(function () {});
  }
  function pintaRec() {
      var L = $("#clRec")._l || [], V = RECT ? L : L.slice(0, 5);
      $("#clRec").innerHTML = "<h3>Recordatorios para enviar hoy (" + L.length + ")</h3>" + (L.length ? '<div class="rec">' + V.map(function (r, i) { var u = waUrl(r.v.telefono, r.msg); return "<div><span>" + plate(r.v.matricula_txt) + " <b>" + esc(r.v.cliente || "") + '</b> <span class="small muted">' + esc(r.txt) + '</span></span><span class="row">' + (u ? '<a class="btn btn-s btn-p" href="' + esc(u) + '" target="_blank" rel="noopener" data-recwa="' + i + '">WhatsApp</a>' : "") + '<button class="btn btn-s" type="button" data-rech="' + i + '">Hecho</button><button class="btn btn-s" type="button" data-ficha="' + esc(r.v.matricula) + '">Ficha</button></span></div>'; }).join("") + "</div>" : '<p class="vacio">Nada pendiente: ningún cliente con la ITV a punto de vencer ni revisión atrasada.</p>') +
        (L.length > V.length ? '<button class="btn btn-s" type="button" id="recMas" style="margin-top:.6rem">Ver los ' + L.length + " recordatorios</button>" : "") +
      '<p class="nota">Se abre WhatsApp con el mensaje ya escrito; tú solo pulsas «Enviar». Al marcarlo como hecho, no vuelve a salir.</p>';
  }
  $("#clRec").addEventListener("click", function (e) {
    var w = e.target.closest("[data-recwa]"), h = e.target.closest("[data-rech]"), b = w || h; if (!b) return;
    var r = $("#clRec")._l[+(w ? w.dataset.recwa : h.dataset.rech)];
    api("recordatorios/hecho", { matricula: r.v.matricula, tipo: r.t }).then(function () { if (h) toast("Recordatorio marcado como enviado."); setTimeout(recordatorios, w ? 1500 : 0); }).catch(function (x) { toast(x.message); });
  });
  document.addEventListener("click", function (e) { var b = e.target.closest("[data-ficha]"); if (b) verFicha(b.dataset.ficha); });
  function verFicha(m) {
    api("ficha?m=" + encodeURIComponent(m)).then(function (j) {
      FICHA = j; var v = j.vehiculo || {};
      $("#dFichaT").innerHTML = plate(j.matricula_txt) + " " + esc(v.vehiculo || ""); $("#fiE").textContent = "";
      $("#fiC").value = v.cliente || ""; $("#fiT").value = v.telefono || ""; $("#fiV").value = v.vehiculo || ""; $("#fiI").value = v.itv || ""; $("#fiK").value = v.km || ""; $("#fiN").value = v.notas || "";
      var u = waUrl(v.telefono, "Hola " + nombre1(v.cliente) + ", te escribimos de Taller Motor Norte."); $("#fiWa").hidden = !u; if (u) $("#fiWa").href = u;
      var it = function (t, l, f) { return "<h3>" + t + " (" + l.length + ")</h3>" + (l.length ? l.map(f).join("") : '<p class="vacio small">Nada todavía.</p>'); };
      $("#fiH").innerHTML = '<div class="hist"><p class="small muted" style="margin:0">Total facturado: <b>' + eur(j.gastado) + "</b></p>" +
        it("Facturas", j.facturas, function (f) { return '<div class="it"><span><b>' + esc(f.codigo) + "</b> · " + fNum(f.fecha) + " · " + esc((f.lineas[0] || {}).c || "") + '</span><span class="row"><b>' + eur(f.total) + '</b><button class="btn btn-s" type="button" data-fiver="' + f.id + '">Ver</button></span></div>'; }) +
        it("Presupuestos", j.presupuestos, function (p) { return '<div class="it"><span><b>' + esc(p.codigo) + "</b> · " + fNum(p.fecha) + ' · <span class="pill">' + esc(p.estado) + "</span></span><b>" + eur(p.total) + "</b></div>"; }) +
        it("Citas", j.citas, function (c) { return '<div class="it"><span>' + fNum(c.fecha) + " " + esc(c.hora) + " · " + esc(c.servicio || "") + '</span><span class="pill">' + esc((EST[c.estado] || [c.estado])[0]) + "</span></div>"; }) +
        it("Reparaciones", j.reparaciones, function (r) { return '<div class="it"><span>' + esc(r.vehiculo || "") + " · " + esc(r.paso_txt) + '</span><span class="small muted">' + esc(String(r.actualizada || "").slice(0, 10).split("-").reverse().join("/")) + "</span></div>"; }) +
        it("Horas de taller", j.horas, function (h) { return '<div class="it"><span>' + fNum(h.fecha) + " · " + esc(h.mecanico) + " · " + esc(h.trabajo || "") + "</span><b>" + String(h.horas).replace(".", ",") + " h</b></div>"; }) + "</div>";
      $("#dFicha").showModal();
    }).catch(function (x) { toast(x.message); });
  }
  $("#fiH").addEventListener("click", function (e) { var b = e.target.closest("[data-fiver]"); if (!b) return; var f = FICHA.facturas.filter(function (x) { return x.id === +b.dataset.fiver; })[0]; api("misdatos").then(function (j) { $("#dFicha").close(); verFactura(f, j.datos); }); });
  function datosFicha() { return { nombre: $("#fiC").value, cliente: $("#fiC").value, telefono: $("#fiT").value, vehiculo: ($("#fiV").value + " · " + FICHA.matricula_txt).replace(/^ · /, "") }; }
  $("#fiG").addEventListener("click", function () { $("#fiE").textContent = ""; api("vehiculos/guardar", { matricula: FICHA.matricula, cliente: $("#fiC").value, telefono: $("#fiT").value, vehiculo: $("#fiV").value, itv: $("#fiI").value, km: $("#fiK").value, notas: $("#fiN").value }).then(function () { toast("Ficha guardada."); if (!$("#s-clis").hidden) clientes(); }).catch(function (x) { $("#fiE").textContent = x.message; }); });
  $("#fiCita").addEventListener("click", function () { var d = datosFicha(); $("#dFicha").close(); editarCita(null, d); });
  $("#fiPre").addEventListener("click", function () { var d = datosFicha(); $("#dFicha").close(); editarPre(null, d); });
  $("#fiFac").addEventListener("click", function () { var d = datosFicha(); $("#dFicha").close(); nuevaFactura(d); });

  /* ---------- PRESUPUESTOS ---------- */
  var PRES = [], preId = 0, PEMI = {};
  var PEST = { abierto: ["Pendiente", "warn"], aceptado: ["Aceptado", "ok"], rechazado: ["Rechazado", "bad"], facturado: ["Facturado", ""] };
  function presupuestos() {
    api("presupuestos").then(function (j) {
      PRES = j.presupuestos; PEMI = j.emisor;
      $("#prLista").innerHTML = PRES.length ? PRES.map(function (p) {
        var e = PEST[p.estado] || PEST.abierto, cad = p.estado === "abierto" && p.caduca < HOY;
        return '<article class="card cli"><h3><b>' + esc(p.codigo) + '</b> <span class="pill ' + e[1] + '">' + e[0] + "</span>" + (cad ? ' <span class="pill bad">Caducado</span>' : "") + "</h3><div class=\"small\"><b>" + esc(p.cliente) + "</b>" + (p.vehiculo ? " · " + esc(p.vehiculo) : "") + '</div><div class="small muted">' + fNum(p.fecha) + " · válido hasta " + fNum(p.caduca) + '</div><div style="font-weight:800;font-size:1.2rem;margin-top:.3rem">' + eur(p.total) + "</div>" +
          '<div class="row"><button class="btn btn-s" type="button" data-pver="' + p.id + '">Ver / imprimir</button>' + (waUrl(p.telefono, "x") ? '<a class="btn btn-s" target="_blank" rel="noopener" href="' + esc(waUrl(p.telefono, textoPre(p))) + '">WhatsApp</a>' : "") +
          (p.estado === "facturado" ? "" : '<button class="btn btn-s" type="button" data-ped="' + p.id + '">Editar</button>' + (p.estado !== "aceptado" ? '<button class="btn btn-s" type="button" data-pes="aceptado" data-id="' + p.id + '">Aceptado</button>' : "") + (p.estado !== "rechazado" ? '<button class="btn btn-s" type="button" data-pes="rechazado" data-id="' + p.id + '">Rechazado</button>' : "") + (p.estado !== "rechazado" ? '<button class="btn btn-s btn-p" type="button" data-pfac="' + p.id + '">🧾 Convertir en factura</button>' : "")) + "</div></article>";
      }).join("") : '<div class="card"><p class="vacio">Aún no hay presupuestos.</p></div>';
    }).catch(function (x) { toast(x.message); });
  }
  function textoPre(p) { return "Hola " + nombre1(p.cliente) + ", te enviamos el presupuesto " + p.codigo + " de Taller Motor Norte" + (p.vehiculo ? " para tu " + p.vehiculo : "") + ":\n" + p.lineas.map(function (x) { return "• " + x.c + ": " + eur(x.i); }).join("\n") + "\nTotal (IVA incluido): " + eur(p.total) + "\nVálido hasta el " + fNum(p.caduca) + ". Si te parece bien, responde «Acepto» y te damos cita."; }
  function htmlPre(p, em) {
    return '<div class="fac"><div class="cab"><div><h1>PRESUPUESTO</h1><div><b>' + esc(em.razon) + "</b><br>NIF/CIF: " + esc(em.nif) + "<br>" + esc(em.dir) + (em.cp ? "<br>" + esc(em.cp) : "") + (em.tel ? "<br>Tel. " + esc(em.tel) : "") + '</div></div><div class="num">Nº <b>' + esc(p.codigo) + "</b><br>Fecha: " + fNum(p.fecha) + "<br>Válido hasta: " + fNum(p.caduca) + "</div></div>" +
      '<div class="cli"><b>Cliente:</b> ' + esc(p.cliente) + (p.telefono ? "<br><b>Teléfono:</b> " + esc(p.telefono) : "") + (p.vehiculo ? "<br><b>Vehículo:</b> " + esc(p.vehiculo) : "") + "</div>" +
      '<table><thead><tr><th>Trabajo</th><th class="n">Importe (IVA incl.)</th></tr></thead><tbody>' + p.lineas.map(function (x) { return "<tr><td>" + esc(x.c) + '</td><td class="n">' + eur(x.i) + "</td></tr>"; }).join("") + "</tbody></table>" +
      '<div class="tt"><div class="g"><span>TOTAL</span><span>' + eur(p.total) + '</span></div></div><div class="pie">Presupuesto cerrado: no se hará ningún trabajo adicional sin tu aprobación. Este documento no es una factura.' + (YO.demo ? '<br><span class="demo">DEMOSTRACIÓN · datos ficticios.</span>' : "") + "</div></div>";
  }
  $("#prLista").addEventListener("click", function (e) {
    var b, p = function (id) { return PRES.filter(function (x) { return x.id === +id; })[0]; };
    if ((b = e.target.closest("[data-pver]"))) { var pr = p(b.dataset.pver); VER = null; $("#dVerT").textContent = "Presupuesto " + pr.codigo; $("#verB").innerHTML = htmlPre(pr, PEMI); $("#verR").hidden = true; $("#dVer").showModal(); $("#dVer")._pre = pr; return; }
    if ((b = e.target.closest("[data-ped]"))) { editarPre(p(b.dataset.ped)); return; }
    if ((b = e.target.closest("[data-pes]"))) { api("presupuestos/estado", { id: +b.dataset.id, estado: b.dataset.pes }).then(function () { toast("Presupuesto actualizado."); presupuestos(); }).catch(function (x) { toast(x.message); }); return; }
    if ((b = e.target.closest("[data-pfac]"))) { var q = p(b.dataset.pfac); if (!confirm("¿Emitir la factura de " + q.codigo + " (" + eur(q.total) + ") a nombre de " + q.cliente + "?")) return; b.disabled = true;
      api("presupuestos/facturar", { id: q.id, metodo: "tarjeta" }).then(function (j) { toast("Factura " + j.factura.codigo + " emitida desde el presupuesto."); verFactura(j.factura, j.emisor); presupuestos(); }).catch(function (x) { toast(x.message); b.disabled = false; }); }
  });
  $("#verP").addEventListener("click", function () { var pr = $("#dVer")._pre; if (!VER && pr) imprimir(htmlPre(pr, PEMI)); });
  $("#dVer").addEventListener("close", function () { $("#dVer")._pre = null; });
  function totPre() { var s = leeLineas($("#peL")).reduce(function (a, x) { return a + x.i; }, 0); $("#peTot").innerHTML = '<div class="g"><span>Total (IVA incluido)</span><span>' + eur(s) + "</span></div>"; }
  $("#peL").addEventListener("input", totPre);
  $("#peLA").addEventListener("click", function () { addLinea($("#peL"), {}); });
  function editarPre(p, pre) {
    pre = pre || {}; preId = p ? p.id : 0; $("#dPreT").textContent = p ? "Editar " + p.codigo : "Nuevo presupuesto"; $("#peE").textContent = "";
    $("#peC").value = p ? p.cliente : pre.cliente || ""; $("#peT").value = p ? p.telefono || "" : pre.telefono || ""; $("#peV").value = p ? p.vehiculo || "" : pre.vehiculo || ""; $("#peD").value = p ? p.validez || 30 : 30;
    lineas($("#peL"), p ? p.lineas : []); totPre(); $("#dPre").showModal(); $("#peC").focus();
  }
  $("#prNuevo").addEventListener("click", function () { editarPre(null); });
  $("#peG").addEventListener("click", function () { $("#peE").textContent = ""; api("presupuestos/guardar", { id: preId, cliente: $("#peC").value, telefono: $("#peT").value, vehiculo: $("#peV").value, validez: $("#peD").value, lineas: leeLineas($("#peL")) }).then(function () { $("#dPre").close(); toast("Presupuesto guardado."); if (!$("#s-pres").hidden) presupuestos(); }).catch(function (x) { $("#peE").textContent = x.message; }); });

  /* ---------- CAJA (cierre diario) ---------- */
  var CJ = null; $("#cjF").value = HOY; $("#cjF").max = HOY;
  $("#cjF").addEventListener("change", caja);
  function caja() {
    api("caja?fecha=" + ($("#cjF").value || HOY)).then(function (j) {
      CJ = j; var d = new Date(j.fecha + "T12:00:00");
      $("#cjP").textContent = (j.fecha === HOY ? "Hoy, " : "") + d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
      $("#cjK").innerHTML = '<div class="card kpi"><span>Facturado el día</span><b>' + eur0(j.total) + "</b><span>" + pl(j.n, "factura", "facturas") + "</span></div>" + Object.keys(j.nombres).map(function (k) { var x = j.metodos[k]; return '<div class="card kpi"><span>' + esc(j.nombres[k]) + "</span><b>" + eur(x.total) + "</b><span>" + pl(x.n, "cobro", "cobros") + "</span></div>"; }).join("");
      var c = j.cierre; $("#cjI").value = c && c.datos.inicial ? String(c.datos.inicial).replace(".", ",") : ""; $("#cjC").value = c ? String(c.contado).replace(".", ",") : ""; $("#cjN").value = c ? c.notas || "" : ""; $("#cjE").textContent = "";
      $("#cjEst").textContent = c ? "Caja cerrada el " + String(c.creado).slice(0, 16).replace(/(\d+)-(\d+)-(\d+) /, "$3/$2/$1 a las ") + ". Puedes volver a cerrarla si te equivocaste." : "Caja de este día sin cerrar.";
      cuadre();
      $("#cjH").innerHTML = j.historial.length ? j.historial.map(function (h) { return "<tr><td>" + fNum(h.fecha) + '</td><td class="n">' + eur(h.datos.total || 0) + '</td><td class="n">' + eur(h.contado) + '</td><td class="n"><span class="pill ' + (Math.abs(h.diferencia) < 0.01 ? "ok" : "bad") + '">' + (h.diferencia > 0 ? "+" : "") + eur(h.diferencia) + "</span></td></tr>"; }).join("") : '<tr><td colspan="4" class="vacio">Aún no hay cierres.</td></tr>';
    }).catch(function (x) { toast(x.message); });
  }
  function cuadre() {
    if (!CJ) return; var ef = CJ.metodos.efectivo.total, ini = importe($("#cjI").value), con = importe($("#cjC").value), esp = ini + ef, dif = con - esp;
    $("#cjT").innerHTML = "<div><span>Fondo inicial</span><span>" + eur(ini) + "</span></div><div><span>+ Cobros en efectivo</span><span>" + eur(ef) + '</span></div><div><span>= Debería haber</span><span>' + eur(esp) + "</span></div>" + ($("#cjC").value ? '<div class="g"><span>Diferencia</span><span class="' + (Math.abs(dif) < 0.01 ? "up" : "dn") + '">' + (dif > 0 ? "+" : "") + eur(dif) + (Math.abs(dif) < 0.01 ? " · cuadra" : dif > 0 ? " · sobra" : " · falta") + "</span></div>" : "");
  }
  ["#cjI", "#cjC"].forEach(function (s) { $(s).addEventListener("input", cuadre); });
  $("#cjForm").addEventListener("submit", function (e) { e.preventDefault(); $("#cjE").textContent = ""; if (!$("#cjC").value.trim()) { $("#cjE").textContent = "Escribe el efectivo que has contado."; return; } api("caja/cerrar", { fecha: CJ.fecha, inicial: importe($("#cjI").value), contado: importe($("#cjC").value), notas: $("#cjN").value }).then(function (j) { toast(Math.abs(j.diferencia) < 0.01 ? "Caja cerrada: cuadra al céntimo." : "Caja cerrada con una diferencia de " + eur(j.diferencia) + "."); caja(); }).catch(function (x) { $("#cjE").textContent = x.message; }); });
  $("#cjImp").addEventListener("click", function () {
    if (!CJ) return; var em = EMISOR.razon ? EMISOR : { razon: "Taller Motor Norte" }, ef = CJ.metodos.efectivo.total, ini = importe($("#cjI").value), con = importe($("#cjC").value);
    imprimir('<div class="fac"><div class="cab"><div><h1>CIERRE DE CAJA</h1><b>' + esc(em.razon) + '</b></div><div class="num">' + fNum(CJ.fecha) + "<br>Impreso: " + new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) + '</div></div><table><tbody>' + Object.keys(CJ.nombres).map(function (k) { return "<tr><td>" + esc(CJ.nombres[k]) + " (" + CJ.metodos[k].n + ')</td><td class="n">' + eur(CJ.metodos[k].total) + "</td></tr>"; }).join("") +
      '</tbody></table><div class="tt"><div><span>Total facturado</span><span>' + eur(CJ.total) + "</span></div><div><span>Fondo inicial</span><span>" + eur(ini) + "</span></div><div><span>Debería haber en efectivo</span><span>" + eur(ini + ef) + "</span></div><div><span>Contado</span><span>" + eur(con) + '</span></div><div class="g"><span>Diferencia</span><span>' + eur(con - ini - ef) + "</span></div></div>" + ($("#cjN").value ? '<div class="pie">Notas: ' + esc($("#cjN").value) + "</div>" : "") + (YO.demo ? '<div class="pie demo">DEMOSTRACIÓN · datos ficticios.</div>' : "") + "</div>");
  });

  /* ---------- MECÁNICOS (horas de trabajo) ---------- */
  $("#mcM").value = HOY.slice(0, 7); $("#mcM").addEventListener("change", mecanicos);
  var HOR = [];
  function mecanicos() {
    var m = $("#mcM").value || HOY.slice(0, 7), y = +m.slice(0, 4), mo = +m.slice(5, 7), a = m + "-01", b = iso(new Date(y, mo, 0));
    api("horas?desde=" + a + "&hasta=" + b).then(function (j) {
      HOR = j.horas; $("#mcP").textContent = MESES[mo - 1].replace(/^./, function (c) { return c.toUpperCase(); }) + " de " + y;
      $("#mecL").innerHTML = j.mecanicos.map(function (x) { return '<option value="' + esc(x) + '">'; }).join("");
      barras($("#mcBar"), j.totales, function (x) { return x.horas; }, function (x) { return x.mecanico; }, function (x) { return String(x.horas).replace(".", ",") + " h · " + pl(x.coches, "coche", "coches"); });
      var t = j.totales.reduce(function (s, x) { return s + x.horas; }, 0); $("#mcNota").textContent = t ? "Total del taller: " + String(Math.round(t * 100) / 100).replace(".", ",") + " horas apuntadas." : "";
      $("#mcLista").innerHTML = HOR.length ? '<div class="hist">' + HOR.map(function (h) { return '<div class="it"><span>' + fNum(h.fecha) + " · <b>" + esc(h.mecanico) + "</b> · " + esc(h.trabajo || "") + (h.matricula_txt ? " · " + esc(h.matricula_txt) : "") + '</span><span class="row"><b>' + String(h.horas).replace(".", ",") + ' h</b><button class="btn btn-s btn-d" type="button" data-hbor="' + h.id + '" aria-label="Borrar este apunte">✕</button></span></div>'; }).join("") + "</div>" : '<p class="vacio">No hay horas apuntadas este mes.</p>';
    }).catch(function (x) { toast(x.message); });
  }
  $("#mcLista").addEventListener("click", function (e) { var b = e.target.closest("[data-hbor]"); if (!b || !confirm("¿Borrar este apunte de horas?")) return; api("horas/borrar", { id: +b.dataset.hbor }).then(function () { toast("Apunte borrado."); mecanicos(); }).catch(function (x) { toast(x.message); }); });
  function apuntarHoras(pre) { pre = pre || {}; $("#hoE").textContent = ""; $("#hoM").value = pre.mecanico || ""; $("#hoF").value = HOY; $("#hoH").value = ""; $("#hoP").value = pre.matricula || ""; $("#hoT").value = pre.trabajo || ""; $("#dHor").showModal(); (pre.mecanico ? $("#hoH") : $("#hoM")).focus(); }
  $("#mcNueva").addEventListener("click", function () { apuntarHoras(); });
  $("#hoG").addEventListener("click", function () { $("#hoE").textContent = ""; api("horas/nueva", { mecanico: $("#hoM").value, fecha: $("#hoF").value, horas: importe($("#hoH").value), matricula: $("#hoP").value, trabajo: $("#hoT").value }).then(function () { $("#dHor").close(); toast("Horas apuntadas."); if (!$("#s-mecs").hidden) mecanicos(); }).catch(function (x) { $("#hoE").textContent = x.message; }); });

  /* ---------- SERVICIOS ---------- */
  var SVS = [], svId = 0, svImg = "";
  function srcSv(s) { return /^\/api\//.test(s) ? s : (s || "img/diagnosis") + "-m.webp"; }
  function servicios() {
    api("servicios").then(function (j) {
      SVS = j.servicios; $("#servL").innerHTML = SVS.map(function (s) { return '<option value="' + esc(s.nombre) + '">'; }).join("");
      $("#svLista").innerHTML = SVS.length ? SVS.map(function (s, i) {
        return '<article class="card sv"><img src="' + esc(srcSv(s.imagen)) + '" alt="" loading="lazy"><h3>' + esc(s.nombre) + "</h3>" +
          '<div class="row" style="gap:.35rem"><span class="pr">desde ' + eur(s.precio) + '</span><span class="pill">' + esc(CATS[s.cat] || s.cat) + "</span>" + (s.visible ? '<span class="pill ok">En la web</span>' : '<span class="pill bad">Oculto</span>') + (s.etiqueta ? '<span class="pill warn">' + esc(s.etiqueta) + "</span>" : "") + "</div>" +
          '<p class="small muted" style="margin:.5rem 0">' + esc(s.descr) + '</p><div class="row"><button class="btn btn-s" type="button" data-sved="' + s.id + '">Editar</button><button class="btn btn-s" type="button" data-svup="' + i + '" aria-label="Subir ' + esc(s.nombre) + '"' + (i ? "" : " disabled") + '>↑</button><button class="btn btn-s" type="button" data-svdn="' + i + '" aria-label="Bajar ' + esc(s.nombre) + '"' + (i < SVS.length - 1 ? "" : " disabled") + ">↓</button></div></article>";
      }).join("") : '<div class="card"><p class="vacio">Aún no hay servicios.</p></div>';
    }).catch(function (x) { toast(x.message); });
  }
  $("#svLista").addEventListener("click", function (e) {
    var ed = e.target.closest("[data-sved]"); if (ed) { editarSv(SVS.filter(function (x) { return x.id === +ed.dataset.sved; })[0]); return; }
    var up = e.target.closest("[data-svup]"), dn = e.target.closest("[data-svdn]"); if (!up && !dn) return;
    var i = +(up || dn).dataset[up ? "svup" : "svdn"], j2 = up ? i - 1 : i + 1, ids = SVS.map(function (s) { return s.id; }); var t = ids[i]; ids[i] = ids[j2]; ids[j2] = t;
    api("servicios/orden", { ids: ids }).then(function () { toast("Orden guardado. Así se ve en la web."); servicios(); }).catch(function (x) { toast(x.message); });
  });
  function pintaSvFotos() { fotos($("#svF"), svImg, /^\/api\//.test(svImg) ? svImg : ""); }
  function editarSv(s) {
    svId = s ? s.id : 0; svImg = s ? s.imagen : "img/diagnosis"; $("#svErr").textContent = ""; $("#dSvT").textContent = s ? "Editar servicio" : "Nuevo servicio";
    $("#svN").value = s ? s.nombre : ""; $("#svC").value = s ? s.cat : "mant"; $("#svP").value = s ? String(s.precio).replace(".", ",") : ""; $("#svE").value = s ? s.etiqueta || "" : ""; $("#svD").value = s ? s.descr || "" : ""; $("#svS").value = s ? s.specs || "" : ""; $("#svV").checked = s ? !!s.visible : true;
    pintaSvFotos(); $("#svB").hidden = !s; $("#dSv").showModal(); $("#svN").focus();
  }
  $("#svF").addEventListener("click", function (e) { var b = e.target.closest("[data-f]"); if (!b) return; svImg = b.dataset.f; pintaSvFotos(); });
  $("#svFU").addEventListener("change", function () { subirFoto(this, function (u) { svImg = u; pintaSvFotos(); }); });
  $("#svNuevo").addEventListener("click", function () { editarSv(null); });
  $("#svG").addEventListener("click", function () {
    $("#svErr").textContent = "";
    api("servicios/guardar", { id: svId, nombre: $("#svN").value, cat: $("#svC").value, precio: $("#svP").value, etiqueta: $("#svE").value, descr: $("#svD").value, specs: $("#svS").value, imagen: svImg, visible: $("#svV").checked })
      .then(function () { $("#dSv").close(); toast("Servicio guardado. Ya se ve en la web."); servicios(); }).catch(function (x) { $("#svErr").textContent = x.message; });
  });
  $("#svB").addEventListener("click", function () { if (!confirm("¿Borrar este servicio de la web?")) return; api("servicios/borrar", { id: svId }).then(function () { $("#dSv").close(); toast("Servicio borrado."); servicios(); }).catch(function (x) { $("#svErr").textContent = x.message; }); });

  /* ---------- MIS DATOS ---------- */
  function misDatos() { api("misdatos").then(function (j) { var d = j.datos; EMISOR = d; $("#mdR").value = d.razon; $("#mdN").value = d.nif; $("#mdD").value = d.dir; $("#mdC").value = d.cp; $("#mdT").value = d.tel; $("#mdM").value = d.email; $("#mdG").value = d.gestoria; $("#mdI").value = String(d.iva); $("#mdP").value = d.pie; $("#mdW").value = d.resenas || ""; }).catch(function (x) { toast(x.message); }); }
  $("#fmd").addEventListener("submit", function (e) {
    e.preventDefault(); $("#mdE").textContent = "";
    api("misdatos", { razon: $("#mdR").value, nif: $("#mdN").value, dir: $("#mdD").value, cp: $("#mdC").value, tel: $("#mdT").value, email: $("#mdM").value, gestoria: $("#mdG").value, iva: $("#mdI").value, pie: $("#mdP").value, resenas: $("#mdW").value })
      .then(function (j) { EMISOR = j.datos; toast("Datos guardados. Saldrán en tus facturas."); }).catch(function (x) { $("#mdE").textContent = x.message; });
  });
})();
