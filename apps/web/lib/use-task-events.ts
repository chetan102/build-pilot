'use client';

import { useState, useEffect, useRef } from 'react';
import { getTaskEventsStreamUrl } from './api-client';


export interface TaskEvent {
  _id?: string;
  type: string;
  taskId: string;
  runId?: string;
  payload?: Record<string, any>;
  level?: 'info' | 'warn' | 'error' | 'debug';
  timestamp?: string;
}

export function useTaskEvents(taskId: string | undefined) {
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!taskId) return;

    const targetTaskId = taskId;
    let isMounted = true;
    let retryDelay = 1000;

    function connect() {
      if (!isMounted) return;

      try {
        const streamUrl = getTaskEventsStreamUrl(targetTaskId);
        const es = new EventSource(streamUrl);
        eventSourceRef.current = es;

        es.onopen = () => {
          if (!isMounted) return;
          setIsConnected(true);
          setError(null);
          retryDelay = 1000; // Reset backoff on successful open
        };

        es.onmessage = (event) => {
          if (!isMounted) return;
          try {
            const parsed = JSON.parse(event.data);
            if (parsed.type === 'CONNECTED') return;
            setEvents((prev) => {
              // Deduplicate events by _id if present
              if (parsed._id && prev.some((e) => e._id === parsed._id)) {
                return prev;
              }
              return [...prev, parsed];
            });
          } catch {
            // Ignore parse errors on ping / comments
          }
        };

        es.onerror = () => {
          if (!isMounted) return;
          setIsConnected(false);
          es.close();

          // Schedule exponential reconnect
          const delay = Math.min(retryDelay, 10000);
          retryDelay = Math.min(retryDelay * 2, 10000);
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        };
      } catch (err: any) {
        if (!isMounted) return;
        setError(err.message || 'Failed to establish event stream');
      }
    }

    connect();

    return () => {
      isMounted = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [taskId]);

  return { events, isConnected, error };
}
