import React from 'react';
import { createRoot } from 'react-dom/client';
import '@pdxui/design';   // CSS
import '@pdxui/ui';       // registers <pdx-*> custom elements
import App from './App.jsx';

createRoot(document.getElementById('root')).render(<App />);
