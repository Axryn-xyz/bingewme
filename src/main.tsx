import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/brutalism.css';
import './styles/lobby.css';
import './styles/theme.css';
import { applyTheme, readAccent } from './lib/theme';
applyTheme(readAccent());
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
