import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from './config.js';

class AIService {
  constructor() {
    this.histories = new Map(); // jid -> array of { role, parts: [{ text }] }
    this.historyTimestamps = new Map(); // jid -> last active timestamp
    this.cleanupInterval = 1000 * 60 * 30; // 30 minutos
    this.historyExpiration = 1000 * 60 * 60 * 4; // 4 horas

    setInterval(() => this.cleanOldHistories(), this.cleanupInterval);
  }

  cleanOldHistories() {
    const now = Date.now();
    for (const [jid, timestamp] of this.historyTimestamps.entries()) {
      if (now - timestamp > this.historyExpiration) {
        this.histories.delete(jid);
        this.historyTimestamps.delete(jid);
      }
    }
  }

  clearHistory(jid) {
    if (jid) {
      this.histories.delete(jid);
      this.historyTimestamps.delete(jid);
    } else {
      this.histories.clear();
      this.historyTimestamps.clear();
    }
  }

  getHistory(jid) {
    if (!this.histories.has(jid)) {
      this.histories.set(jid, []);
    }
    this.historyTimestamps.set(jid, Date.now());
    return this.histories.get(jid);
  }

  buildSystemPrompt(mode, contactName) {
    const ownerName = config.get('ownerName') || 'el titular';
    const assistantName = config.get('assistantName') || 'Asistente';
    const custom = config.get('customInstructions') || '';

    if (mode === 'clon') {
      return `Eres ${ownerName}. Estás respondiendo mensajes en tu WhatsApp personal.
REGLAS ESTRICTAS DE RESPUESTA:
1. Respuestas MUY CORTAS (1 a 2 frases breves, máximo 30 palabras), tal como se escribe en WhatsApp.
2. Tono informal, amigable, natural y humano. 
3. PROHIBIDO hablar como un bot de atención al cliente (NUNCA digas "¿En qué puedo ayudarte?", "Soy una IA", "Estimado cliente").
4. Pocos o ningún emoji (máximo 1 solo si encaja de forma muy natural).
5. Si te preguntan algo muy específico o compromisos que no sabes con certeza, di de forma casual que estás algo ocupado en este momento y que más tardecito le escribes con calma.
6. El contacto que te escribe se llama: "${contactName || 'Amigo'}".
${custom ? `INSTRUCCIONES ADICIONALES DEL DUEÑO: ${custom}` : ''}`;
    }

    // Modo Secretario
    return `Eres ${assistantName}, el/la secretario(a) y asistente virtual de ${ownerName}.
${ownerName} en este momento NO puede responder personalmente porque está ocupado(a).
REGLAS ESTRICTAS DE RESPUESTA:
1. Sé educado(a), amable, conciso(a) y profesional.
2. Respuestas breves (máximo 2 a 3 oraciones).
3. Informa amablemente que ${ownerName} no se encuentra disponible ahora mismo y pregunta en qué puedes ayudarle o si desea dejarle un recado/mensaje importante.
4. Si la persona ya te da su mensaje o recado, agradécele y confírmale que ya lo anotaste y se lo harás llegar a ${ownerName} en cuanto se desocupe.
5. Puedes usar algún emoji amable (como 📋, ✨, 👍) pero sin exagerar.
6. El contacto que te escribe se llama: "${contactName || 'un contacto'}".
${custom ? `INSTRUCCIONES ADICIONALES DEL DUEÑO: ${custom}` : ''}

IMPORTANTE: Si el usuario te deja un recado claro o algo importante para ${ownerName}, añade al final de tu respuesta EXACTAMENTE esta etiqueta oculta con el resumen (no alteres el formato):
[[RECADO: resumen breve de lo que necesita o dejó dicho]]`;
  }

  async generateResponse(jid, contactName, incomingMessage) {
    const mode = config.get('mode') || 'secretario';
    const provider = config.get('provider') || 'gemini';
    const systemPrompt = this.buildSystemPrompt(mode, contactName);
    const history = this.getHistory(jid);

    // Guardar mensaje entrante del usuario
    history.push({ role: 'user', parts: [{ text: incomingMessage }] });

    // Mantener sólo los últimos 10 intercambios (20 mensajes)
    if (history.length > 20) {
      history.splice(0, history.length - 20);
    }

    try {
      let rawResponse = '';

      if (provider === 'gemini') {
        rawResponse = await this.callGemini(systemPrompt, history);
      } else if (provider === 'openrouter') {
        rawResponse = await this.callOpenRouter(systemPrompt, history);
      } else {
        throw new Error(`Proveedor desconocido: ${provider}`);
      }

      // Procesar si hay recado detectado
      let hasRecado = false;
      let recadoText = '';
      const recadoMatch = rawResponse.match(/\[\[RECADO:\s*([\s\S]*?)\]\]/);

      if (recadoMatch) {
        hasRecado = true;
        recadoText = recadoMatch[1].trim();
        // Quitar la etiqueta del mensaje final que se enviará al contacto
        rawResponse = rawResponse.replace(/\[\[RECADO:\s*[\s\S]*?\]\]/, '').trim();
      }

      // Guardar respuesta del bot en el historial
      history.push({ role: 'model', parts: [{ text: rawResponse }] });

      return {
        replyText: rawResponse,
        hasRecado,
        recadoText,
        mode
      };
    } catch (error) {
      console.error(`[AI Error] Error generando respuesta para ${jid}:`, error.message);
      // Quitar el último mensaje del historial si falló
      history.pop();
      return null;
    }
  }

  async callGemini(systemPrompt, history) {
    const apiKey = config.get('geminiApiKey') || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY no configurada. Añádela en tu archivo .env o en settings.json.');
    }

    const modelName = config.get('geminiModel') || 'gemini-2.0-flash';
    const genAI = new GoogleGenerativeAI(apiKey);

    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: systemPrompt
    });

    // Formatear historial para el SDK de Gemini
    // El historial contiene todos los mensajes excepto el último (que enviamos con sendMessage)
    const contents = history.slice(0, -1).map(item => ({
      role: item.role === 'model' ? 'model' : 'user',
      parts: item.parts
    }));

    const lastMessage = history[history.length - 1].parts[0].text;

    const chat = model.startChat({
      history: contents,
      generationConfig: {
        maxOutputTokens: 250,
        temperature: 0.7
      }
    });

    const result = await chat.sendMessage(lastMessage);
    return result.response.text().trim();
  }

  async callOpenRouter(systemPrompt, history) {
    const apiKey = config.get('openRouterApiKey') || process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY no configurada.');
    }

    const modelName = config.get('openRouterModel') || 'google/gemini-2.0-flash-exp:free';

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map(item => ({
        role: item.role === 'model' ? 'assistant' : 'user',
        content: item.parts[0].text
      }))
    ];

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/secretario-whatsapp',
        'X-Title': 'WhatsApp AI Secretary'
      },
      body: JSON.stringify({
        model: modelName,
        messages: messages,
        max_tokens: 250,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenRouter API error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || '';
  }
}

export const aiService = new AIService();
