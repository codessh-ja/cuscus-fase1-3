import { Server } from 'socket.io';
import { getDropState, setDropState } from '../state/dropState.js';
import { getStatus as getWAStatus, getQR, waEvents } from '../services/whatsappBaileys.js';
import { twilioEvents } from '../services/twilioWhatsapp.js';

let io = null;

export function createSocketServer(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
    },
  });

  // Wire Baileys events → socket broadcasts
  waEvents.on('status',            data => { if (io) io.emit('wa:status', data); });
  waEvents.on('qr',                data => { if (io) io.emit('wa:qr', data); });
  waEvents.on('campaign:progress', data => { if (io) io.emit('campaign:progress', data); });

  // Wire Twilio events → socket broadcasts
  twilioEvents.on('twilio:campaign:start',    data => { if (io) io.emit('twilio:campaign:start',    data); });
  twilioEvents.on('twilio:campaign:progress', data => { if (io) io.emit('twilio:campaign:progress', data); });
  twilioEvents.on('twilio:campaign:done',     data => { if (io) io.emit('twilio:campaign:done',     data); });

  io.on('connection', async socket => {
    socket.emit('wa:status', getWAStatus());
    socket.emit('drop:state', await getDropState());
    const qr = getQR();
    if (qr) socket.emit('wa:qr', { qr });

    socket.on('drop:set', async ({ stage }) => {
      if (stage !== 'pre_drop' && stage !== 'sold_out') return;
      const state = await setDropState(stage);
      io.emit('drop:state', state);
    });
  });

  return io;
}

export function getIO() { return io; }
