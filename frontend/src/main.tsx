import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { useLang } from './i18n';
import { SessionProvider } from './session';
import './styles.css';

/** Switching language draws the whole app again in the new words (the park restarts too, which is fine). */
function LangRoot() {
  const lang = useLang();
  return <App key={lang} />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <LangRoot />
      </SessionProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
