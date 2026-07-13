import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './assets/styles/globals.css';
import './assets/styles/header.css';  // atau path yang sesuai

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);