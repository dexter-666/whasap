import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  jidNormalizedUser
} from '@whiskeysockets/baileys';
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import pino from 'pino';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { handleCommand } from './command_handler.js';
import { aiService } from './ai_service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUTH_FOLDER = path.join(__dirname, 'auth_session');

const cleanPhone = (jid) => {
  if (!jid || typeof jid !== 'string') return null;
  return jid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
};

class WhatsAppClient {
  constructor() {
    this.sock = null;
    this.qrCodeRaw = null;
    this.qrCodeDataUrl = null;
    this.connectionState = 'disconnected'; // 'connecting', 'qr', 'connected', 'disconnected'
    this.connectedUser = null;
    this.activityLogs = [];
    this.listeners = new Set();
    this.reconnectAttempts = 0;
    this.messageQueues = new Map(); // jid -> { timeoutId, messages: [{ text, msg }] }
  }

  getPhoneFromJid(jid) {
    if (!jid) return null;
    const clean = (id) => id.split('@')[0].split(':')[0];
    
    if (jid.endsWith('@s.whatsapp.net')) {
      return clean(jid);
    }
    
    if (jid.endsWith('@lid')) {
      const contacts = this.sock?.contacts || {};
      for (const cJid of Object.keys(contacts)) {
        const contact = contacts[cJid];
        if (contact.lid === jid && contact.id) {
          return clean(contact.id);
        }
      }
    }
    
    return null;
  }

  onStateChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notifyListeners() {
    for (const listener of this.listeners) {
      try {
        listener(this.getStatus());
      } catch (err) {
        console.error('Error notificando a listener:', err.message);
      }
    }
  }

  addLog(type, message, details = {}) {
    const entry = {
      id: Date.now() + Math.random().toString(36).substr(2, 4),
      timestamp: new Date().toISOString(),
      type, // 'info', 'message', 'command', 'recado', 'error'
      message,
      details
    };
    this.activityLogs.unshift(entry);
    if (this.activityLogs.length > 100) {
      this.activityLogs.pop();
    }
    this.notifyListeners();
  }

  getStatus() {
    return {
      connectionState: this.connectionState,
      connectedUser: this.connectedUser,
      qrCodeDataUrl: this.qrCodeDataUrl,
      settings: config.settings,
      logs: this.activityLogs.slice(0, 30)
    };
  }

  async start() {
    try {
      console.log('🚀 Iniciando cliente de WhatsApp...');
      this.connectionState = 'connecting';
      this.notifyListeners();

      const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
      const { version } = await fetchLatestBaileysVersion();

      const logger = pino({ level: 'silent' });

      this.sock = makeWASocket({
        version,
        logger,
        auth: state,
        printQRInTerminal: false,
        browser: ['Secretario 24/7', 'Chrome', '1.0.0'],
        generateHighQualityLinkPreview: true,
        markOnlineOnConnect: true,
        syncFullHistory: false
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.qrCodeRaw = qr;
          this.qrCodeDataUrl = await QRCode.toDataURL(qr);
          this.connectionState = 'qr';
          console.log('\n📲 NUEVO CÓDIGO QR GENERADO: Escanéalo en WhatsApp');
          qrcodeTerminal.generate(qr, { small: true });
          this.notifyListeners();
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error)?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
          
          this.connectionState = 'disconnected';
          this.connectedUser = null;
          this.qrCodeDataUrl = null;
          this.addLog('info', `Conexión cerrada (${statusCode || 'desconocido'}). Reconectando: ${shouldReconnect}`);
          this.notifyListeners();

          if (shouldReconnect) {
            this.reconnectAttempts++;
            const delay = Math.min(this.reconnectAttempts * 3000, 20000);
            console.log(`Reintentando conexión en ${delay / 1000} segundos...`);
            setTimeout(() => this.start(), delay);
          } else {
            console.log('❌ Sesión cerrada por el usuario. Elimina la carpeta auth_session y vuelve a escanear el QR.');
          }
        } else if (connection === 'open') {
          this.reconnectAttempts = 0;
          this.connectionState = 'connected';
          this.qrCodeRaw = null;
          this.qrCodeDataUrl = null;

          const userJid = this.sock.user?.id ? jidNormalizedUser(this.sock.user.id) : 'Desconocido';
          const userPhone = userJid.split('@')[0];
          this.connectedUser = {
            jid: userJid,
            phone: userPhone,
            name: this.sock.user?.name || 'Titular'
          };

          console.log(`\n✅ ¡WhatsApp Conectado exitosamente!`);
          console.log(`📱 Número: +${userPhone}`);
          console.log(`🤖 Estado del Bot: ${config.get('enabled') ? '🟢 ACTIVO' : '🔴 PAUSADO'}`);
          console.log(`💡 Envía ".ayuda" a tu propio chat de WhatsApp para ver los comandos.\n`);

          this.addLog('info', `Conectado como +${userPhone}`);
          this.notifyListeners();
        }
      });

      this.sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify') return;
        for (const msg of m.messages) {
          await this.processIncomingMessage(msg);
        }
      });

    } catch (error) {
      console.error('Error al inicializar WhatsApp:', error);
      this.connectionState = 'disconnected';
      this.notifyListeners();
      setTimeout(() => this.start(), 10000);
    }
  }

  async processIncomingMessage(msg) {
    try {
      if (!msg.message) return;

      const remoteJid = msg.key.remoteJid;
      if (!remoteJid) return;

      // Filtrar estados de WhatsApp
      if (remoteJid === 'status@broadcast' || remoteJid.includes('broadcast')) {
        return;
      }

      // Filtrar grupos si está configurado
      if (remoteJid.endsWith('@g.us') && config.get('ignoreGroups')) {
        return;
      }

      // Extraer texto del mensaje
      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        msg.message.videoMessage?.caption ||
        '';

      if (!text || typeof text !== 'string') return;

      const userJidRaw = this.sock.user?.id || this.sock.authState?.creds?.me?.id;
      const ownJid = userJidRaw ? jidNormalizedUser(userJidRaw) : null;
      const ownLidRaw = this.sock.user?.lid || this.sock.authState?.creds?.me?.lid;
      const ownLid = ownLidRaw ? jidNormalizedUser(ownLidRaw) : null;
      const isFromMe = msg.key.fromMe;
      const normalizedRemoteJid = jidNormalizedUser(remoteJid);
      
      const ownPhone = cleanPhone(ownJid);
      const remotePhone = cleanPhone(normalizedRemoteJid);
      const isSelfChat = (ownPhone && remotePhone && ownPhone === remotePhone) ||
                         (ownLid && normalizedRemoteJid === ownLid) ||
                         (ownJid && normalizedRemoteJid === ownJid);

      console.log(`[DEBUG] processIncomingMessage: remoteJid=${remoteJid}, isFromMe=${isFromMe}, ownPhone=${ownPhone}, remotePhone=${remotePhone}, ownLid=${ownLid}, isSelfChat=${isSelfChat}, textStartsWithDot=${text.trim().startsWith('.')}`);

      // 1. Manejo de comandos desde tu propio chat
      if (isSelfChat) {
        if (text.trim().startsWith('.')) {
          this.addLog('command', `Comando recibido en chat propio: ${text.trim()}`);
          await handleCommand(this.sock, normalizedRemoteJid, text);
        }
        return;
      }

      // 2. Si el mensaje fue enviado por ti hacia otra persona, no responder
      if (isFromMe) return;

      // 3. Verificar si el bot está activado globalmente
      if (!config.get('enabled')) {
        return;
      }

      // 4. Verificar Lista Negra (Blacklist)
      const senderPhone = remoteJid.split('@')[0];
      const realPhone = this.getPhoneFromJid(remoteJid);
      if (config.isBlacklisted(senderPhone) || (realPhone && config.isBlacklisted(realPhone))) {
        console.log(`[Blacklist] Mensaje ignorado de: ${senderPhone} (real: ${realPhone})`);
        return;
      }

      // 5. Cooldown / Acumulador de mensajes (Debouncer)
      // Si el contacto envía varios mensajes seguidos, los agrupamos y enviamos un solo prompt
      if (!this.messageQueues.has(remoteJid)) {
        this.messageQueues.set(remoteJid, {
          timeoutId: null,
          messages: []
        });
      }

      const queue = this.messageQueues.get(remoteJid);
      queue.messages.push({ text, msg });

      // Cancelar el temporizador anterior
      if (queue.timeoutId) {
        clearTimeout(queue.timeoutId);
      }

      // Esperar 4.5 segundos para agrupar mensajes
      queue.timeoutId = setTimeout(async () => {
        try {
          const currentQueue = this.messageQueues.get(remoteJid);
          if (!currentQueue || currentQueue.messages.length === 0) return;

          const messagesToProcess = [...currentQueue.messages];
          this.messageQueues.delete(remoteJid); // Limpiar la cola

          // Combinar todos los textos recibidos en este lapso
          const combinedText = messagesToProcess.map(m => m.text).join('\n');
          const lastMsg = messagesToProcess[messagesToProcess.length - 1].msg;
          const contactPushName = lastMsg.pushName || 'Amigo';

          this.addLog('message', `Procesando mensajes agrupados de ${contactPushName} (+${senderPhone}): "${combinedText.slice(0, 80)}..." (${messagesToProcess.length} msgs)`, {
            recipient: senderPhone
          });

          // 6. Simular escritura humana
          if (config.get('simulateTyping')) {
            await this.sock.sendPresenceUpdate('composing', remoteJid);
            const delaySeconds = config.get('typingDelaySeconds') || 3;
            const actualDelay = Math.max(1000, (delaySeconds * 1000) + (Math.random() * 1500 - 500));
            await new Promise(r => setTimeout(r, actualDelay));
          }

          // Determinar si es un contacto guardado (agregado)
          const realPhone = this.getPhoneFromJid(remoteJid);
          const realPhoneJid = realPhone ? `${realPhone}@s.whatsapp.net` : null;
          const contactInfo = (this.sock?.contacts?.[remoteJid]) || 
                              (realPhoneJid && this.sock?.contacts?.[realPhoneJid]);
          const isSavedContact = !!(contactInfo && contactInfo.name);

          console.log(`[DEBUG] generateResponse: remoteJid=${remoteJid}, isSavedContact=${isSavedContact}`);

          // 7. Generar respuesta con IA
          const aiResult = await aiService.generateResponse(remoteJid, contactPushName, combinedText, isSavedContact);

          if (aiResult && aiResult.replyText) {
            // Enviar respuesta citando el último mensaje
            await this.sock.sendMessage(remoteJid, { text: aiResult.replyText }, { quoted: lastMsg });
            await this.sock.sendPresenceUpdate('paused', remoteJid);

            this.addLog('message', `Respuesta enviada a ${contactPushName}: "${aiResult.replyText}"`, {
              mode: aiResult.mode,
              recipient: senderPhone
            });

            // 8. Notificar recado al titular si está activo
            if (aiResult.hasRecado && config.get('notifyOwnerOnRecado') && ownJid) {
              const recadoAlert = `📋 *NUEVO RECADO RECIBIDO* 📋
━━━━━━━━━━━━━━━━━━━━
👤 *Contacto:* ${contactPushName} (+${senderPhone})
📝 *Recado:* ${aiResult.recadoText}
💬 *Mensaje combinado:* "${combinedText}"
⏰ *Hora:* ${new Date().toLocaleTimeString()}
━━━━━━━━━━━━━━━━━━━━`;

              await this.sock.sendMessage(ownJid, { text: recadoAlert });
              this.addLog('recado', `Recado guardado de ${contactPushName}: ${aiResult.recadoText}`);
            }
          }
        } catch (err) {
          console.error('Error procesando cola de mensajes:', err);
          this.addLog('error', `Error procesando mensaje: ${err.message}`);
        }
      }, 4500);
    } catch (err) {
      console.error('Error general in processIncomingMessage:', err);
    }
  }
}

export const waClient = new WhatsAppClient();
