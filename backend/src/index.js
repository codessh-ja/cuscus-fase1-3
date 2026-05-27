import { createServer }     from 'http';
import express             from 'express';
import cors                from 'cors';
import dotenv              from 'dotenv';
import { connectDB }       from './db/connection.js';
import registrationsRouter from './routes/registrations.js';
import countdownRouter     from './routes/countdown.js';
import campaignsRouter     from './routes/campaigns.js';
import whatsappRouter      from './routes/whatsapp.js';
import dropRouter          from './routes/drop.js';
import twilioRouter        from './routes/twilio.js';
import { createSocketServer } from './socket/index.js';

dotenv.config();

const app        = express();
const httpServer = createServer(app);
const PORT       = process.env.PORT || 4000;

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' }));
app.use(express.json());
app.use(express.urlencoded({ extended: false })); // required for Twilio webhook (form-encoded)

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/registrations', registrationsRouter);
app.use('/api/countdown',     countdownRouter);
app.use('/api/campaigns',     campaignsRouter);
app.use('/api/whatsapp',      whatsappRouter);
app.use('/api/drop',          dropRouter);
app.use('/api/twilio',        twilioRouter);

createSocketServer(httpServer);

connectDB()
  .then(() => {
    httpServer.listen(PORT, () => {
      console.log(`🎩 Cuscus Hats backend on http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ Failed to connect to MongoDB:', err.message);
    process.exit(1);
  });
