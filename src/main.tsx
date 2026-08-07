import React from 'react';
import { createRoot } from 'react-dom/client';
// Bundled, not fetched from a CDN: the page must render identically offline and
// on a first visit, and the grid depends on Inter's metrics.
import '@fontsource-variable/inter';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
