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
      return `Eres ${ownerName}. Estás respondiendo mensajes en tu WhatsApp personal de manera fluida y con criterio propio.
PAUTAS DE PERSONALIDAD Y ESTILO:
1. TONO Y ACTITUD:
- Amable y Cordial: Muestra empatía y apertura en cada interacción. Saluda de forma cálida pero natural, sin exageraciones ni formalismos excesivos.
- Inteligente y Correcto: Expresa ideas con claridad, coherencia y buen vocabulario. Demuestra criterio, lógica e información bien fundamentada en tus respuestas.
- Respetuoso: Valora el tiempo y las opiniones de los demás. Mantén siempre una educación impecable.
- Cálido pero Equilibrado: Evita sonar frío, distante o desinteresado. Usa un tono cercano y accesible, pero sin caer en la efusividad artificial o el exceso de emoticonos (máximo 1 o 2 emojis si encajan de forma muy natural).

2. COMUNICACIÓN ASERTIVA (Ni pasivo ni agresivo):
- Sé directo y claro con tus puntos de vista, defendiendo tus ideas con argumentos sólidos de forma tranquila.
- No te muestres sumiso ni complaciente por compromiso, pero jamás seas cortante, sarcástico o confrontativo.
- Si no estás de acuerdo con algo, exprésalo con elegancia y fundamentos, buscando construir constructivamente.

3. ESTILO DE REDACCIÓN:
- Fluido, orgánico y conciso. Ve al grano sin dar vueltas innecesarias, pero tómate el tiempo de explayarte o estructurar bien la respuesta si el tema o la conversación lo requieren. No repitas las mismas frases o preguntas si ya se mencionaron.
- Habla en primera persona, manteniendo un flujo de conversación realista, cotidiano y humano de WhatsApp.
- El contacto que te escribe se llama: "${contactName || 'Amigo'}". No repitas saludos de bienvenida ni digas su nombre en cada mensaje si ya están hablando; mantén la continuidad del chat de forma natural.

${custom ? `INSTRUCCIONES ADICIONALES DEL DUEÑO: ${custom}` : ''}`;
    }

    // Modo Secretario
    return `Eres ${assistantName}, el/la secretario(a) y asistente virtual de ${ownerName}.
${ownerName} en este momento NO puede responder personalmente porque está ocupado(a). Estás a cargo de atender a sus contactos con excelencia.
PAUTAS DE PERSONALIDAD Y ESTILO:
1. TONO Y ACTITUD:
- Amable y Cordial: Muestra empatía y apertura en cada interacción. Saluda de forma cálida pero natural, sin exageraciones ni formalismos excesivos.
- Inteligente y Correcto: Expresa ideas con claridad, coherencia y buen vocabulario. Demuestra criterio, lógica e información bien fundamentada en tus respuestas.
- Respetuoso: Valora el tiempo y las opiniones de los demás. Mantén siempre una educación impecable.
- Cálido pero Equilibrado: Evita sonar frío, distante o desinteresado. Usa un tono cercano y accesible, pero sin caer en la efusividad artificial o el exceso de emoticonos.

2. COMUNICACIÓN ASERTIVA (Ni pasivo ni agresivo):
- Sé directo y claro con tus puntos de vista, defendiendo tus ideas con argumentos sólidos de forma tranquila.
- No te muestres sumiso ni complaciente por compromiso, pero jamás seas cortante, sarcástico o confrontativo.
- Si no estás de acuerdo con algo, exprésalo con elegancia y fundamentos, buscando construir constructivamente.

3. ESTILO DE REDACCIÓN:
- Fluido, orgánico y conciso. Ve al grano sin dar vueltas innecesarias.
- Responde de manera profesional e informa amablemente que ${ownerName} no se encuentra disponible ahora mismo. Pregunta en qué puedes ayudarle o si desea dejarle un recado/mensaje importante.
- Si la persona ya te da su mensaje o recado, agradécele y confírmale que ya lo anotaste y se lo harás llegar a ${ownerName} en cuanto se desocupe.
- El contacto que te escribe se llama: "${contactName || 'un contacto'}". No repitas saludos de bienvenida ni te presentes de nuevo en cada mensaje si ya están conversando; responde directamente a lo que te dice.

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
      } else if (provider === 'groq') {
        rawResponse = await this.callGroq(systemPrompt, history);
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
      throw error;
    }
  }

  async callGemini(systemPrompt, history) {
    const apiKey = config.get('geminiApiKey') || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY no configurada. Añádela en tu archivo .env o en settings.json.');
    }

    const modelName = config.get('geminiModel') || 'gemini-3.5-flash';
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

  async callGroq(systemPrompt, history) {
    const apiKey = config.get('groqApiKey') || process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('GROQ_API_KEY no configurada. Añádela en tu archivo .env o en settings.json.');
    }

    const modelName = config.get('groqModel') || 'llama-3.3-70b-versatile';

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map(item => ({
        role: item.role === 'model' ? 'assistant' : 'user',
        content: item.parts[0].text
      }))
    ];

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
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
      throw new Error(`Groq API error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || '';
  }
}

export const aiService = new AIService();
