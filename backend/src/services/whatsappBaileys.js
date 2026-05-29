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

// Delay humanizado anti-ban — promedio ~70s → 300 mensajes en ~7-8h (máxima protección)
// Distribución irregular que imita comportamiento humano real al enviar mensajes
function humanDelay() {
  const r = Math.random();
  let ms;
  if      (r < 0.50) ms = 15000 + Math.random() * 20000;  // 50%: 15–35s  (escribe con calma)
  else if (r < 0.75) ms = 35000 + Math.random() * 40000;  // 25%: 35–75s  (revisó algo antes)
  else if (r < 0.90) ms = 75000 + Math.random() * 75000;  // 15%: 75–150s (break corto)
  else if (r < 0.97) ms = 150000 + Math.random() * 210000; //  7%: 2.5–6 min (se fue un rato)
  else               ms = 360000 + Math.random() * 240000; //  3%: 6–10 min (descanso largo)
  return new Promise(r => setTimeout(r, Math.floor(ms)));
}

// Verifica si un número está registrado en WhatsApp antes de intentar enviar
async function isOnWhatsApp(cleaned) {
  if (!sock) return true;
  try {
    const [result] = await sock.onWhatsApp(cleaned);
    return result?.exists === true;
  } catch {
    return true;
  }
}

// Simula comportamiento humano completo antes de enviar:
// aparece online → pausa → escribe → para → revisa → envía
async function simulateTyping(jid, messageLength) {
  if (!sock) return;
  try {
    // Aparece online como si abriera la app
    await sock.sendPresenceUpdate('available', jid);
    await new Promise(r => setTimeout(r, 800 + Math.random() * 1200));

    // A veces "piensa" antes de escribir (30% de veces)
    if (Math.random() < 0.30) {
      await new Promise(r => setTimeout(r, 1500 + Math.random() * 3000));
    }

    // Empieza a escribir — duración proporcional al mensaje
    const typingMs = Math.min(6000, Math.max(2000, messageLength * 22 + Math.random() * 1500));
    await sock.sendPresenceUpdate('composing', jid);
    await new Promise(r => setTimeout(r, Math.floor(typingMs)));

    // A veces "para de escribir" y vuelve (20% — como cuando uno borra y reescribe)
    if (Math.random() < 0.20) {
      await sock.sendPresenceUpdate('paused', jid);
      await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
      await sock.sendPresenceUpdate('composing', jid);
      await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
    }

    // Pausa final — está revisando el mensaje antes de enviarlo
    await sock.sendPresenceUpdate('paused', jid);
    await new Promise(r => setTimeout(r, 500 + Math.random() * 1000));
  } catch {
    // No bloquear el envío si falla la presencia
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
  const results = { sent: 0, failed: 0, skipped: 0, errors: [] };

  // Mezclar orden para que no sea secuencial (más humano)
  const shuffled = [...phones].sort(() => Math.random() - 0.5);
  const total    = shuffled.length;

  // Pausa larga cada 20–30 mensajes — lotes pequeños, máxima protección
  let nextBatchBreak = 20 + Math.floor(Math.random() * 11);

  emit('campaign:progress', { total, sent: 0, failed: 0, skipped: 0, current: null, done: false });
  console.log(`📤 Campaña iniciada — ${total} números, pausa larga cada ~${nextBatchBreak} mensajes`);

  try {
    for (let i = 0; i < shuffled.length; i++) {
      const phone = shuffled[i];

      if (state !== 'connected') {
        results.errors.push({ phone: 'N/A', error: 'WhatsApp desconectado durante la campaña' });
        break;
      }

      emit('campaign:progress', {
        total, sent: results.sent, failed: results.failed,
        skipped: results.skipped, current: phone, done: false,
      });

      const cleaned = phone.replace(/[^\d]/g, '');
      const jid     = `${cleaned}@s.whatsapp.net`;

      // Verificar si el número existe en WhatsApp — si no, ignorarlo
      const exists = await isOnWhatsApp(cleaned);
      if (!exists) {
        results.skipped++;
        console.log(`⏭️  [${i + 1}/${total}] Ignorado (no está en WhatsApp): ${phone}`);
        continue; // sin delay, pasar al siguiente
      }

      try {
        const text = interpolate(template, { phone: cleaned });

        await simulateTyping(jid, text.length);
        await sock.sendMessage(jid, { text });
        results.sent++;
        console.log(`✅ [${results.sent + results.failed}/${total}] Enviado a ${phone}`);
      } catch (err) {
        results.failed++;
        results.errors.push({ phone, error: err.message });
        console.log(`❌ Error en ${phone}: ${err.message}`);
      }

      const isLast = i === shuffled.length - 1;
      if (isLast) break;

      // Pausa larga de lote — simula que dejó el celular un buen rato
      if ((i + 1) === nextBatchBreak) {
        const breakMs = 8 * 60000 + Math.random() * 7 * 60000; // 8–15 minutos
        console.log(`☕ Pausa de lote tras ${i + 1} mensajes — ${Math.round(breakMs / 60000)} min`);
        emit('campaign:progress', {
          total, sent: results.sent, failed: results.failed,
          skipped: results.skipped, current: null, done: false, paused: true,
        });
        await new Promise(r => setTimeout(r, Math.floor(breakMs)));
        nextBatchBreak += 20 + Math.floor(Math.random() * 11);
      } else {
        await humanDelay();
      }
    }
  } finally {
    campaignRunning = false;
    emit('campaign:progress', {
      total, sent: results.sent, failed: results.failed,
      skipped: results.skipped, current: null, done: true,
    });
    console.log(`🏁 Campaña finalizada — ${results.sent} enviados, ${results.failed} fallidos, ${results.skipped} ignorados (sin WhatsApp)`);
  }

  return results;
}
