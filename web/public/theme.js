// Runs before the first render so the page does not flash light.
(function () {
  try {
    var pref = localStorage.getItem("snd:theme") || "system";
    var dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  } catch (e) {
    if (matchMedia("(prefers-color-scheme: dark)").matches) document.documentElement.classList.add("dark");
  }
})();
