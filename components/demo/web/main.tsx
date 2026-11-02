import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { AuthorityConsole } from './AuthorityConsole.tsx';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {window.location.pathname.startsWith('/console') || window.location.pathname.startsWith('/demo/console') ? <AuthorityConsole /> : <App />}
  </StrictMode>,
);
