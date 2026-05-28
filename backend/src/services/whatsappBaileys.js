import makeWASocket, { useMultiFileAuthState, DisconnectReason, Browsers } from '@whiskeysockets/baileys';
import QRCode        from 'qrcode';
import pino          from 'pino';
import { EventEmitter } from 'events';
import path          from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync, rmSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR  = path.join(__dirname, '../../../data/baileys_auth');
const logger    = pino({ level: 'silent' });

export const waEvents = new EventEmitter();

let sock              = null;
let currentQR         = null;
let state             = 'disconnected';
let reconnectAttempts = 0;
let autoReconnect     = true;
let campaignRunning   = false;

function emit(event, data) {
  waEvents.emit(event, data);
}

function randomDelay(min = 3000, max = 5500) {
  return new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min + 1)) + min));
}

// Delay humanizado con distribución realista
// Simula que una persona real está enviando mensajes desde su celular
function humanDelay() {
  const r = Math.random();
  let ms;
  if      (r < 0.55) ms = 8000  + Math.random() * 17000;  // 55%: 8–25s  (ritmo normal)
  else if (r < 0.80) ms = 25000 + Math.random() * 35000;  // 25%: 25–60s (se distrajo un momento)
  else if (r < 0.93) ms = 60000 + Math.random() * 90000;  // 13%: 1–2.5 min (tomó un break corto)
  else               ms = 150000 + Math.random() * 120000; //  7%: 2.5–4.5 min (se fue un rato)
  return new Promise(r => setTimeout(r, Math.floor(ms)));
}

// Simula que el remitente está escribiendo antes de enviar
async function simulateTyping(jid, messageLength) {
  if (!sock) return;
  try {
    // Marcar como disponible primero
    await sock.sendPresenceUpdate('available', jid);
    await new Promise(r => setTimeout(r, 400 + Math.random() * 600));

    // "Escribiendo..." — duración proporcional al largo del mensaje
    const typingMs = Math.min(4000, Math.max(1200, messageLength * 18 + Math.random() * 800));
    await sock.sendPresenceUpdate('composing', jid);
    await new Promise(r => setTimeout(r, Math.floor(typingMs)));

    // Pausa breve antes de enviar (como cuando uno revisa el mensaje)
    await sock.sendPresenceUpdate('paused', jid);
    await new Promise(r => setTimeout(r, 300 + Math.random() * 500));
  } catch {
    // No bloquear el envío si falla la simulación de presencia
  }
}

export function getStatus()   { return { state, hasQR: !!currentQR }; }
export function getQR()       { return currentQR; }
export function isCampaignRunning() { return campaignRunning; }

export async function connect() {
  // Guard: no crear socket si ya está conectando o conectado
  if (state === 'connected' || state === 'connecting') return;

  if (!existsSync(AUTH_DIR)) mkdirSync(AUTH_DIR, { recursive: true });

  const { state: authState, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  state         = 'connecting';
  currentQR     = null;
  autoReconnect = true;

  emit('status', { state, hasQR: false });

  sock = makeWASocket({
    auth:                  authState,
    printQRInTerminal:     false,
    browser:               Browsers.ubuntu('Chrome'),
    logger,
    connectTimeoutMs:      60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs:   25000,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      try { currentQR = await QRCode.toDataURL(qr); } catch {}
      state = 'connecting';
      emit('status', { state, hasQR: true });
      emit('qr', { qr: currentQR });
    }

    if (connection === 'open') {
      currentQR         = null;
      state             = 'connected';
      reconnectAttempts = 0;
      emit('status', { state, hasQR: false });
      console.log('🟢 WhatsApp conectado');
    }

    if (connection === 'close') {
      const code      = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;

      sock = null;

      if (loggedOut || !autoReconnect) {
        // Limpiar sesión para que el próximo connect() genere QR limpio
        clearSession();
        state     = 'disconnected';
        currentQR = null;
        emit('status', { state, hasQR: false });
        console.log('🔴 WhatsApp desconectado (sesión cerrada)');
      } else {
        state = 'reconnecting';
        emit('status', { state, hasQR: false });
        reconnectAttempts++;
        const delay = Math.min(3000 * reconnectAttempts, 30000);
        console.log(`🟡 Reconectando en ${delay}ms... (intento ${reconnectAttempts})`);
        setTimeout(connect, delay);
      }
    }
  });
}

function clearSession() {
  if (existsSync(AUTH_DIR)) {
    try { rmSync(AUTH_DIR, { recursive: true, force: true }); } catch {}
  }
}

export async function disconnect() {
  autoReconnect = false;
  if (sock) {
    try { await sock.logout(); } catch {}
    sock = null;
  }
  clearSession();
  state             = 'disconnected';
  currentQR         = null;
  reconnectAttempts = 0;
  emit('status', { state, hasQR: false });
}

function interpolate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

export async function sendMessage(phone, template) {
  if (!sock || state !== 'connected') throw new Error('WhatsApp no conectado');
  const cleaned = phone.replace(/[^\d]/g, '');
  const jid     = `${cleaned}@s.whatsapp.net`;
  const text    = interpolate(template, { phone: cleaned });
  await sock.sendMessage(jid, { text });
}

export async function sendCampaign(phones, template) {
  if (campaignRunning) throw new Error('Ya hay una campaña en curso');

  campaignRunning = true;
  const results   = { sent: 0, failed: 0, errors: [] };

  // Mezclar el orden para que no sea secuencial (más humano)
  const shuffled = [...phones].sort(() => Math.random() - 0.5);
  const total    = shuffled.length;

  // Tamaño de lote variable: cada 20–35 mensajes se toma un descanso largo
  let nextBatchBreak = 20 + Math.floor(Math.random() * 16);

  emit('campaign:progress', { total, sent: 0, failed: 0, current: null, done: false });
  console.log(`📤 Campaña iniciada — ${total} números, pausa larga cada ~${nextBatchBreak} mensajes`);

  try {
    for (let i = 0; i < shuffled.length; i++) {
      const phone = shuffled[i];

      // Detener si WhatsApp se desconecta durante la campaña
      if (state !== 'connected') {
        results.errors.push({ phone: 'N/A', error: 'WhatsApp desconectado durante la campaña' });
        break;
      }

      emit('campaign:progress', {
        total,
        sent:    results.sent,
        failed:  results.failed,
        current: phone,
        done:    false,
      });

      try {
        const cleaned = phone.replace(/[^\d]/g, '');
        const jid     = `${cleaned}@s.whatsapp.net`;
        const text    = interpolate(template, { phone: cleaned });

        // Simular que está escribiendo antes de enviar
        await simulateTyping(jid, text.length);

        await sock.sendMessage(jid, { text });
        results.sent++;
        console.log(`✅ [${results.sent}/${total}] Enviado a ${phone}`);
      } catch (err) {
        results.failed++;
        results.errors.push({ phone, error: err.message });
        console.log(`❌ [${i + 1}/${total}] Error en ${phone}: ${err.message}`);
      }

      const isLast = i === shuffled.length - 1;
      if (isLast) break;

      // Pausa larga al completar un lote (simula que dejó el teléfono)
      if ((i + 1) === nextBatchBreak) {
        const breakMs = 4 * 60000 + Math.random() * 6 * 60000; // 4–10 minutos
        console.log(`☕ Pausa de lote tras ${i + 1} mensajes — ${Math.round(breakMs / 60000)} min`);
        emit('campaign:progress', {
          total, sent: results.sent, failed: results.failed,
          current: null, done: false, paused: true,
        });
        await new Promise(r => setTimeout(r, Math.floor(breakMs)));
        nextBatchBreak += 20 + Math.floor(Math.random() * 16); // próximo lote
      } else {
        // Delay humanizado entre mensajes
        await humanDelay();
      }
    }
  } finally {
    campaignRunning = false;
    emit('campaign:progress', {
      total, sent: results.sent, failed: results.failed,
      current: null, done: true,
    });
    console.log(`🏁 Campaña finalizada — ${results.sent} enviados, ${results.failed} fallidos`);
  }

  return results;
}
