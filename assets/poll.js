// Repeating refresh that stops while the tab is hidden.
//
// A data page left open in a background tab used to keep calling the APIs
// on every timer tick, all day, for nobody. pollWhileVisible(fn, ms) runs fn
// every ms milliseconds only while the page is visible. When the visitor
// comes back after a full interval or more, it runs fn once straight away so
// the numbers they see are current. The caller still does the first load.
(function () {
  function pollWhileVisible(fn, ms) {
    let last = Date.now();
    const run = () => { last = Date.now(); fn(); };
    const id = setInterval(() => { if (!document.hidden) run(); }, ms);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && Date.now() - last >= ms) run();
    });
    return id;
  }
  window.pollWhileVisible = pollWhileVisible;
})();
