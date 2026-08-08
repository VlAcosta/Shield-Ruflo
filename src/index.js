import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import AppErrorBoundary from "./shared/errors/AppErrorBoundary";
import brandMark from "./assets/brand/business-shield-mark.svg";

const favicon = document.querySelector('link[rel="icon"]') || document.createElement("link");
favicon.rel = "icon";
favicon.type = "image/svg+xml";
favicon.href = brandMark;
if (!favicon.parentNode) document.head.appendChild(favicon);

document.documentElement.style.setProperty("--business-shield-brand-mark", `url(${brandMark})`);

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <AppErrorBoundary>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </AppErrorBoundary>
);