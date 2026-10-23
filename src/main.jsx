import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { appliquerTheme, lireTheme } from './lib/theme.js';
import './styles.css';

// Avant le premier rendu, pour éviter un éclair du mauvais thème.
appliquerTheme(lireTheme());

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
