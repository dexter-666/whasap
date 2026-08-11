import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SETTINGS_FILE = path.join(__dirname, 'settings.json');

const DEFAULT_SETTINGS = {
  enabled: false,                       // Si el bot está activo respondiendo mensajes
  mode: 'secretario',                   // 'secretario' o 'clon'
  assistantName: 'Asistente Virtual',  // Nombre del asistente
  ownerName: 'mi titular',              // Cómo se refiere al dueño
  provider: 'gemini',                   // 'gemini' o 'openrouter'
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: 'gemini-1.5-flash',
  openRouterApiKey: process.env.OPENROUTER_API_KEY || '',
  openRouterModel: 'google/gemini-2.0-flash-exp:free',
  customInstructions: '',               // Instrucciones adicionales personalizadas
  blacklist: [],                        // Lista de números ignorados (formato internacional ej: 51999888777)
  whitelist: [],                        // Lista de números permitidos si whitelistOnly es true
  whitelistOnly: false,                 // Si es true, solo responde a los de la whitelist
  simulateTyping: true,                 // Simular 'escribiendo...'
  typingDelaySeconds: 3,                // Segundos aproximados de delay para parecer natural
  notifyOwnerOnRecado: true,            // Enviar un mensaje a tu propio chat cuando alguien deje un recado
  ignoreGroups: true,                   // Ignorar mensajes de grupos
  ignoreStatus: true                    // Ignorar actualizaciones de estado
};

class ConfigManager {
  constructor() {
    this.settings = this.loadSettings();
  }

  loadSettings() {
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch (err) {
      console.error('Error al leer settings.json, usando valores por defecto:', err.message);
    }
    this.saveSettings(DEFAULT_SETTINGS);
    return { ...DEFAULT_SETTINGS };
  }

  saveSettings(newSettings = this.settings) {
    try {
      this.settings = { ...this.settings, ...newSettings };
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(this.settings, null, 2), 'utf-8');
      return true;
    } catch (err) {
      console.error('Error al guardar settings.json:', err.message);
      return false;
    }
  }

  get(key) {
    return this.settings[key];
  }

  set(key, value) {
    this.settings[key] = value;
    this.saveSettings();
  }

  update(partial) {
    this.settings = { ...this.settings, ...partial };
    this.saveSettings();
    return this.settings;
  }

  isBlacklisted(number) {
    const clean = number.replace(/[^0-9]/g, '');
    return this.settings.blacklist.some(b => clean.includes(b.replace(/[^0-9]/g, '')));
  }

  addToBlacklist(number) {
    const clean = number.replace(/[^0-9]/g, '');
    if (!this.settings.blacklist.includes(clean)) {
      this.settings.blacklist.push(clean);
      this.saveSettings();
      return true;
    }
    return false;
  }

  removeFromBlacklist(number) {
    const clean = number.replace(/[^0-9]/g, '');
    const initialLen = this.settings.blacklist.length;
    this.settings.blacklist = this.settings.blacklist.filter(b => b !== clean);
    if (this.settings.blacklist.length !== initialLen) {
      this.saveSettings();
      return true;
    }
    return false;
  }
}

export const config = new ConfigManager();
