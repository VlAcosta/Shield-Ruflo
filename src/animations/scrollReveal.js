// src/animations/scrollReveal.js
export function initScrollReveal() {
  const els = Array.from(document.querySelectorAll("[data-animate]"));
  if (!els.length) return;

  const reduceMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduceMotion) {
    els.forEach((el) => el.classList.add("is-inview"));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;

        const el = e.target;
        const delay = el.getAttribute("data-delay");
        if (delay) el.style.setProperty("--reveal-delay", `${delay}ms`);

        el.classList.add("is-inview");
        io.unobserve(el);
      });
    },
    { threshold: 0.18, rootMargin: "0px 0px -10% 0px" }
  );

  els.forEach((el) => io.observe(el));
}