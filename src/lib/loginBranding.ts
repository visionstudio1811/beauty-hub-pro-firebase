/**
 * Default hero for split login screens (client portal + staff /auth).
 * Override with `VITE_LOGIN_HERO_URL` in `.env` (absolute URL to a wide
 * spa / interior image, ~1600×1000 or larger).
 */
export const DEFAULT_LOGIN_HERO_URL =
  'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=1600&q=82';

const envHero =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_LOGIN_HERO_URL
    ? String(import.meta.env.VITE_LOGIN_HERO_URL).trim()
    : '';

export const LOGIN_HERO_URL = envHero || DEFAULT_LOGIN_HERO_URL;
