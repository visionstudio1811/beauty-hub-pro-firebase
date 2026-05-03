import { cn } from '@/lib/utils';

/** Subtle line-art botanical for the top-right of login form panels. */
export function LoginFloralCorner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('pointer-events-none text-foreground/10', className)}
      viewBox="0 0 320 280"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <g stroke="currentColor" strokeWidth="0.75" strokeLinecap="round">
        <path d="M260 8c-32 18-48 52-42 88 6 40 38 70 78 76" />
        <path d="M228 24c-18 42-8 90 24 118" />
        <path d="M200 40c-8 28 4 58 28 72" />
        <path d="M288 48c-52 4-88 36-96 84" />
        <path d="M300 120c-36 8-64 32-72 64" />
        <path d="M180 100c12-20 36-32 60-28" />
        <path d="M152 132c8-24 32-40 56-36" />
        <path d="M248 168c-28-4-52 8-64 32" />
        <path d="M120 180c20-8 44-4 60 12" />
        <path d="M88 200c16-4 32-2 44 8" />
        <path d="M196 208c-12 16-8 40 8 52" />
        <path d="M220 228c-20-4-36 4-44 22" />
      </g>
    </svg>
  );
}
