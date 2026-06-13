import { cn } from "@/lib/utils";

interface SalonMarqueeProps {
  className?: string;
  /** Seconds for one full loop. Smaller = faster. */
  speedSec?: number;
  /** Grayscale logos until hover. Defaults to true. */
  desaturate?: boolean;
}

// Salon logos served from public/clients/. Add more by dropping N.png in and
// bumping the length — the list is duplicated below for a seamless loop.
const LOGOS = Array.from({ length: 11 }, (_, i) => `/clients/${i + 1}.png`);

/**
 * Scrolling logo strip of salons on the Beauty Hub Pro network — the signature
 * "network" element from the Golden Circle design. Always rendered on a dark
 * surface (`.is-dark`) so the brand vars flip locally and the edge fades read
 * correctly on an otherwise-cream page.
 */
export const SalonMarquee = ({
  className,
  speedSec = 38,
  desaturate = true,
}: SalonMarqueeProps) => {
  const items = [...LOGOS, ...LOGOS]; // duplicated for seamless -50% loop

  return (
    <section
      aria-label="Salons on the Beauty Hub Pro network"
      className={cn(
        "is-dark relative overflow-hidden border-y border-[rgb(var(--c-line)/0.4)]",
        className,
      )}
    >
      {/* Edge fades — dark surface → transparent. Arbitrary values because the
          `cream` color isn't registered in this app's Tailwind config. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-20 z-10 bg-[linear-gradient(to_right,rgb(var(--c-cream)),transparent)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 w-20 z-10 bg-[linear-gradient(to_left,rgb(var(--c-cream)),transparent)]"
      />

      <div className="py-8">
        <div
          className="flex w-max items-center gap-14 animate-marquee hover:[animation-play-state:paused]"
          style={{ animationDuration: `${speedSec}s` }}
        >
          {items.map((src, idx) => (
            <img
              key={`${src}-${idx}`}
              src={src}
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              draggable={false}
              className={cn(
                "h-12 md:h-14 w-auto object-contain select-none flex-shrink-0",
                "opacity-70 hover:opacity-100 transition-all duration-300",
                desaturate && "grayscale hover:grayscale-0",
              )}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default SalonMarquee;
