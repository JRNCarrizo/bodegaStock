import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { initApiFromBridge } from '@/lib/utils'
import './index.css'

async function bootstrap() {
  // Pintar la UI de inmediato; la URL del servidor se resuelve en paralelo.
  void initApiFromBridge()

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </React.StrictMode>
  )
}

void bootstrap()
