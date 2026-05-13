'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

const API_URL    = process.env.NEXT_PUBLIC_API_URL        || 'http://localhost:4000';
const ADMIN_PWD  = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || 'cuscus2024';
const ADMIN_HDRS = { 'Content-Type': 'application/json', 'x-admin-secret': ADMIN_PWD };

interface Reg { id: string; phone: string; created_at: string; }
type Tab        = 'registros' | 'notificaciones';

const DIAL_MAP: { dial: string; code: string }[] = [
  { dial: '+593', code: 'ec' }, { dial: '+595', code: 'py' }, { dial: '+598', code: 'uy' },
  { dial: '+591', code: 'bo' }, { dial: '+507', code: 'pa' }, { dial: '+506', code: 'cr' },
  { dial: '+502', code: 'gt' }, { dial: '+504', code: 'hn' }, { dial: '+503', code: 'sv' },
  { dial: '+505', code: 'ni' }, { dial: '+57',  code: 'co' }, { dial: '+52',  code: 'mx' },
  { dial: '+54',  code: 'ar' }, { dial: '+56',  code: 'cl' }, { dial: '+51',  code: 'pe' },
  { dial: '+58',  code: 've' }, { dial: '+55',  code: 'br' }, { dial: '+53',  code: 'cu' },
  { dial: '+1',   code: 'us' },
];

function getFlagCode(phone: string): string | null {
  const match = DIAL_MAP.find(({ dial }) => phone.startsWith(dial));
  return match ? match.code : null;
}
type WAState    = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
type DropStage  = 'pre_drop' | 'sold_out';
interface CampaignProgress { total: number; sent: number; failed: number; current: string | null; done: boolean; }

function pad(n: number) { return String(Math.max(0, n)).padStart(2, '0'); }

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'ahora';
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}

function exportCSV(data: Reg[]) {
  const rows = ['Teléfono,Fecha', ...data.map(r =>
    `${r.phone},${new Date(r.created_at).toLocaleString('es-CO')}`)];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
  a.download = `cuscus-${Date.now()}.csv`;
  a.click();
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────

function Login({ onAuth }: { onAuth: () => void }) {
  const [pwd, setPwd]   = useState('');
  const [err, setErr]   = useState(false);
  const [show, setShow] = useState(false);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pwd === ADMIN_PWD) onAuth();
    else { setErr(true); setTimeout(() => setErr(false), 1500); }
  }

  return (
    <div className="h-screen flex items-center justify-center px-4 relative" style={{ background: '#0a0a0a' }}>
      <div className="absolute inset-0 pointer-events-none">
        <div style={{ position: 'absolute', inset: 0, backgroundImage: "url('/fondo.png')", backgroundSize: 'cover', backgroundPosition: 'center bottom', opacity: 0.18 }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(0,0,0,0.75) 0%,rgba(0,0,0,0.5) 50%,rgba(0,0,0,0.92) 100%)' }} />
      </div>
      <div className="relative z-10 w-full max-w-[340px] flex flex-col gap-8">
        <div className="text-center flex flex-col gap-3">
          <p className="font-mono text-[9px] tracking-[0.52em] text-bone-3 uppercase">Panel de administración</p>
          <h1 className="font-gothic text-[52px] tracking-[0.12em] text-bone uppercase leading-none" style={{ textShadow: '0 0 60px rgba(235,230,219,0.3)' }}>
            Cuscus Hats
          </h1>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex border border-[var(--line)] focus-within:border-[var(--line-strong)] transition-colors" style={{ background: 'rgba(235,230,219,0.04)' }}>
            <input type={show ? 'text' : 'password'} value={pwd} onChange={e => setPwd(e.target.value)}
              placeholder="Contraseña" autoFocus
              className="flex-1 bg-transparent outline-none text-bone px-5 h-[50px] font-mono text-[12px] tracking-[0.16em] placeholder:text-bone-3" />
            <button type="button" onClick={() => setShow(v => !v)} className="px-4 text-bone-3 hover:text-bone transition-colors">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                {show
                  ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>
                  : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>}
              </svg>
            </button>
          </div>
          <button type="submit" className="h-[50px] bg-bone text-ink font-mono text-[12px] tracking-[0.4em] uppercase hover:bg-transparent hover:text-bone border border-bone transition-all duration-200">
            Ingresar
          </button>
          {err && <p className="font-mono text-[10px] tracking-[0.22em] text-red-400/80 text-center uppercase">Contraseña incorrecta</p>}
        </form>
      </div>
    </div>
  );
}

// ── ADMIN ─────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [tab, setTab]       = useState<Tab>('registros');
  const [regs, setRegs]     = useState<Reg[]>([]);

  // Socket
  const socketRef = useRef<Socket | null>(null);

  // WhatsApp
  const [waState, setWaState]           = useState<WAState>('disconnected');
  const [waQR, setWaQR]                 = useState<string | null>(null);
  const [waConnecting, setWaConnecting] = useState(false);

  // Drop state
  const [dropStage, setDropStage] = useState<DropStage>('pre_drop');

  // Countdown
  const [dateVal, setDateVal]             = useState('');
  const [timeVal, setTimeVal]             = useState('');
  const [savedDatetime, setSavedDatetime] = useState('');
  const [savingDate, setSavingDate]       = useState(false);
  const [dateSaved, setDateSaved]         = useState(false);
  const [cd, setCd] = useState({ d: 0, h: 0, m: 0, s: 0, expired: false, ready: false });

  // Campaign
  const [message, setMessage]             = useState('');
  const [sendConfirm, setSendConfirm]     = useState(false);
  const [sending, setSending]             = useState(false);
  const [sendResult, setSendResult]       = useState<{ sent: number; failed: number } | null>(null);
  const [sendLogs, setSendLogs]           = useState<string[]>([]);
  const [progress, setProgress]           = useState<CampaignProgress | null>(null);

  // Registrations
  const [search, setSearch]         = useState('');
  const [deleting, setDeleting]     = useState<string | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearing, setClearing]     = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem('cuscus_admin') === '1') setAuthed(true);
  }, []);

  const fetchRegs = useCallback(async () => {
    try {
      const res  = await fetch(`${API_URL}/api/registrations`, { headers: ADMIN_HDRS });
      const json = await res.json();
      setRegs(json.registrations ?? []);
    } catch {}
  }, []);

  const fetchCountdown = useCallback(async () => {
    try {
      const res              = await fetch(`${API_URL}/api/countdown`);
      const { targetDate: ts } = await res.json();
      const d     = new Date(ts);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      setDateVal(local.slice(0, 10));
      setTimeVal(local.slice(11, 16));
      setSavedDatetime(local);
    } catch {}
  }, []);

  // Socket connection — starts when admin logs in
  useEffect(() => {
    if (!authed) return;

    fetchRegs();
    fetchCountdown();

    const socket = io(API_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('wa:status', ({ state, hasQR }: { state: WAState; hasQR: boolean }) => {
      setWaState(state);
      if (!hasQR) setWaQR(null);
    });
    socket.on('wa:qr', ({ qr }: { qr: string }) => setWaQR(qr));

    socket.on('drop:state', ({ stage }: { stage: DropStage }) => setDropStage(stage));

    socket.on('campaign:progress', (p: CampaignProgress) => {
      setProgress(p);
      if (p.done) setSending(false);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [authed, fetchRegs, fetchCountdown]);

  // Countdown ticker
  useEffect(() => {
    if (!savedDatetime) return;
    function tick() {
      const diff = new Date(savedDatetime).getTime() - Date.now();
      if (diff <= 0) { setCd({ d: 0, h: 0, m: 0, s: 0, expired: true, ready: true }); return; }
      setCd({
        d: Math.floor(diff / 86400000),
        h: Math.floor((diff % 86400000) / 3600000),
        m: Math.floor((diff % 3600000) / 60000),
        s: Math.floor((diff % 60000) / 1000),
        expired: false, ready: true,
      });
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [savedDatetime]);

  function handleAuth() { sessionStorage.setItem('cuscus_admin', '1'); setAuthed(true); }
  function logout()      { sessionStorage.removeItem('cuscus_admin'); setAuthed(false); }

  const currentDatetime = dateVal && timeVal ? `${dateVal}T${timeVal}` : '';
  const isDirty         = currentDatetime !== savedDatetime;

  async function saveCountdown() {
    if (!currentDatetime || !isDirty) return;
    setSavingDate(true);
    try {
      await fetch(`${API_URL}/api/countdown`, {
        method: 'PUT', headers: ADMIN_HDRS,
        body: JSON.stringify({ targetDate: currentDatetime }),
      });
      setSavedDatetime(currentDatetime);
      setDateSaved(true);
      setTimeout(() => setDateSaved(false), 2500);
    } finally { setSavingDate(false); }
  }

  async function connectWA() {
    setWaConnecting(true);
    try { await fetch(`${API_URL}/api/whatsapp/connect`, { method: 'POST' }); }
    catch {}
    finally { setWaConnecting(false); }
  }

  async function disconnectWA() {
    await fetch(`${API_URL}/api/whatsapp/disconnect`, { method: 'POST' });
  }

  function toggleDropStage() {
    const next: DropStage = dropStage === 'pre_drop' ? 'sold_out' : 'pre_drop';
    socketRef.current?.emit('drop:set', { stage: next });
  }

  async function sendCampaign() {
    if (!message.trim() || regs.length === 0) return;
    setSendConfirm(false);
    setSending(true);
    setSendResult(null);
    setSendLogs([]);
    setProgress(null);
    try {
      const res  = await fetch(`${API_URL}/api/campaigns/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error');
      setSendResult({ sent: json.sent, failed: json.failed });
      if (json.errors?.length) {
        setSendLogs((json.errors as { phone: string; error: string }[]).map(e => `${e.phone}: ${e.error}`));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      setSendResult({ sent: 0, failed: -1 });
      setSendLogs([msg]);
    } finally { setSending(false); setProgress(null); }
  }

  async function deleteReg(regId: string) {
    setDeleting(regId);
    try {
      await fetch(`${API_URL}/api/registrations/${regId}`, { method: 'DELETE', headers: ADMIN_HDRS });
      setRegs(prev => prev.filter(r => r.id !== regId));
    } finally { setDeleting(null); }
  }

  async function clearAllRegs() {
    setClearing(true);
    try {
      await fetch(`${API_URL}/api/registrations`, { method: 'DELETE', headers: ADMIN_HDRS });
      setRegs([]);
      setClearConfirm(false);
    } finally { setClearing(false); }
  }

  const filteredRegs = [...regs].reverse().filter(r => r.phone.includes(search));

  if (!authed) return <Login onAuth={handleAuth} />;

  const WA_CFG = {
    connected:    { color: '#4ade80', shadow: 'rgba(74,222,128,0.7)',  label: 'Conectado' },
    connecting:   { color: '#fbbf24', shadow: 'rgba(251,191,36,0.7)',  label: 'Conectando' },
    reconnecting: { color: '#fb923c', shadow: 'rgba(251,146,60,0.7)',  label: 'Reconectando' },
    disconnected: { color: 'rgba(235,230,219,0.2)', shadow: 'transparent', label: 'Desconectado' },
  };
  const ws = WA_CFG[waState];
  const isSoldOut = dropStage === 'sold_out';

  return (
    <div className="text-bone flex flex-col" style={{ height: '100vh', overflow: 'hidden', background: '#0a0a0a' }}>

      {/* Fondo */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: "url('/fondo.png')", backgroundSize: 'cover', backgroundPosition: 'center bottom', backgroundRepeat: 'no-repeat', opacity: 0.18 }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(0,0,0,0.82) 0%,rgba(0,0,0,0.55) 40%,rgba(0,0,0,0.80) 75%,rgba(0,0,0,0.97) 100%)' }} />
      </div>

      {/* HEADER */}
      <header className="flex-none flex items-center justify-between px-6 sm:px-10 h-[58px] border-b border-[var(--line)] relative"
        style={{ background: 'rgba(5,5,5,0.85)', backdropFilter: 'blur(12px)', zIndex: 20 }}>
        <a href="/" className="flex items-center gap-2 font-mono text-[10px] tracking-[0.32em] uppercase text-bone-3 hover:text-bone transition-colors duration-200">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="15 18 9 12 15 6"/></svg>
          Salir
        </a>
        <span className="absolute left-1/2 -translate-x-1/2 font-gothic text-[28px] tracking-[0.22em] uppercase text-bone leading-none select-none"
          style={{ textShadow: '0 0 40px rgba(235,230,219,0.25)' }}>
          Admin
        </span>
        <button onClick={logout} className="flex items-center gap-2 font-mono text-[10px] tracking-[0.28em] uppercase text-bone-3 hover:text-red-400/70 transition-colors duration-200">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Cerrar sesión
        </button>
      </header>

      {/* TAB NAV */}
      <nav className="flex-none flex px-6 sm:px-10 border-b border-[var(--line)]"
        style={{ background: 'rgba(5,5,5,0.75)', backdropFilter: 'blur(12px)', zIndex: 10 }}>
        {(['registros', 'notificaciones'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="relative font-mono text-[10px] tracking-[0.5em] uppercase py-[16px] pr-8 transition-colors duration-200"
            style={{ color: tab === t ? 'var(--bone)' : 'var(--bone-3)' }}>
            {t}
            {tab === t && <span className="absolute bottom-0 left-0 h-[1.5px] bg-bone" style={{ right: '32px' }} />}
          </button>
        ))}
      </nav>

      {/* MAIN */}
      <main className="flex-1 overflow-y-auto px-6 sm:px-10 py-10 relative"
        style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(235,230,219,0.08) transparent', zIndex: 5 }}>
        <div className="max-w-[700px] mx-auto flex flex-col gap-12">

          {/* ══════ REGISTROS ══════ */}
          {tab === 'registros' && (
            <>
              <div className="flex items-end justify-between pb-8 border-b border-[var(--line)]">
                <div className="flex flex-col gap-3">
                  <span className="font-mono text-[9px] tracking-[0.52em] uppercase text-bone-3">Pre-registros</span>
                  <div className="flex items-baseline gap-4">
                    <span className="font-garamond font-light leading-none text-bone"
                      style={{ fontSize: 'clamp(64px,12vw,100px)', textShadow: '0 0 60px rgba(235,230,219,0.15)', letterSpacing: '-0.02em' }}>
                      {regs.length}
                    </span>
                    <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-bone-3 mb-3">
                      número{regs.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex items-center gap-2 border border-[var(--line)] focus-within:border-[var(--line-strong)] h-[40px] px-4 transition-colors"
                    style={{ background: 'rgba(235,230,219,0.04)' }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-bone-3 shrink-0">
                      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                      placeholder="Buscar número..."
                      className="bg-transparent outline-none text-bone font-mono text-[10px] tracking-[0.1em] placeholder:text-bone-3 w-[130px]" />
                  </div>
                  <button onClick={() => exportCSV(regs)}
                    className="font-mono text-[9px] tracking-[0.3em] uppercase text-bone-3 hover:text-bone border border-[var(--line)] hover:border-[var(--line-strong)] h-[40px] px-4 transition-all duration-200 flex items-center gap-2"
                    style={{ background: 'rgba(235,230,219,0.04)' }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    CSV
                  </button>
                  {regs.length > 0 && (
                    <button onClick={() => setClearConfirm(true)}
                      className="font-mono text-[9px] tracking-[0.3em] uppercase text-red-400/50 hover:text-red-400/90 border border-[var(--line)] hover:border-red-400/40 h-[40px] px-4 transition-all duration-200 flex items-center gap-2"
                      style={{ background: 'rgba(235,230,219,0.04)' }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/>
                      </svg>
                      Borrar todo
                    </button>
                  )}
                </div>
              </div>

              {clearConfirm && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center px-4"
                  style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)' }}
                  onClick={() => setClearConfirm(false)}>
                  <div className="w-full max-w-[380px] border border-[var(--line-strong)] bg-[#0c0c0c]"
                    onClick={e => e.stopPropagation()}>
                    <div className="border-b border-[var(--line)] px-6 py-4 flex items-center justify-between">
                      <span className="font-mono text-[10px] tracking-[0.42em] text-bone uppercase">Confirmar</span>
                      <button onClick={() => setClearConfirm(false)} className="w-7 h-7 border border-[var(--line)] grid place-items-center text-bone-3 hover:text-bone hover:border-[var(--line-strong)] transition-colors">
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 1l10 10M11 1L1 11"/></svg>
                      </button>
                    </div>
                    <div className="px-6 py-7 flex flex-col gap-6">
                      <div className="flex flex-col gap-2">
                        <p className="font-gothic text-[20px] tracking-[0.1em] uppercase text-bone leading-none">¿Borrar todo?</p>
                        <p className="font-mono text-[9px] tracking-[0.14em] text-bone-3 leading-[1.9] uppercase">
                          Se eliminarán los {regs.length} registros permanentemente.<br />Esta acción no se puede deshacer.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setClearConfirm(false)}
                          className="flex-1 h-[44px] font-mono text-[9px] tracking-[0.28em] uppercase border border-[var(--line)] hover:border-[var(--line-strong)] text-bone-3 hover:text-bone transition-all">
                          Cancelar
                        </button>
                        <button onClick={clearAllRegs} disabled={clearing}
                          className="flex-1 h-[44px] font-mono text-[9px] tracking-[0.28em] uppercase bg-red-400/80 hover:bg-red-400 text-[#0a0a0a] border border-red-400/80 transition-all disabled:opacity-40">
                          {clearing ? 'Borrando...' : 'Eliminar todo'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {filteredRegs.length === 0 ? (
                <div className="flex flex-col items-center gap-4 py-20">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-bone-3 opacity-20">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                  <p className="font-mono text-[9px] tracking-[0.44em] uppercase text-bone-3 opacity-30">
                    {search ? 'Sin resultados' : 'Sin registros aún'}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col divide-y divide-[var(--line)]">
                  {filteredRegs.map((r, i) => (
                    <div key={r.id} className="flex items-center justify-between py-[14px] gap-4 group"
                      style={{ animation: `fadeUp 0.2s ease forwards ${Math.min(i * 30, 250)}ms`, opacity: 0 }}>
                      <div className="flex items-center gap-4 min-w-0">
                        <span className="font-mono text-[9px] tabular-nums text-bone-3 opacity-30 w-6 text-right shrink-0">{filteredRegs.length - i}</span>
                        {getFlagCode(r.phone) && (
                          <img src={`https://flagcdn.com/w20/${getFlagCode(r.phone)}.png`} width="18" height="13" alt="" className="rounded-[2px] object-cover shrink-0 opacity-80" />
                        )}
                        <span className="font-mono text-[14px] tracking-[0.06em] text-bone truncate">{r.phone}</span>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <span className="font-mono text-[9px] tracking-[0.1em] text-bone-3">{timeAgo(r.created_at)}</span>
                        <button onClick={() => deleteReg(r.id)} disabled={deleting === r.id}
                          className="text-bone-3 opacity-0 group-hover:opacity-40 hover:!opacity-100 hover:text-red-400/80 transition-all duration-150 disabled:opacity-20">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ══════ NOTIFICACIONES ══════ */}
          {tab === 'notificaciones' && (
            <>

              {/* ── DROP STATUS ── */}
              <section className="flex flex-col gap-6 pb-10 border-b border-[var(--line)]">
                <div className="flex items-center justify-between">
                  <h2 className="font-gothic text-[30px] tracking-[0.1em] uppercase text-bone leading-none"
                    style={{ textShadow: '0 0 30px rgba(235,230,219,0.18)' }}>
                    Drop Status
                  </h2>
                  <div className="flex items-center gap-2">
                    <span className="w-[8px] h-[8px] rounded-full transition-all duration-500"
                      style={{
                        background: isSoldOut ? '#f87171' : '#4ade80',
                        boxShadow:  isSoldOut ? '0 0 8px rgba(248,113,113,0.7)' : '0 0 8px rgba(74,222,128,0.7)',
                      }} />
                    <span className="font-mono text-[8px] tracking-[0.28em] uppercase transition-colors duration-500"
                      style={{ color: isSoldOut ? '#f87171' : '#4ade80' }}>
                      {isSoldOut ? 'Sold Out Active' : 'Pre Drop Active'}
                    </span>
                  </div>
                </div>

                <div className="border border-[var(--line)] px-6 py-6 flex items-center justify-between gap-6"
                  style={{ background: isSoldOut ? 'rgba(248,113,113,0.04)' : 'rgba(74,222,128,0.03)', transition: 'background 0.4s' }}>
                  <div className="flex flex-col gap-1">
                    <span className="font-mono text-[9px] tracking-[0.38em] uppercase"
                      style={{ color: isSoldOut ? '#f87171' : '#4ade80' }}>
                      {isSoldOut ? 'Sold Out — landing actualizada' : 'Pre Drop — formulario activo'}
                    </span>
                    <span className="font-mono text-[8px] tracking-[0.14em] text-bone-3 opacity-50">
                      {isSoldOut
                        ? 'El formulario está oculto. La landing muestra SOLD OUT.'
                        : 'Activa SOLD OUT para cerrar el registro en tiempo real.'}
                    </span>
                  </div>
                  <button
                    onClick={toggleDropStage}
                    className="shrink-0 font-gothic text-[16px] tracking-[0.12em] uppercase border px-6 h-[44px] transition-all duration-200"
                    style={
                      isSoldOut
                        ? { background: 'transparent', color: 'var(--bone)', borderColor: 'rgba(235,230,219,0.35)' }
                        : { background: '#f87171', color: '#0a0a0a', borderColor: '#f87171' }
                    }>
                    {isSoldOut ? 'Desactivar' : 'Sold Out'}
                  </button>
                </div>
              </section>

              {/* ── Fecha del Drop ── */}
              <section className="flex flex-col gap-6 pb-10 border-b border-[var(--line)]">
                <h2 className="font-gothic text-[30px] tracking-[0.1em] uppercase text-bone leading-none"
                  style={{ textShadow: '0 0 30px rgba(235,230,219,0.18)' }}>
                  Fecha del Drop
                </h2>
                <div className="flex gap-2">
                  <input type="date" value={dateVal} onChange={e => setDateVal(e.target.value)}
                    className="flex-1 border border-[var(--line)] focus:border-[var(--line-strong)] text-bone px-5 h-[50px] font-mono text-[12px] outline-none transition-colors [color-scheme:dark]"
                    style={{ background: 'rgba(235,230,219,0.05)' }} />
                  <input type="time" value={timeVal} onChange={e => setTimeVal(e.target.value)}
                    className="w-[120px] border border-[var(--line)] focus:border-[var(--line-strong)] text-bone px-5 h-[50px] font-mono text-[12px] outline-none transition-colors [color-scheme:dark]"
                    style={{ background: 'rgba(235,230,219,0.05)' }} />
                  <button onClick={saveCountdown} disabled={savingDate || !isDirty || !currentDatetime}
                    className="h-[50px] px-6 font-mono text-[10px] tracking-[0.36em] uppercase border transition-all duration-200 disabled:opacity-30 shrink-0"
                    style={
                      dateSaved
                        ? { background: 'transparent', color: 'var(--bone)', borderColor: 'var(--line-strong)' }
                        : isDirty && currentDatetime
                          ? { background: 'var(--bone)', color: 'var(--ink)', borderColor: 'var(--bone)' }
                          : { background: 'transparent', color: 'var(--bone)', borderColor: 'rgba(235,230,219,0.2)' }
                    }>
                    {dateSaved ? '✓ Guardado' : savingDate ? '...' : 'Guardar'}
                  </button>
                </div>

                {cd.ready && (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex-1 h-px bg-[var(--line)]" />
                      <span className="font-mono text-[8px] tracking-[0.38em] text-bone-3 uppercase whitespace-nowrap">
                        {cd.expired ? 'Drop expirado · actualiza la fecha ↑' : 'Próximo drop en'}
                      </span>
                      <span className="flex-1 h-px bg-[var(--line)]" />
                    </div>
                    <div className="grid grid-cols-4 gap-[6px]" style={{ opacity: cd.expired ? 0.3 : 1 }}>
                      {[
                        { val: pad(cd.d), label: 'Días' },
                        { val: pad(cd.h), label: 'Horas' },
                        { val: pad(cd.m), label: 'Min' },
                        { val: pad(cd.s), label: 'Seg' },
                      ].map(({ val, label }) => (
                        <div key={label} className="cd-cell border border-[var(--line)] text-center"
                          style={{ background: 'linear-gradient(180deg,rgba(235,230,219,0.07) 0%,rgba(235,230,219,0.02) 100%)', padding: '12px 4px 10px' }}>
                          <div className="font-garamond font-light leading-none text-bone"
                            style={{ fontSize: 'clamp(28px,5vw,40px)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', textShadow: '0 0 24px rgba(235,230,219,0.2)' }}>
                            {val}
                          </div>
                          <div className="mt-[5px] text-[8px] text-bone-3 font-mono uppercase tracking-[0.24em]">{label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              {/* ── WhatsApp ── */}
              <section className="flex flex-col gap-6">
                <div className="flex items-center justify-between">
                  <h2 className="font-gothic text-[30px] tracking-[0.1em] uppercase text-bone leading-none"
                    style={{ textShadow: '0 0 30px rgba(235,230,219,0.18)' }}>
                    WhatsApp
                  </h2>
                  <div className="flex items-center gap-3">
                    <span className="w-[8px] h-[8px] rounded-full" style={{ background: ws.color, boxShadow: `0 0 8px ${ws.shadow}`, transition: 'background 0.4s' }} />
                    <span className="font-mono text-[8px] tracking-[0.28em] uppercase transition-colors" style={{ color: ws.color }}>{ws.label}</span>
                    {(waState === 'connected' || waState === 'reconnecting') && (
                      <button onClick={disconnectWA}
                        className="font-mono text-[8px] tracking-[0.2em] uppercase text-bone-3 hover:text-red-400/70 border-l border-[var(--line)] pl-3 ml-1 transition-colors">
                        Desconectar
                      </button>
                    )}
                  </div>
                </div>

                {/* QR / Connect */}
                {waState !== 'connected' && (
                  <div className="border border-[var(--line)] flex flex-col items-center gap-5 py-8 px-6"
                    style={{ background: 'rgba(235,230,219,0.02)' }}>
                    {waQR ? (
                      <>
                        <p className="font-mono text-[9px] tracking-[0.3em] uppercase text-bone-3">Escanea con WhatsApp → Dispositivos vinculados</p>
                        <div className="p-3 border-[6px] border-bone/10" style={{ background: '#fff' }}>
                          <img src={waQR} alt="QR WhatsApp" className="w-[200px] h-[200px] block" />
                        </div>
                        <p className="font-mono text-[8px] tracking-[0.24em] uppercase text-bone-3 opacity-40">El QR expira en 60 s · se renueva automáticamente</p>
                      </>
                    ) : waState === 'connecting' || waState === 'reconnecting' ? (
                      <div className="flex flex-col items-center gap-4 py-4">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-bone-3"
                          style={{ animation: 'spin 1s linear infinite' }}>
                          <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                        </svg>
                        <p className="font-mono text-[9px] tracking-[0.36em] uppercase text-bone-3">
                          {waState === 'reconnecting' ? 'Reconectando...' : 'Generando QR...'}
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-5 py-2">
                        <p className="font-mono text-[9px] tracking-[0.24em] uppercase text-bone-3 text-center leading-[2.2]">
                          Conecta tu WhatsApp para enviar mensajes<br />masivos a los {regs.length} registrados
                        </p>
                        <button onClick={connectWA} disabled={waConnecting}
                          className="font-gothic text-[18px] tracking-[0.14em] uppercase bg-bone text-ink hover:bg-transparent hover:text-bone border border-bone px-10 h-[50px] transition-all duration-200 disabled:opacity-40">
                          {waConnecting ? 'Conectando...' : 'Conectar WhatsApp'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Mensaje */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[8px] tracking-[0.4em] uppercase text-bone-3">Mensaje · {regs.length} destinatarios</span>
                    <span className="font-mono text-[8px] tracking-[0.16em] text-bone-3 opacity-35">variable: {`{{phone}}`}</span>
                  </div>
                  <textarea value={message}
                    onChange={e => { setMessage(e.target.value); setSendResult(null); setSendConfirm(false); }}
                    placeholder={"Hola, el drop de Cuscus Hats ya está disponible.\n\nEntra ahora antes de que se agoten:\nhttps://cuscushats.com"}
                    rows={5}
                    className="border border-[var(--line)] focus:border-[var(--line-strong)] text-bone px-5 py-4 font-mono text-[11px] tracking-[0.08em] leading-relaxed outline-none transition-colors resize-none placeholder:text-bone-3"
                    style={{ background: 'rgba(235,230,219,0.03)' }} />

                  {/* Progreso realtime */}
                  {sending && progress && !progress.done && (
                    <div className="border border-[var(--line)] px-4 py-3 flex flex-col gap-2"
                      style={{ background: 'rgba(235,230,219,0.02)' }}>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[8px] tracking-[0.22em] uppercase text-bone-3">
                          Enviando {progress.sent} / {progress.total}
                          {progress.failed > 0 && ` · ${progress.failed} fallidos`}
                        </span>
                        <span className="font-mono text-[8px] text-bone-3 opacity-50 truncate max-w-[180px]">
                          {progress.current}
                        </span>
                      </div>
                      <div className="h-[2px] bg-[var(--line)] w-full">
                        <div className="h-full bg-bone transition-all duration-300"
                          style={{ width: `${progress.total > 0 ? (progress.sent / progress.total) * 100 : 0}%` }} />
                      </div>
                    </div>
                  )}

                  {/* Resultado */}
                  {sendResult && (
                    <div className={`border px-4 py-3 font-mono text-[9px] tracking-[0.12em] flex flex-col gap-1 ${
                      sendResult.failed === -1 ? 'border-red-400/30 text-red-400/80' : 'border-green-400/30 text-green-400/80'
                    }`}>
                      {sendResult.failed === -1
                        ? `Error — ${sendLogs[0] || 'revisa la conexión WhatsApp'}`
                        : `✓ ${sendResult.sent} enviados${sendResult.failed > 0 ? ` · ${sendResult.failed} fallidos` : ''}`}
                      {sendLogs.length > 0 && sendResult.failed !== -1 && (
                        <div className="mt-1 opacity-60 flex flex-col gap-[2px]">
                          {sendLogs.slice(0, 5).map((l, i) => <span key={i}>{l}</span>)}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex justify-end">
                    {sendConfirm ? (
                      <div className="flex gap-2">
                        <button onClick={() => setSendConfirm(false)}
                          className="font-mono text-[9px] tracking-[0.22em] uppercase border border-[var(--line)] hover:border-[var(--line-strong)] text-bone-3 hover:text-bone px-4 h-[48px] transition-all">
                          Cancelar
                        </button>
                        <button onClick={sendCampaign}
                          className="font-gothic text-[18px] tracking-[0.14em] uppercase bg-bone text-ink hover:bg-transparent hover:text-bone border border-bone px-8 h-[48px] transition-all duration-200">
                          Enviar a {regs.length}
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setSendConfirm(true)}
                        disabled={sending || !message.trim() || regs.length === 0 || waState !== 'connected'}
                        className="font-gothic text-[18px] tracking-[0.14em] uppercase border border-[var(--line)] hover:border-bone text-bone px-10 h-[48px] transition-all duration-200 disabled:opacity-30 flex items-center gap-3"
                        style={{ background: 'rgba(235,230,219,0.04)' }}>
                        {sending && (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                            <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                          </svg>
                        )}
                        {sending ? 'Enviando...' : 'Enviar Mensaje'}
                      </button>
                    )}
                  </div>

                  {waState !== 'connected' && (
                    <p className="font-mono text-[8px] tracking-[0.2em] uppercase text-bone-3 opacity-30 text-right">
                      Conecta WhatsApp para habilitar el envío
                    </p>
                  )}
                </div>
              </section>

            </>
          )}
        </div>
      </main>

      <style>{`
        @keyframes spin   { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
