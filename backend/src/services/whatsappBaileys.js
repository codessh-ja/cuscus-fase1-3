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
  const total     = phones.length;

  emit('campaign:progress', { total, sent: 0, failed: 0, current: null, done: false });

  try {
    for (const phone of phones) {
      // Detener si WhatsApp se desconecta durante la campaña
      if (state !== 'connected') {
        results.errors.push({ phone: 'N/A', error: 'WhatsApp desconectado durante la campaña' });
        break;
      }

      emit('campaign:progress', { total, sent: results.sent, failed: results.failed, current: phone, done: false });

      try {
        await sendMessage(phone, template);
        results.sent++;
      } catch (err) {
        results.failed++;
        results.errors.push({ phone, error: err.message });
      }

      // Delay aleatorio entre 3s y 5.5s para evitar detección de spam
      if (phones.indexOf(phone) < phones.length - 1) {
        await randomDelay(3000, 5500);
      }
    }
  } finally {
    campaignRunning = false;
    emit('campaign:progress', { total, sent: results.sent, failed: results.failed, current: null, done: true });
  }

  return results;
}
