import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App';
import { SoundHint } from './ui/SoundHint';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <SoundHint />
  </StrictMode>,
);
