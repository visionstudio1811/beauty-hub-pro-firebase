import { useEffect } from "react";

/**
 * Adds `.in-view` to any element with `.gc-reveal` once it enters the viewport.
 * Pair with `.gc-reveal-d1` … `.gc-reveal-d5` to stagger delays.
 * Ported from the Golden Circle marketing site.
 */
export const useScrollReveal = () => {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("IntersectionObserver" in window)) {
      // Fallback: reveal everything immediately so content isn't hidden.
      document
        .querySelectorAll<HTMLElement>(".gc-reveal")
        .forEach((el) => el.classList.add("in-view"));
      return;
    }

    const seen = new WeakSet<Element>();

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !seen.has(entry.target)) {
            seen.add(entry.target);
            entry.target.classList.add("in-view");
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
    );

    const scan = () => {
      document.querySelectorAll<HTMLElement>(".gc-reveal").forEach((el) => {
        if (!seen.has(el)) observer.observe(el);
      });
    };

    scan();

    // Re-scan on route changes / late content (cheap MutationObserver).
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mo.disconnect();
    };
  }, []);
};

export default useScrollReveal;
