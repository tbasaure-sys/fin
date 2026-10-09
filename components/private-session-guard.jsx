'use client';
import { useEffect, useRef, useState } from 'react';

export default function PrivateSessionGuard({ children, scope, expiresAt }) {
  const [state, setState] = useState('checking');
  const locked = useRef(false), content = useRef(null);
  useEffect(() => {
    let disposed = false, opened = false, expiryTimer;
    const identity = `${scope}:${expiresAt}`;
    const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('bls-private-lock') : null;
    const controller = new AbortController();
    const hide = () => { if (content.current) content.current.hidden = true; };
    const lock = () => {
      hide();
      if (locked.current) return;
      locked.current = true;
      try { sessionStorage.setItem('bls_private_locked', identity); } catch {}
      channel?.postMessage('lock');
      setState('locked');
      controller.abort();
      const payload = new Blob(['{}'], { type: 'application/json' });
      if (!navigator.sendBeacon?.('/api/auth/lock', payload)) fetch('/api/auth/lock', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', keepalive: true }).catch(() => {});
    };
    const check = async () => {
      try {
        const response = await fetch('/api/auth/status', { cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
        const session = response.ok ? await response.json() : null;
        const remaining = Math.min(Date.parse(session?.expiresAt), Date.parse(expiresAt)) - Date.now();
        if (!response.ok || session?.scope !== scope || !Number.isFinite(remaining) || remaining <= 0) { lock(); return; }
        if (disposed || locked.current) return;
        opened = true;
        expiryTimer = window.setTimeout(lock, remaining);
        setState('open');
      } catch { if (!disposed && !locked.current) lock(); }
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') lock(); };
    const onPageShow = event => { if (event.persisted) lock(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', lock);
    window.addEventListener('pageshow', onPageShow);
    if (channel) channel.onmessage = lock;
    let previouslyLocked = false;
    try { previouslyLocked = sessionStorage.getItem('bls_private_locked') === identity; } catch {}
    if (document.visibilityState === 'hidden' || locked.current || previouslyLocked) lock(); else check();
    return () => { if (opened) lock(); disposed = true; controller.abort(); clearTimeout(expiryTimer); document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('pagehide', lock); window.removeEventListener('pageshow', onPageShow); channel?.close(); };
  }, [scope, expiresAt]);
  return <>
    <div ref={content} hidden={state !== 'open'} data-testid="private-session-content">{state === 'open' ? children : null}</div>
    {state !== 'open' && <main style={{ minHeight: '100vh', background: '#090e14', color: '#f1efe7', display: 'grid', placeItems: 'center', padding: 24 }}>
      <section role="status" style={{ maxWidth: 480 }}>
        <p>ESPACIO PRIVADO</p>
        <h1>{state === 'checking' ? 'Verificando acceso…' : 'Tu cartera está bloqueada'}</h1>
        {state === 'locked' && <><p>Para volver a ver tus holdings, inicia sesión con tu contraseña.</p><a style={{ color: '#d5b96e' }} href="/login?intent=signin&next=%2Fapp%23holdings&lang=es">Iniciar sesión</a></>}
      </section>
    </main>}
  </>;
}
