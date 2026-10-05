// Настройки сайта. Меняйте только эти три строки
var SITE = {
  // Номер счётчика Яндекс Метрики. 0 — Метрика выключена
  metrika: 0,
  // Ссылка на оплату в ЮKassa. Пока пусто, вместо кнопки оплаты показывается запись в лист ожидания
  payUrl: "",
  // Ссылка на Google Таблицу, которая заканчивается на /copy. Пока пусто, кнопка спрятана
  sheetUrl: ""
};

(function () {
  // Метрика
  if (SITE.metrika) {
    (function (m, e, t, r, i, k, a) {
      m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
      m[i].l = 1 * new Date();
      k = e.createElement(t); a = e.getElementsByTagName(t)[0]; k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
    })(window, document, "script", "https://mc.yandex.ru/metrika/tag.js?id=" + SITE.metrika, "ym");
    ym(SITE.metrika, "init", { ssr: true, webvisor: true, clickmap: true, accurateTrackBounce: true, trackLinks: true });
  }
  function goal(name) { if (SITE.metrika && window.ym) ym(SITE.metrika, "reachGoal", name); }

  // Цели по кнопкам с data-goal
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("[data-goal]");
    if (a) goal(a.getAttribute("data-goal"));
  });

  // Режим продажи: есть ссылка на оплату — показываем кнопку оплаты, иначе — лист ожидания
  var pay = document.querySelectorAll("[data-pay]");
  var wait = document.querySelectorAll("[data-wait]");
  for (var i = 0; i < pay.length; i++) {
    pay[i].hidden = !SITE.payUrl;
    if (pay[i].tagName === "A" && SITE.payUrl) pay[i].href = SITE.payUrl;
  }
  for (var j = 0; j < wait.length; j++) wait[j].hidden = !!SITE.payUrl;

  // Ссылка на Google Таблицу
  var sheet = document.querySelectorAll("[data-sheet]");
  for (var s = 0; s < sheet.length; s++) {
    sheet[s].hidden = !SITE.sheetUrl;
    if (SITE.sheetUrl) sheet[s].href = SITE.sheetUrl;
  }

  // Форма листа ожидания: отправка в Netlify Forms в фоне, затем страница «Спасибо».
  // Без JavaScript форма уходит обычной отправкой через action
  var form = document.getElementById("wait-form");
  if (form && window.fetch && window.URLSearchParams) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      goal("waitlist");
      var btn = form.querySelector("[type=submit]");
      if (btn) { btn.disabled = true; btn.textContent = "Записываю…"; }
      var done = false;
      function go() { if (!done) { done = true; location.href = "/spasibo.html"; } }
      setTimeout(go, 3000);
      fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(new FormData(form)).toString()
      }).catch(function () {}).then(go);
    });
  }

  // Липкая кнопка: видна после первого экрана и прячется у блока покупки
  var bar = document.getElementById("sticky");
  var hero = document.querySelector(".hero");
  var buy = document.getElementById("buy");
  if (bar && hero && buy && "IntersectionObserver" in window) {
    var heroOut = false, buyIn = false;
    var upd = function () {
      var on = heroOut && !buyIn;
      bar.classList.toggle("show", on);
      bar.setAttribute("aria-hidden", on ? "false" : "true");
      var links = bar.querySelectorAll("a");
      for (var l = 0; l < links.length; l++) links[l].tabIndex = on ? 0 : -1;
    };
    new IntersectionObserver(function (e) { heroOut = !e[0].isIntersecting; upd(); }).observe(hero);
    new IntersectionObserver(function (e) { buyIn = e[0].isIntersecting; upd(); }).observe(buy);
  }
})();
