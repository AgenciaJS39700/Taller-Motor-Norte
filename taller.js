/* taller.js — Taller Motor Norte: datos reales del servidor en la web.
   1) Servicios (precios, especificaciones y fotos) tal y como los deja el taller en su panel (/api/web).
   2) Formulario «Pide cita»: día y hora con los huecos libres reales y reserva guardada en el servidor (/api/citas).
   Si el servidor no responde, la web sigue funcionando con lo que ya trae el HTML (WhatsApp y correo). */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var eur = function (n) { return Number(n || 0).toLocaleString("es-ES", { maximumFractionDigits: 2 }) + " €"; };
  var DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  var iso = function (d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  var bonita = function (f) { var d = new Date(f + "T12:00:00"); return DIAS[d.getDay()] + " " + d.getDate() + " de " + d.toLocaleDateString("es-ES", { month: "long" }); };
  window.TMN = { esc: esc, eur: eur, iso: iso, bonita: bonita, servicios: [] };

  function img(s) {
    if (/^\/api\/foto\//.test(s.imagen)) return '<img src="' + esc(s.imagen) + '" alt="' + esc(s.nombre) + '" width="720" height="576" loading="lazy" decoding="async">';
    var b = esc(s.imagen || "img/diagnosis");
    return '<img src="' + b + '-m.webp" srcset="' + b + '-m.webp 720w, ' + b + '.webp 1400w" sizes="(min-width:960px) 290px, (min-width:600px) 45vw, 92vw" alt="' + esc(s.nombre) + '" width="720" height="576" loading="lazy" decoding="async">';
  }
  function pintaServicios(lista) {
    var grid = $("#cat-grid"); if (!grid || !lista.length) return;
    var act = $('#servicios .tab[aria-selected="true"]'), cat = act ? act.dataset.cat : "all";
    grid.innerHTML = lista.map(function (s) {
      return '<article class="pc" data-id="' + esc(s.slug) + '" data-cat="' + esc(s.cat) + '"' + (cat !== "all" && s.cat !== cat ? " hidden" : "") + ">" + (s.etiqueta ? '<span class="tg">' + esc(s.etiqueta) + "</span>" : "") +
        '<div class="im ph">' + img(s) + "</div><h3>" + esc(s.nombre) + "</h3><p>" + esc(s.descr) + "</p>" +
        (s.specs && s.specs.length ? '<details class="inc"><summary>Qué incluye</summary><ul>' + s.specs.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></details>" : "") +
        '<div class="bt"><span class="pr">desde ' + eur(s.precio) + '<small></small></span><a class="add" href="#cita" data-serv="' + esc(s.nombre) + '" aria-label="Reservar ' + esc(s.nombre) + '">Reservar</a></div></article>';
    }).join("");
  }
  function opcionesServicio(lista) {
    var sel = $("#f-tipo"); if (!sel) return;
    sel.innerHTML = '<option value="">Elige un servicio…</option>' + lista.map(function (s) { return "<option>" + esc(s.nombre) + "</option>"; }).join("") + "<option>Otra cosa (cuéntanos abajo)</option>";
  }

  /* «Reservar» en una tarjeta: abre el asistente con ese servicio o, si no está, rellena el formulario */
  document.addEventListener("click", function (e) {
    var a = e.target.closest("[data-serv]"); if (!a) return;
    if (window.TMNChat && window.TMNChat.reservar) { e.preventDefault(); window.TMNChat.reservar(a.dataset.serv); return; }
    var sel = $("#f-tipo"); if (sel) { sel.value = a.dataset.serv; }
  });

  fetch("/api/web").then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (j) {
    window.TMN_DEMO = !!j.demo; window.TMN.servicios = j.servicios || []; window.TMN.cats = j.cats;
    pintaServicios(window.TMN.servicios); opcionesServicio(window.TMN.servicios);
    document.dispatchEvent(new CustomEvent("tmn-web", { detail: j }));
  }).catch(function () {});

  /* ---------- Formulario de cita con huecos reales ---------- */
  var f = $("#fcita"); if (!f) return;
  var fd = $("#f-dia"), fh = $("#f-hora"), st = $("#citast"), hoy = new Date();
  fd.min = iso(hoy); var mx = new Date(); mx.setDate(mx.getDate() + 60); fd.max = iso(mx);
  function cargaHoras() {
    var v = fd.value; fh.innerHTML = "<option value=''>Cargando horas…</option>"; fh.disabled = true;
    if (!v) { fh.innerHTML = "<option value=''>Primero elige el día</option>"; return; }
    fetch("/api/huecos?fecha=" + v).then(function (r) { return r.json(); }).then(function (j) {
      var libres = (j.horas || []).filter(function (h) { return h.libre; });
      if (!libres.length) { fh.innerHTML = "<option value=''>" + (new Date(v + "T12:00:00").getDay() === 0 ? "Los domingos cerramos" : "No quedan horas libres ese día") + "</option>"; return; }
      fh.innerHTML = "<option value=''>Elige la hora…</option>" + (j.horas || []).map(function (h) { return '<option value="' + h.hora + '"' + (h.libre ? "" : " disabled") + ">" + h.hora + (h.libre ? "" : " · completo") + "</option>"; }).join("");
      fh.disabled = false;
    }).catch(function () { fh.innerHTML = "<option value=''>No se han podido cargar las horas: usa WhatsApp</option>"; fh.required = false; });
  }
  fd.addEventListener("change", cargaHoras);
  f.addEventListener("submit", function (e) {
    e.preventDefault(); st.textContent = "";
    if (!f.reportValidity()) return;
    var bt = $("#citago"); bt.disabled = true; st.textContent = "Reservando…";
    var tipo = $("#f-tipo").value, notas = $("#f-serv").value.trim();
    fetch("/api/citas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre: $("#nombre").value, telefono: $("#telefono").value, vehiculo: $("#modelo").value, servicio: tipo || notas.slice(0, 80), notas: notas, fecha: fd.value, hora: fh.value, privacidad: $("#priv").checked, web: $("#f-web").value }) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) { var er = new Error(j.error || "No se ha podido reservar."); er.huecos = j.huecos; throw er; } return j; }); })
      .then(function (j) {
        var c = j.cita;
        st.innerHTML = "<b>¡Cita reservada!</b> " + esc(bonita(c.fecha)) + " a las " + esc(c.hora) + " · " + esc(c.servicio) + ". Te llamaremos para confirmarla.";
        f.reset(); fh.innerHTML = "<option value=''>Primero elige el día</option>"; fh.disabled = true;
      })
      .catch(function (x) { st.textContent = /fetch|network|JSON/i.test(x.message) ? "No se ha podido conectar. Usa WhatsApp o llámanos." : x.message; if (x.huecos) cargaHoras(); })
      .then(function () { bt.disabled = false; });
  });
})();
