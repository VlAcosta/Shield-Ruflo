import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import AppErrorBoundary from './shared/errors/AppErrorBoundary';
import brandMark from './assets/brand/business-shield-mark.svg';

const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]') ?? document.createElement('link');
favicon.rel = 'icon';
favicon.type = 'image/svg+xml';
favicon.href = brandMark;
if (!favicon.parentNode) document.head.appendChild(favicon);

document.documentElement.style.setProperty('--business-shield-brand-mark', `url(${brandMark})`);

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Business Shield root element was not found');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AppErrorBoundary>
  </React.StrictMode>,
);
