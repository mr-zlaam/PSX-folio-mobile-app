(() => {
  const yearTargets = document.querySelectorAll("[data-year]");
  const year = new Date().getFullYear();
  yearTargets.forEach((node) => {
    node.textContent = String(year);
  });
})();

