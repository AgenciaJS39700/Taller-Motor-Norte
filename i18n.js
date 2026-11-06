/* i18n.js — Taller Motor Norte en 8 idiomas (es, ca, eu, gl, en, fr, de, it).
   · El texto original de la web está en español. Cada idioma tiene su diccionario en i18n/<idioma>.js
     ({"texto en español": "traducción"}). Solo se descarga el del idioma elegido.
   · Traduce el HTML y todo lo que los scripts añaden después (servicios, testigos, seguimiento, asistente).
   · Frases con datos variables: la clave lleva {0}, {1}… (p. ej. "Abierto ahora · cierra a las {0}").
   · El idioma se recuerda en este navegador; si no hay elección, se usa el del navegador cuando es uno de los 8.
   · El panel del taller y las facturas no usan este archivo: siguen en español. */
(function () {
  "use strict";
  var LANGS = [["es", "Español"], ["ca", "Català"], ["eu", "Euskara"], ["gl", "Galego"], ["en", "English"], ["fr", "Français"], ["de", "Deutsch"], ["it", "Italiano"]];
  var LOC = { es: "es-ES", ca: "ca-ES", eu: "eu-ES", gl: "gl-ES", en: "en-GB", fr: "fr-FR", de: "de-DE", it: "it-IT" };
  var ok = function (l) { return LANGS.some(function (x) { return x[0] === l; }); };
  var lang = null;
  try { var q = new URLSearchParams(location.search).get("lang"); if (q && ok(q)) { lang = q; localStorage.setItem("tmn-lang", q); } } catch (e) {}
  if (!lang) try { lang = localStorage.getItem("tmn-lang"); } catch (e) {}
  if (!lang || !ok(lang)) { lang = "es"; (navigator.languages || [navigator.language || ""]).some(function (n) { var c = String(n).slice(0, 2).toLowerCase(); if (ok(c)) { lang = c; return true; } return false; }); }
  document.documentElement.lang = lang;
  var DICT = {}, PAT = [];
  var I = window.I18N = { lang: lang, langs: LANGS, locale: LOC[lang], dict: DICT, t: t, setLang: setLang };
  if (/[?&]i18ncollect/.test(location.search)) { var vistos = window.__miss = []; I.collect = function (k) { if (vistos.indexOf(k) < 0) vistos.push(k); }; }

  function nrmK(s) { return String(s).replace(/\s+/g, " ").trim(); }
  /* t("Hola {0}", ["Ana"]) → traducción con los datos puestos */
  function t(es, vars) {
    var k = nrmK(es), r = DICT[k];
    if (r == null) r = es;
    if (vars) r = String(r).replace(/\{(\d)\}/g, function (m, i) { return vars[+i] == null ? "" : vars[+i]; });
    return r;
  }
  function setLang(l) {
    if (!ok(l) || l === lang) return;
    try { localStorage.setItem("tmn-lang", l); } catch (e) {}
    var u = new URL(location.href); u.searchParams.delete("lang"); location.replace(u.pathname + u.search + location.hash);
  }

  if (lang !== "es") {
    document.documentElement.classList.add("i18n-wait");
    setTimeout(function () { document.documentElement.classList.remove("i18n-wait"); }, 2500);
    window.I18N_SET = function (d) {
      Object.keys(d).forEach(function (k) {
        var kk = nrmK(k); DICT[kk] = d[k];
        if (/\{\d\}/.test(kk)) {
          var re = "^" + kk.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{\d\}/g, "(.+?)") + "$";
          var ord = (kk.match(/\{(\d)\}/g) || []).map(function (x) { return +x[1]; });
          PAT.push({ re: new RegExp(re), to: d[k], ord: ord });
        }
      });
    };
    document.write('<script src="i18n/' + lang + '.js?v=1"><\/script>');
  }

  /* ---------- traducir el DOM ---------- */
  function tr(s) {
    var k = nrmK(s); if (!k || !/[A-Za-zÀ-ÿ]/.test(k)) return null;
    if (DICT[k] != null) return DICT[k];
    for (var i = 0; i < PAT.length; i++) {
      var m = PAT[i].re.exec(k); if (!m) continue;
      var vals = {}; PAT[i].ord.forEach(function (n, j) { var v = m[j + 1]; vals[n] = DICT[nrmK(v)] != null ? DICT[nrmK(v)] : v; });
      return String(PAT[i].to).replace(/\{(\d)\}/g, function (x, n) { return vals[n] == null ? "" : vals[n]; });
    }
    if (I.collect) I.collect(k);
    return null;
  }
  var ATTR = ["placeholder", "aria-label", "title", "alt"];
  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, CODE: 1 };
  function texto(n) {
    var p = n.parentNode; if (!p || SKIP[p.nodeName] || (p.closest && p.closest("[data-noi18n],svg,input"))) return;
    var v = n.data, r = tr(v); if (r == null || r === nrmK(v)) return;
    var a = v.match(/^\s*/)[0], b = v.match(/\s*$/)[0];
    n.data = a + r + b;
  }
  function atributos(el) {
    if (el.closest && el.closest("[data-noi18n]")) return;
    for (var i = 0; i < ATTR.length; i++) { var v = el.getAttribute(ATTR[i]); if (v) { var r = tr(v); if (r != null && r !== v) el.setAttribute(ATTR[i], r); } }
    if (el.nodeName === "INPUT" && /^(button|submit)$/i.test(el.type) && el.value) { var r2 = tr(el.value); if (r2) el.value = r2; }
  }
  function recorrer(root) {
    if (root.nodeType === 3) return texto(root);
    if (root.nodeType !== 1 || SKIP[root.nodeName]) return;
    atributos(root);
    var w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT), n;
    while ((n = w.nextNode())) { if (n.nodeType === 3) texto(n); else if (!SKIP[n.nodeName]) atributos(n); }
  }
  I.tr = tr; I.recorrer = recorrer;

  /* ---------- selector de idioma ---------- */
  function selector() {
    var hdr = document.querySelector(".hdr-r"), cur = lang.toUpperCase();
    var lista = LANGS.map(function (x) { return '<button type="button" role="menuitemradio" lang="' + x[0] + '" data-lang="' + x[0] + '" aria-checked="' + (x[0] === lang) + '">' + x[1] + "</button>"; }).join("");
    if (hdr) {
      var w = document.createElement("div"); w.className = "lng"; w.setAttribute("data-noi18n", "");
      w.innerHTML = '<button type="button" class="lng-b" aria-haspopup="true" aria-expanded="false" aria-label="Idioma · Language"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.8 3.9 5.8 3.9 9s-1.3 6.2-3.9 9c-2.6-2.8-3.9-5.8-3.9-9S9.4 5.8 12 3z"/></svg><span>' + cur + '</span></button><div class="lng-m" role="menu" hidden>' + lista + "</div>";
      hdr.insertBefore(w, hdr.firstChild);
      var b = w.querySelector(".lng-b"), m = w.querySelector(".lng-m");
      var cerrar = function () { m.hidden = true; b.setAttribute("aria-expanded", "false"); };
      b.addEventListener("click", function (e) { e.stopPropagation(); var abre = m.hidden; m.hidden = !abre; b.setAttribute("aria-expanded", String(abre)); if (abre) { var s = m.querySelector('[aria-checked="true"]'); if (s) s.focus(); } });
      document.addEventListener("click", function (e) { if (!w.contains(e.target)) cerrar(); });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !m.hidden) { cerrar(); b.focus(); } });
    }
    var sh = document.getElementById("msheet");
    if (sh) { var r = document.createElement("div"); r.className = "lng-row"; r.setAttribute("data-noi18n", ""); r.setAttribute("role", "group"); r.setAttribute("aria-label", "Idioma · Language"); r.innerHTML = lista; sh.insertBefore(r, sh.firstChild); }
    document.addEventListener("click", function (e) { var x = e.target.closest && e.target.closest("[data-lang]"); if (x) setLang(x.dataset.lang); });
  }

  document.addEventListener("DOMContentLoaded", function () {
    selector();
    if (lang === "es" && !I.collect) return;
    var t0 = document.title, tt = tr(t0); if (tt) document.title = tt;
    var md = document.querySelector('meta[name="description"]'); if (md) { var d = tr(md.content); if (d) md.content = d; }
    recorrer(document.body);
    document.documentElement.classList.remove("i18n-wait");
    new MutationObserver(function (ms) {
      ms.forEach(function (m) {
        if (m.type === "attributes") { if (m.target.nodeType === 1) atributos(m.target); return; }
        if (m.type === "characterData") return texto(m.target);
        m.addedNodes.forEach(recorrer);
      });
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTR });
  });
})();
