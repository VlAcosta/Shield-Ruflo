import { useEffect } from 'react';

export default function useLandingReveal() {
  useEffect(() => {
    const root = document.querySelector('.landing-page');
    if (!root) return undefined;

    const items = Array.from(root.querySelectorAll('[data-landing-reveal]'));
    if (!items.length) return undefined;

    if (typeof IntersectionObserver === 'undefined') {
      items.forEach((item) => item.classList.add('is-visible'));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );

    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);
}
