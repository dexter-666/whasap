# 🤖 Secretario / Asistente Virtual 24/7 para WhatsApp

Asistente con Inteligencia Artificial conectado a tu WhatsApp personal con:
- **Control total desde tu propio chat** ("Mensajes contigo mismo").
- **Dos modos de operación**: Modo Clon Conversacional (casual y corto) y Modo Secretario (formal y toma de recados).
- **Notificación automática de recados**: El bot te avisa en tu chat personal cuando alguien deja un recado importante.
- **Panel Web en tiempo real**: Código QR en vivo, estado de la conexión y configuración visual.
- **Motor IA**: Google Gemini (gratuito y ultra-rápido) o OpenRouter.

---

## 🚀 Inicio Rápido (En tu Computadora)

### 1. Obtener API Key Gratuita de Gemini
1. Entra a [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Inicia sesión con tu cuenta de Google y haz clic en **"Create API key"**.
3. Copia tu clave API.

### 2. Configurar la API Key
Abre el archivo `.env` en esta carpeta y pega tu clave:
```env
PORT=3000
GEMINI_API_KEY=tu_api_key_aqui
```
*(O también puedes ingresarla directamente desde el Panel Web).*

### 3. Iniciar el Bot
En tu terminal / consola ejecuta:
```bash
npm start
```

### 4. Vincular tu WhatsApp
1. Abre tu navegador en `http://localhost:3000`.
2. Verás el **código QR** en pantalla (y también en la consola).
3. En tu teléfono, abre **WhatsApp** > **Dispositivos vinculados** > **Vincular dispositivo**.
4. Escanea el código QR y ¡listo! La sesión quedará guardada.

---

## 📱 Control desde WhatsApp (Comandos en tu propio chat)

Solo escribe a tu propio número en WhatsApp con cualquiera de estos comandos:

| Comando | Acción |
| :--- | :--- |
| `.on` o `.activar` | Enciende las respuestas automáticas. |
| `.off` o `.desactivar` | Pausa el asistente (no responderá a nadie). |
| `.modo clon` | Activa respuestas cortas e informales como si fueras tú. |
| `.modo secretario` | Activa modo asistente formal con toma de recados. |
| `.nombre Lucía` | Cambia el nombre del asistente/secretaria. |
| `.yo TuNombre` | Configura cómo se refiere a ti el bot. |
| `.estado` o `.status` | Muestra el estado actual del bot. |
| `.ignorar 51987654321` | Añade un número a la lista negra para no responderle. |
| `.permitir 51987654321`| Quita un número de la lista negra. |
| `.prompt [instrucción]`| Añade instrucciones personalizadas a la IA. |
| `.limpiar` | Borra la memoria temporal de las conversaciones. |
| `.ayuda` | Muestra la lista completa de comandos. |

---

## ☁️ Despliegue 24/7 en Render (Gratis)

Para dejarlo corriendo 24/7 en la nube con Render:

1. Sube este proyecto a tu cuenta de **GitHub** (repositorio privado o público).
2. Ve a [Render.com](https://render.com) y crea una cuenta gratuita.
3. Haz clic en **New +** > **Web Service**.
4. Conecta tu repositorio de GitHub.
5. Configura los siguientes campos:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
6. En la sección **Environment Variables**, añade:
   - `GEMINI_API_KEY`: Tu clave de Gemini.
7. Haz clic en **Deploy**.
8. Una vez desplegado, Render te dará un enlace público (ej: `https://secretario-whatsapp.onrender.com`).
9. Abre ese enlace en tu celular o PC para escanear el QR y vincularlo en la nube.

---

## 🛡️ Medidas de Seguridad y Privacidad
- El bot **NO responde a estados de WhatsApp**.
- El bot **NO responde a grupos** por defecto.
- El bot simula escritura humana con estados de *"escribiendo..."* y tiempos de espera naturales.
- Tus llaves de sesión se guardan localmente en la carpeta `auth_session/`.
