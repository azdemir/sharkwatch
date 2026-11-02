import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { AlertJson } from '../../shared/alerts.ts';
import type { SessionEvent } from '../../shared/events.ts';
import { api } from './api.ts';
import { initialSession, sessionReducer } from './sessionState.ts';

/** Connects to a session's event stream and folds it into state. */
export function useSession() {
  const [state, dispatch] = useReducer(sessionReducer, initialSession);
  const source = useRef<EventSource | null>(null);

  const close = useCallback(() => {
    source.current?.close();
    source.current = null;
  }, []);

  const connect = useCallback(
    (sessionId: string) => {
      close();
      dispatch({ type: 'connecting', sessionId });
      const es = new EventSource(api.eventsUrl(sessionId));
      es.onmessage = (message) => dispatch({ type: 'event', event: JSON.parse(message.data) as SessionEvent });
      es.onerror = () => {
        // EventSource retries on its own; only a closed stream is final.
        if (es.readyState === EventSource.CLOSED) dispatch({ type: 'error', message: 'Lost connection to the server' });
      };
      source.current = es;
    },
    [close],
  );

  const reset = useCallback(() => {
    close();
    dispatch({ type: 'reset' });
  }, [close]);

  useEffect(() => {
    if (state.status === 'ended') close();
  }, [state.status, close]);

  useEffect(() => close, [close]);

  // Alerts outlive the patrol that raised them (acknowledgements, escalations, the all-clear), so
  // follow the server-wide alert stream for as long as this session is on screen.
  useEffect(() => {
    if (!state.sessionId) return;
    const es = new EventSource(api.alertsStreamUrl());
    es.onmessage = (message) => dispatch({ type: 'alert', alert: JSON.parse(message.data) as AlertJson });
    return () => es.close();
  }, [state.sessionId]);

  return { state, connect, reset };
}
