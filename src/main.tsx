import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import '@/i18n'
import '@/i18n/zodErrorMap'

createRoot(document.getElementById("root")!).render(<App />);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js?v=login-luxury-20260503')
      .catch(() => undefined);
  });
}
