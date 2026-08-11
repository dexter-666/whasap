import { config } from './config.js';
import { aiService } from './ai_service.js';

export async function handleCommand(sock, senderJid, text) {
  const cleanText = text.trim();
  if (!cleanText.startsWith('.')) return false;

  const parts = cleanText.slice(1).trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const arg = parts.slice(1).join(' ').trim();

  let responseMessage = '';

  switch (cmd) {
    case 'ayuda':
    case 'help':
    case 'comandos':
    case 'menu':
      responseMessage = `🤖 *PANEL DE CONTROL DEL SECRETARIO/A* 🤖

*Control General:*
• *.on* / *.activar* → Enciende el asistente.
• *.off* / *.desactivar* → Apaga el asistente.
• *.estado* / *.status* → Ver configuración actual.

*Modos de Operación:*
• *.modo clon* → Respuestas cortas e informales como tú.
• *.modo secretario* → Respuestas formales y toma de recados.

*Personalización:*
• *.nombre [Nombre]* → Cambia el nombre del asistente (ej: *.nombre Lucía*).
• *.yo [Tu Nombre]* → Cambia tu nombre (ej: *.yo Carlos*).
• *.prompt [Texto]* → Instrucciones personalizadas para la IA.
• *.limpiarprompt* → Borra las instrucciones personalizadas.
• *.delay [segundos]* → Tiempo de simulación "escribiendo..." (ej: *.delay 4*).

*Filtros y Privacidad:*
• *.ignorar [número]* → No responder a este número (ej: *.ignorar 51987654321*).
• *.permitir [número]* → Quitar de la lista de ignorados.
• *.bloqueados* → Ver lista de números ignorados.
• *.limpiar* → Borra la memoria temporal de las conversaciones.

*Motor de IA:*
• *.modelo [gemini/openrouter]* → Cambia el proveedor de IA.`;
      break;

    case 'on':
    case 'activar':
      config.set('enabled', true);
      responseMessage = `🟢 *Asistente ACTIVADO*\n\nModo actual: *${config.get('mode').toUpperCase()}*\nEl bot responderá a los mensajes entrantes según la configuración establecida.`;
      break;

    case 'off':
    case 'desactivar':
      config.set('enabled', false);
      responseMessage = `🔴 *Asistente DESACTIVADO*\n\nEl bot ya no responderá a ningún mensaje entrante hasta que envíes *.on* nuevamente.`;
      break;

    case 'modo':
      if (arg.toLowerCase() === 'clon') {
        config.set('mode', 'clon');
        responseMessage = `🎭 *Modo cambiado a: CLON CONVERSACIONAL*\n\nAhora el bot responderá con mensajes breves, informales y amigables, simulando que eres tú.`;
      } else if (arg.toLowerCase() === 'secretario' || arg.toLowerCase() === 'secretaria' || arg.toLowerCase() === 'asistente') {
        config.set('mode', 'secretario');
        responseMessage = `👔 *Modo cambiado a: SECRETARIO / ASISTENTE*\n\nAhora el bot se presentará como tu asistente (${config.get('assistantName')}), atenderá formalmente y tomará recados para ti.`;
      } else {
        responseMessage = `⚠️ Modo no reconocido. Usa:\n• *.modo clon*\n• *.modo secretario*`;
      }
      break;

    case 'nombre':
      if (!arg) {
        responseMessage = `⚠️ Debes indicar un nombre. Ej: *.nombre Lucía*`;
      } else {
        config.set('assistantName', arg);
        responseMessage = `✅ Nombre del asistente actualizado a: *${arg}*`;
      }
      break;

    case 'yo':
    case 'dueno':
    case 'titular':
      if (!arg) {
        responseMessage = `⚠️ Debes indicar tu nombre. Ej: *.yo Alex*`;
      } else {
        config.set('ownerName', arg);
        responseMessage = `✅ Tu nombre ha sido configurado como: *${arg}*`;
      }
      break;

    case 'status':
    case 'estado':
      const isEnabled = config.get('enabled');
      const mode = config.get('mode');
      const assistantName = config.get('assistantName');
      const ownerName = config.get('ownerName');
      const provider = config.get('provider');
      const blacklistCount = config.get('blacklist').length;
      const delay = config.get('typingDelaySeconds');
      const customInst = config.get('customInstructions');

      responseMessage = `📊 *ESTADO DEL ASISTENTE:*
━━━━━━━━━━━━━━━━━━━━
• *Estado:* ${isEnabled ? '🟢 ACTIVO' : '🔴 PAUSADO'}
• *Modo:* ${mode === 'clon' ? '🎭 Clon Conversacional' : '👔 Secretario / Asistente'}
• *Asistente:* ${assistantName}
• *Titular (Tú):* ${ownerName}
• *Motor IA:* ${provider.toUpperCase()}
• *Retardo de tipeo:* ${delay} seg
• *Contactos ignorados:* ${blacklistCount}
${customInst ? `• *Instrucciones extra:* "${customInst}"` : '• *Instrucciones extra:* Ninguna'}
━━━━━━━━━━━━━━━━━━━━
💡 _Usa *.ayuda* para ver la lista de comandos disponibles._`;
      break;

    case 'ignorar':
    case 'bloquear':
      if (!arg) {
        responseMessage = `⚠️ Ingresa el número a ignorar (con código de país, sin espacios ni signos). Ej: *.ignorar 51987654321*`;
      } else {
        const added = config.addToBlacklist(arg);
        responseMessage = added
          ? `🚫 Número *${arg}* añadido a la lista negra. El bot no le responderá.`
          : `ℹ️ El número *${arg}* ya estaba en la lista negra.`;
      }
      break;

    case 'permitir':
    case 'desbloquear':
      if (!arg) {
        responseMessage = `⚠️ Ingresa el número a desbloquear. Ej: *.permitir 51987654321*`;
      } else {
        const removed = config.removeFromBlacklist(arg);
        responseMessage = removed
          ? `✅ Número *${arg}* eliminado de la lista negra. Ahora podrá recibir respuestas.`
          : `ℹ️ El número *${arg}* no estaba en la lista negra.`;
      }
      break;

    case 'bloqueados':
    case 'blacklist':
      const list = config.get('blacklist');
      if (list.length === 0) {
        responseMessage = `📋 No hay números en la lista negra actualmente.`;
      } else {
        responseMessage = `🚫 *NÚMEROS EN LISTA NEGRA:* \n\n` + list.map((n, i) => `${i + 1}. +${n}`).join('\n');
      }
      break;

    case 'prompt':
      if (!arg) {
        responseMessage = `⚠️ Ingresa el texto de instrucción. Ej: *.prompt Siempre menciona que estoy en una reunión de negocios.*`;
      } else {
        config.set('customInstructions', arg);
        responseMessage = `✅ Instrucciones de la IA actualizadas:\n\n_"${arg}"_`;
      }
      break;

    case 'limpiarprompt':
      config.set('customInstructions', '');
      responseMessage = `🧹 Se han eliminado las instrucciones personalizadas.`;
      break;

    case 'delay':
      const numDelay = parseInt(arg, 10);
      if (isNaN(numDelay) || numDelay < 1 || numDelay > 20) {
        responseMessage = `⚠️ Ingresa un número de segundos válido entre 1 y 20. Ej: *.delay 4*`;
      } else {
        config.set('typingDelaySeconds', numDelay);
        responseMessage = `⏱️ Retardo de tipeo configurado en: *${numDelay} segundos*.`;
      }
      break;

    case 'limpiar':
    case 'reset':
      aiService.clearHistory();
      responseMessage = `🧹 Se ha limpiado la memoria de conversaciones recientes con todos los contactos.`;
      break;

    case 'modelo':
      const targetProvider = arg.toLowerCase();
      if (targetProvider === 'gemini' || targetProvider === 'openrouter') {
        config.set('provider', targetProvider);
        responseMessage = `⚡ Proveedor de IA cambiado a: *${targetProvider.toUpperCase()}*`;
      } else {
        responseMessage = `⚠️ Proveedor inválido. Opciones disponibles:\n• *.modelo gemini*\n• *.modelo openrouter*`;
      }
      break;

    default:
      responseMessage = `❓ Comando *.${cmd}* no reconocido. Escribe *.ayuda* para ver los comandos válidos.`;
      break;
  }

  // Enviar la respuesta directamente al chat del usuario
  try {
    await sock.sendMessage(senderJid, { text: responseMessage });
    return true;
  } catch (err) {
    console.error('Error enviando respuesta de comando:', err.message);
    return false;
  }
}
