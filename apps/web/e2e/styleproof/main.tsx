import '@repo/ui/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { Gallery } from './Gallery';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <Gallery />
  </StrictMode>,
);
