let currentSettings = {};

async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    updateUI(data);
  } catch (err) {
    console.error('Error cargando estado:', err);
  }
}

function updateUI(data) {
  const { connectionState, connectedUser, qrCodeDataUrl, settings, logs } = data;
  currentSettings = settings || {};

  // Status Badge
  const statusBadge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');
  const phoneBadge = document.getElementById('phoneBadge');
  const qrContainer = document.getElementById('qrContainer');
  const qrBox = document.getElementById('qrBox');
  const connectedBox = document.getElementById('connectedBox');

  statusBadge.className = 'status-badge';

  if (connectionState === 'connected') {
    statusBadge.classList.add('connected');
    statusText.textContent = '🟢 Conectado';
    phoneBadge.textContent = `+${connectedUser?.phone || ''}`;
    phoneBadge.style.color = '#10b981';

    qrBox.style.display = 'none';
    connectedBox.style.display = 'flex';
    document.getElementById('connectedPhone').textContent = `+${connectedUser?.phone || ''}`;
    document.getElementById('connectedName').textContent = connectedUser?.name || 'WhatsApp Conectado';
  } else if (connectionState === 'qr') {
    statusText.textContent = '🟡 Esperando Escaneo de QR';
    phoneBadge.textContent = 'Escanea el QR';
    phoneBadge.style.color = '#eab308';

    connectedBox.style.display = 'none';
    qrBox.style.display = 'block';

    if (qrCodeDataUrl) {
      qrBox.innerHTML = `
        <img src="${qrCodeDataUrl}" alt="Código QR WhatsApp" />
        <p style="margin-top: 10px; font-size: 0.82rem; color: #9ca3af;">Actualizándose automáticamente...</p>
      `;
    }
  } else {
    statusBadge.classList.add('disconnected');
    statusText.textContent = '🔴 Desconectado';
    phoneBadge.textContent = 'Desconectado';
    phoneBadge.style.color = '#ef4444';

    connectedBox.style.display = 'none';
    qrBox.style.display = 'block';
    qrBox.innerHTML = `
      <div class="qr-spinner"></div>
      <p>Iniciando conexión con WhatsApp...</p>
    `;
  }

  // Form inputs
  document.getElementById('enabledToggle').checked = !!settings?.enabled;
  document.getElementById('assistantNameInput').value = settings?.assistantName || '';
  document.getElementById('ownerNameInput').value = settings?.ownerName || '';
  document.getElementById('customInstructionsInput').value = settings?.customInstructions || '';
  if (settings?.geminiApiKey && !document.getElementById('geminiApiKeyInput').value) {
    document.getElementById('geminiApiKeyInput').value = settings.geminiApiKey;
  }

  // Mode buttons
  setModeVisual(settings?.mode || 'secretario');

  // Logs
  renderLogs(logs || []);
}

function setModeVisual(mode) {
  const btnSecretario = document.getElementById('btnModeSecretario');
  const btnClon = document.getElementById('btnModeClon');

  if (mode === 'clon') {
    btnClon.classList.add('active');
    btnSecretario.classList.remove('active');
  } else {
    btnSecretario.classList.add('active');
    btnClon.classList.remove('active');
  }
}

async function setMode(mode) {
  setModeVisual(mode);
  try {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode })
    });
  } catch (err) {
    console.error('Error cambiando modo:', err);
  }
}

// Master Toggle
document.getElementById('enabledToggle').addEventListener('change', async (e) => {
  const enabled = e.target.checked;
  try {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    });
  } catch (err) {
    console.error('Error guardando toggle:', err);
  }
});

async function saveSettingsForm() {
  const assistantName = document.getElementById('assistantNameInput').value.trim();
  const ownerName = document.getElementById('ownerNameInput').value.trim();
  const geminiApiKey = document.getElementById('geminiApiKeyInput').value.trim();
  const customInstructions = document.getElementById('customInstructionsInput').value.trim();

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assistantName,
        ownerName,
        geminiApiKey,
        customInstructions
      })
    });
    if (res.ok) {
      alert('✅ ¡Configuración guardada exitosamente!');
    }
  } catch (err) {
    alert('Error al guardar configuración: ' + err.message);
  }
}

function toggleApiKeyVisibility() {
  const input = document.getElementById('geminiApiKeyInput');
  input.type = input.type === 'password' ? 'text' : 'password';
}

function renderLogs(logs) {
  const consoleEl = document.getElementById('logConsole');
  if (!logs || logs.length === 0) return;

  consoleEl.innerHTML = logs.map(log => {
    const time = new Date(log.timestamp).toLocaleTimeString();
    return `<div class="log-entry log-${log.type}">[${time}] ${escapeHtml(log.message)}</div>`;
  }).join('');
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

async function clearMemory() {
  if (confirm('¿Deseas borrar la memoria reciente de conversaciones de la IA?')) {
    await fetch('/api/action/clear-history', { method: 'POST' });
    alert('Memoria limpiada.');
  }
}

// Server Sent Events (SSE) for Real-Time Updates
function initSSE() {
  const eventSource = new EventSource('/api/events');
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      updateUI(data);
    } catch (err) {
      console.error('Error parseando SSE:', err);
    }
  };
  eventSource.onerror = () => {
    eventSource.close();
    setTimeout(initSSE, 4000);
  };
}

// Initial fetch & start SSE
fetchStatus();
initSSE();
