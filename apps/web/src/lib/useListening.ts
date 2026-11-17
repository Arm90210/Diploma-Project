import { useEffect, useRef, type RefObject } from 'react';
import { api, ApiError } from './api';
import type { Track } from './catalog';

export type ListenSource = 'CATALOG' | 'SEARCH' | 'PLAYLIST' | 'RECOMMENDATION';
type SessionView = { id: string; heartbeatIntervalMs: number; counted: boolean };
type Active = { trackId: string; id: string | null; starting: boolean; sequence: number; counted: boolean; dead: boolean; queue: Promise<unknown>; heartbeatMs: number };

// Reports playback to the server (signed-in users, catalog tracks only). The server
// decides what counts (policy listen-v1); this hook only reports facts: a sequence
// number, the media position and whether audio is playing. Heartbeats go every
// 10 s while playing and on play, pause, seek and end. Requests for one session are
// chained so they arrive in order. A session starts on the first actual playback,
// not when a track is merely selected.
export function useListening(audio: RefObject<HTMLAudioElement | null>, current: Track | null, enabled: boolean, source: () => ListenSource, onCounted: (trackId: string) => void) {
  const active = useRef<Active | null>(null);
  const lastPosition = useRef(0); // last position before a seek started
  const seeking = useRef(false);
  const sourceRef = useRef(source); sourceRef.current = source;
  const countedRef = useRef(onCounted); countedRef.current = onCounted;

  useEffect(() => {
    const element = audio.current;
    const track = current;
    if (!element || !track || track.local || !enabled) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const position = () => Math.max(0, Math.round(element.currentTime * 1000));
    const send = (session: Active, path: string, body: unknown) => {
      session.queue = session.queue.then(async () => {
        if (!session.id || session.dead) return;
        try {
          const result = await api<{ session: SessionView }>(`/listening/sessions/${session.id}${path}`, 'POST', body);
          if (result.session.counted && !session.counted) { session.counted = true; countedRef.current(session.trackId); }
        } catch (error) {
          // Ended, expired or unknown session: stop using it; the next play starts a new one.
          if (error instanceof ApiError && [401, 404, 409].includes(error.status)) session.dead = true;
        }
      });
    };
    const beat = (playing: boolean, at = position()) => {
      const session = active.current;
      if (!session || session.trackId !== track.id || !session.id) return;
      session.sequence += 1;
      send(session, '/heartbeats', { sequence: session.sequence, positionMs: at, playing });
    };
    const stopTimer = () => { if (timer) clearInterval(timer); timer = undefined; };
    const startTimer = () => { stopTimer(); const session = active.current; if (session) timer = setInterval(() => { if (!element.paused) beat(true); }, session.heartbeatMs); };

    const onPlaying = () => {
      let session = active.current;
      if (session && session.trackId === track.id && !session.dead) { if (session.id) { beat(true); startTimer(); } return; }
      session = { trackId: track.id, id: null, starting: true, sequence: 0, counted: false, dead: false, queue: Promise.resolve(), heartbeatMs: 10_000 };
      active.current = session;
      const started = session;
      api<{ session: SessionView }>('/listening/sessions', 'POST', { trackId: track.id, source: sourceRef.current() })
        .then(result => {
          started.id = result.session.id; started.heartbeatMs = result.session.heartbeatIntervalMs; started.starting = false;
          if (active.current === started) { beat(!element.paused); if (!element.paused) startTimer(); }
        })
        .catch(() => { started.dead = true; }); // listening still works; this play just isn't recorded
    };
    const onPause = () => { if (!seeking.current) { beat(false); stopTimer(); } };
    const onTimeUpdate = () => { if (!seeking.current) lastPosition.current = position(); };
    // Report the pre-seek position first, so playback up to the seek is credited;
    // the jump itself earns nothing on the server.
    const onSeeking = () => { if (!seeking.current) { seeking.current = true; if (!element.paused) beat(true, lastPosition.current); } };
    const onSeeked = () => { seeking.current = false; lastPosition.current = position(); beat(!element.paused); };
    const onEnded = () => {
      stopTimer();
      const session = active.current;
      if (session?.trackId === track.id && session.id) { session.sequence += 1; send(session, '/end', { sequence: session.sequence, positionMs: position(), playing: false }); active.current = null; }
    };
    const events: [string, () => void][] = [['playing', onPlaying], ['pause', onPause], ['timeupdate', onTimeUpdate], ['seeking', onSeeking], ['seeked', onSeeked], ['ended', onEnded]];
    events.forEach(([name, handler]) => element.addEventListener(name, handler));
    if (!element.paused && element.currentSrc) onPlaying();
    return () => {
      events.forEach(([name, handler]) => element.removeEventListener(name, handler));
      stopTimer();
      // Track changed, signed out or unmounted: close the session. Time since the last
      // heartbeat (at most ~10 s) is not credited — a conservative choice.
      const session = active.current;
      if (session && session.trackId === track.id) {
        active.current = null;
        if (session.id) send(session, '/end', {});
        else session.dead = true;
      }
      seeking.current = false;
    };
  }, [audio, current?.id, current?.local, enabled]);
}
