import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import { CustomContentWorkshopPage } from './app/customContent/CustomContentWorkshopPage';
import './styles/global.css';

async function renderApplication(): Promise<void> {
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
  const imageProbeLabEnabled = import.meta.env.MODE === 'image-probe';
  const imageProbeLabRequested = window.location.hash === '#/image-probe-lab';
  let content = pathname === '/custom-content' ? <CustomContentWorkshopPage /> : <App />;

  const workshopEnabled = import.meta.env.DEV || import.meta.env.VITE_WORKSHOP_ENABLED === 'true';
  if (pathname === '/workshop' && workshopEnabled) {
    const { OnlineWorkshopPage } = await import('./app/workshop/OnlineWorkshopPage');
    content = <OnlineWorkshopPage />;
  }

  if (imageProbeLabEnabled && imageProbeLabRequested) {
    const { ImageProbeBoundaryLab } = await import('./app/imageProbeLab/ImageProbeBoundaryLab');
    content = <ImageProbeBoundaryLab />;
  }

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>{content}</React.StrictMode>
  );
}

void renderApplication();
