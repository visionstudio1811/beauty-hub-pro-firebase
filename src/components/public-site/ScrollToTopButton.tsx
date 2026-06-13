import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

/**
 * Floating "back to top" button. Appears after the visitor scrolls past 400px
 * and smooth-scrolls to the top on click. Sits above the WhatsApp button at the
 * bottom-right. Uses the brand ink/cream tokens, so render it inside a `.gc-site`
 * page where those custom properties resolve.
 */
export const ScrollToTopButton = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Back to top"
      className="fixed bottom-24 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-ink text-cream shadow-lg hover:bg-[rgb(var(--c-ink2))] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
};

export default ScrollToTopButton;
