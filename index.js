import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { waClient } from './whatsapp_client.js';
import { aiService } from './ai_service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API: Obtener estado actual
app.get('/api/status', (req, res) => {
  res.json(waClient.getStatus());
});

// API: Actualizar configuraciones
app.post('/api/settings', (req, res) => {
  try {
    const updated = config.update(req.body);
    waClient.notifyListeners();
    res.json({ success: true, settings: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Limpiar historial de memoria IA
app.post('/api/action/clear-history', (req, res) => {
  aiService.clearHistory();
  waClient.addLog('info', 'Memoria de conversaciones limpiada por el usuario.');
  res.json({ success: true });
});

// API: Añadir número a la lista negra
app.post('/api/action/blacklist/add', (req, res) => {
  const { number } = req.body;
  if (!number) return res.status(400).json({ success: false, error: 'Número requerido' });
  const added = config.addToBlacklist(number);
  waClient.addLog('info', `Número +${number} añadido a la lista de ignorados.`);
  waClient.notifyListeners();
  res.json({ success: true, added });
});

// API: Eliminar número de la lista negra
app.post('/api/action/blacklist/remove', (req, res) => {
  const { number } = req.body;
  if (!number) return res.status(400).json({ success: false, error: 'Número requerido' });
  const removed = config.removeFromBlacklist(number);
  waClient.addLog('info', `Número +${number} removido de la lista de ignorados.`);
  waClient.notifyListeners();
  res.json({ success: true, removed });
});

// API: Endpoint de ping para mantener activo el servidor en Render u otros hosts gratuitos
app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

// API: Server-Sent Events (SSE) para actualizaciones en vivo del QR y estado
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Enviar estado inicial
  res.write(`data: ${JSON.stringify(waClient.getStatus())}\n\n`);

  const unsubscribe = waClient.onStateChange((status) => {
    res.write(`data: ${JSON.stringify(status)}\n\n`);
  });

  req.on('close', () => {
    unsubscribe();
  });
});

// Iniciar servidor web y cliente de WhatsApp
app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 SERVIDOR ACTIVO EN: http://localhost:${PORT}`);
  console.log(`👉 Abre la URL en tu navegador para ver el QR y Panel`);
  console.log(`======================================================\n`);

  // Iniciar cliente de WhatsApp
  waClient.start();

  // Auto-ping para mantener el servidor activo en Render (planes gratuitos)
  let APP_URL = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL;
  if (APP_URL) {
    if (APP_URL.endsWith('/')) {
      APP_URL = APP_URL.slice(0, -1);
    }
    console.log(`[Self-Ping] Activado para: ${APP_URL}`);
    const pingServer = async () => {
      try {
        const response = await fetch(`${APP_URL}/ping`);
        console.log(`[Self-Ping] Ping exitoso a ${APP_URL}/ping: ${response.status} ${response.statusText}`);
      } catch (err) {
        console.error(`[Self-Ping] Error en ping a ${APP_URL}/ping:`, err.message);
      }
    };
    // Primer ping a los 30 segundos
    setTimeout(pingServer, 30000);
    // Ping periódico cada 10 minutos (600000 ms)
    setInterval(pingServer, 10 * 60 * 1000);
  } else {
    console.log('[Self-Ping] No configurado. (Establece RENDER_EXTERNAL_URL o APP_URL si estás en Render o similar).');
  }
});
