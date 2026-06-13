import { cn } from "@/lib/utils";

interface WordmarkProps {
  className?: string;
}

/**
 * The Beauty Hub Pro wordmark with the Golden Circle signature gold period.
 * Render inside a `.gc-site` page so `.font-display` resolves to Bricolage
 * Grotesque and `.gold-ink` resolves to the brand gold (auto-shifts brighter
 * inside `.is-dark` surfaces). Set the text color on the parent/usage site
 * (e.g. `text-ink` on cream, `text-cream` on dark).
 */
export const Wordmark = ({ className }: WordmarkProps) => (
  <span
    className={cn(
      "font-display font-extrabold tracking-tight whitespace-nowrap",
      className,
    )}
  >
    beautyhubpro<span className="gold-ink">.</span>
  </span>
);

export default Wordmark;
