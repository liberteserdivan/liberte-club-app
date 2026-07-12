import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/tokens.css';
import './styles/app.css';
import { warmApi } from './services/bootService.js';

// Açılışta yalnızca hafif health — login'i bloklamaz
warmApi().catch(() => {});

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
