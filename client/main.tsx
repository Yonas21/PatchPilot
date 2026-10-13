import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/base.css';
import './styles/shell.css';
import './styles/overview.css';
import './styles/metrics.css';
import './styles/responsive-layout.css';
import './styles/panels.css';
import './styles/tables.css';
import './styles/inventories.css';
import './styles/tasks-activity.css';
import './styles/feedback.css';
import './styles/responsive-components.css';
import './styles/forms.css';
import './styles/finding-detail.css';
import './styles/settings.css';
import './styles/responsive-forms.css';
import './styles/workbench.css';
import './styles/workbench-responsive.css';
import './styles/release.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
