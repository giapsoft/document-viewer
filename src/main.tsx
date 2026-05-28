import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { VersionBadge } from './components/VersionBadge';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <VersionBadge />
    <App />
  </StrictMode>,
);
