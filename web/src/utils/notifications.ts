/**
 * notifications.ts - Utilitário central de alertas sonoros (Web Audio API)
 * e notificações desktop integradas ao Sistema Operacional (Windows / macOS / Linux)
 * via Service Worker e Web Notification API nativa.
 */

let audioCtx: AudioContext | null = null;
let swRegistration: ServiceWorkerRegistration | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

// Desbloqueia o AudioContext com qualquer interação prévia do usuário na janela
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  };
  window.addEventListener('click', unlockAudio, { passive: true });
  window.addEventListener('keydown', unlockAudio, { passive: true });
  window.addEventListener('touchstart', unlockAudio, { passive: true });
}

/**
 * Inicializa o Service Worker para garantir suporte a notificações mesmo em segundo plano
 */
export async function initServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    swRegistration = await navigator.serviceWorker.register('/sw.js');
    return swRegistration;
  } catch (err) {
    console.warn('[ServiceWorker Register Error]:', err);
    return null;
  }
}

/**
 * Sinal sonoro para MENSAGEM DO CLIENTE em atendimentos ATIVOS com o operador
 * (Toque duplo suave de mensageria: D5 [587Hz] -> A5 [880Hz])
 */
export function playClientMessageSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Nota 1: D5 (587.33 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.25, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.16);

    // Nota 2: A5 (880.00 Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880.00, now + 0.09);
    gain2.gain.setValueAtTime(0.28, now + 0.09);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.09);
    osc2.stop(now + 0.35);
  } catch (err) {
    console.warn('[Audio Play Client Message Error]:', err);
  }
}

/**
 * Sinal sonoro DIFERENTE para clientes na FILA DE ESPERA (esperando atendimento)
 * (Toque de recepção / sino de entrada: acorde tripartite E5 -> C5 -> E5 com timbre encorpado)
 */
export function playQueueAlertSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const notes = [
      { freq: 659.25, time: 0.0, dur: 0.22 },  // E5
      { freq: 523.25, time: 0.14, dur: 0.22 }, // C5
      { freq: 659.25, time: 0.28, dur: 0.35 }, // E5
    ];

    notes.forEach(({ freq, time, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = now + time;

      osc.type = 'triangle'; // Timbre estilo sino / chime
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.22, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + dur);
    });
  } catch (err) {
    console.warn('[Audio Play Queue Alert Error]:', err);
  }
}

/**
 * Retorna o status atual da permissão de notificação
 */
export function getNotificationPermissionStatus(): NotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
  return Notification.permission;
}

/**
 * Solicita permissão ao navegador para exibir notificações do SO
 */
export async function requestDesktopNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  try {
    const res = await Notification.requestPermission();
    return res;
  } catch {
    return Notification.permission;
  }
}

/**
 * Verifica se a permissão de notificação no desktop já foi concedida
 */
export function isDesktopNotificationGranted(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted';
}

const recentDesktopNotifs = new Map<string, number>();

/**
 * Dispara uma notificação nativa no Sistema Operacional (Windows / macOS / Linux).
 * No Windows, isso faz surgir o banner nativo no canto inferior direito da tela.
 */
export async function showDesktopNotification(
  title: string,
  body: string,
  data?: any,
  onClick?: () => void
) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const notifTag = data?.messageId
    ? `sol-msg-${data.messageId}`
    : data?.conversationId
    ? `sol-chat-${data.conversationId}`
    : `sol-notif-${title}`;

  // Prevenção contra disparos duplicados em rajada (anti-duplicação)
  const now = Date.now();
  for (const [tag, ts] of recentDesktopNotifs.entries()) {
    if (now - ts > 15000) recentDesktopNotifs.delete(tag);
  }

  if (recentDesktopNotifs.has(notifTag)) {
    return;
  }
  recentDesktopNotifs.set(notifTag, now);

  const notifOptions: NotificationOptions = {
    body,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: notifTag,
    data: data || {},
    requireInteraction: true, // Mantém a notificação na tela do Windows até o usuário interagir
    silent: false, // OBRIGATÓRIO no Windows para exibir o popup banner nativo (toast) na área de trabalho!
  };

  try {
    // 1. Prioriza Service Worker se estiver disponível (método padrão no Windows / Chrome / Edge)
    if ('serviceWorker' in navigator) {
      if (!swRegistration) {
        swRegistration = await navigator.serviceWorker.ready.catch(() => null);
      }
      if (swRegistration) {
        await swRegistration.showNotification(title, notifOptions);
        return;
      }
    }

    // 2. Fallback direto via construtor Notification do navegador
    const notif = new Notification(title, notifOptions);
    if (onClick) {
      notif.onclick = (event) => {
        event.preventDefault();
        window.focus();
        onClick();
        notif.close();
      };
    }
  } catch (err) {
    console.warn('[Desktop Notification Error]:', err);
    try {
      const simpleNotif = new Notification(title, {
        body,
        icon: '/favicon.svg',
      });
      if (onClick) {
        simpleNotif.onclick = () => {
          window.focus();
          onClick();
          simpleNotif.close();
        };
      }
    } catch (e) {
      console.error('[Fallback Desktop Notification Failed]:', e);
    }
  }
}

/**
 * Pisca o título da aba do navegador para alertar o operador na barra de tarefas do Windows
 */
let originalDocTitle = typeof document !== 'undefined' ? document.title : 'SOL Atendimento';
let flashTimer: any = null;

export function flashDocumentTitle(message: string) {
  if (typeof document === 'undefined') return;
  if (document.hasFocus()) return;

  if (flashTimer) clearInterval(flashTimer);
  let isOriginal = false;
  originalDocTitle = document.title.replace(/^[🔔💬]\s*/, '') || 'SOL Atendimento';

  flashTimer = setInterval(() => {
    if (document.hasFocus()) {
      stopFlashingTitle();
      return;
    }
    document.title = isOriginal ? originalDocTitle : `🔔 ${message}`;
    isOriginal = !isOriginal;
  }, 1000);

  const onFocus = () => {
    stopFlashingTitle();
    window.removeEventListener('focus', onFocus);
  };
  window.addEventListener('focus', onFocus);
}

export function stopFlashingTitle() {
  if (flashTimer) {
    clearInterval(flashTimer);
    flashTimer = null;
  }
  if (typeof document !== 'undefined') {
    document.title = originalDocTitle;
  }
}
