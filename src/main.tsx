import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { initFirebase } from './lib/firebase';

const root = createRoot(document.getElementById('root')!);

initFirebase()
  .then(async () => {
    const { App } = await import('./App');
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch((err) => {
    console.error(err);
    root.render(
      <div style={{ padding: 32, fontFamily: 'system-ui', maxWidth: 480, margin: '10vh auto', textAlign: 'center' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Aplikáciu sa nepodarilo načítať</h1>
        <p style={{ color: '#6b645e' }}>Skontrolujte pripojenie na internet a obnovte stránku.</p>
        <button onClick={() => location.reload()} style={{ marginTop: 16, padding: '10px 18px', borderRadius: 12, background: '#ea580c', color: '#fff', border: 0, fontWeight: 600 }}>
          Skúsiť znova
        </button>
      </div>,
    );
  });
