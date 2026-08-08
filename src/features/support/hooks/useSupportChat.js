import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getSupportSnapshot,
  saveSupportPreference,
  sendSupportMessage,
} from '../../../services/support/supportService';
import { SUPPORT_QUICK_ACTIONS } from '../model/supportData';

const VALID_CHANNELS = new Set(['manager', 'technical']);

function formatTime(date = new Date()) {
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default function useSupportChat() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedChannel = searchParams.get('channel');
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState([]);
  const mountedRef = useRef(true);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getSupportSnapshot();
      if (!mountedRef.current) return;

      const nextChannel = VALID_CHANNELS.has(requestedChannel)
        ? requestedChannel
        : data.activeChannel;

      setSnapshot({ ...data, activeChannel: nextChannel });
    } catch {
      if (mountedRef.current) setError('Не удалось открыть чат поддержки.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [requestedChannel]);

  useEffect(() => {
    load();
  }, [load]);

  const activeChannelId = snapshot?.activeChannel || 'manager';

  const activeChannel = useMemo(
    () => snapshot?.channels?.find((channel) => channel.id === activeChannelId) || null,
    [activeChannelId, snapshot?.channels],
  );

  const messages = useMemo(
    () => [...(snapshot?.threads?.[activeChannelId] || [])].sort((a, b) => a.createdAt - b.createdAt),
    [activeChannelId, snapshot?.threads],
  );

  const quickActions = SUPPORT_QUICK_ACTIONS[activeChannelId] || [];

  const selectChannel = useCallback(async (channelId) => {
    if (!snapshot || !VALID_CHANNELS.has(channelId) || channelId === activeChannelId) return;

    const previous = snapshot;
    const optimistic = { ...snapshot, activeChannel: channelId };
    setSnapshot(optimistic);
    setDraft('');
    setAttachments([]);
    setSearchParams({ channel: channelId }, { replace: true });

    try {
      const result = await saveSupportPreference(channelId, optimistic);
      if (mountedRef.current && result?.snapshot) {
        setSnapshot({ ...result.snapshot, activeChannel: channelId });
      }
    } catch {
      if (mountedRef.current) setSnapshot(previous);
    }
  }, [activeChannelId, setSearchParams, snapshot]);

  const addAttachments = useCallback((files) => {
    const mapped = Array.from(files || []).slice(0, 5).map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}`,
      name: file.name,
      size: file.size,
      type: file.type,
    }));

    setAttachments((current) => {
      const unique = new Map([...current, ...mapped].map((item) => [item.id, item]));
      return Array.from(unique.values()).slice(0, 5);
    });
  }, []);

  const removeAttachment = useCallback((attachmentId) => {
    setAttachments((current) => current.filter((item) => item.id !== attachmentId));
  }, []);

  const send = useCallback(async (overrideText) => {
    if (!snapshot || sending) return false;
    const text = (overrideText ?? draft).trim();
    if (!text && !attachments.length) return false;

    const message = {
      id: `local-${Date.now()}`,
      from: 'client',
      text,
      attachments,
      time: formatTime(),
      createdAt: Date.now(),
      delivered: true,
    };

    const previous = snapshot;
    const optimistic = {
      ...snapshot,
      threads: {
        ...snapshot.threads,
        [activeChannelId]: [...(snapshot.threads[activeChannelId] || []), message],
      },
    };

    setSnapshot(optimistic);
    setDraft('');
    setAttachments([]);
    setSending(true);

    try {
      const result = await sendSupportMessage(activeChannelId, message, optimistic);
      if (mountedRef.current && result?.snapshot) setSnapshot(result.snapshot);
      return true;
    } catch {
      if (mountedRef.current) {
        setSnapshot(previous);
        setDraft(text);
        setAttachments(message.attachments || []);
      }
      return false;
    } finally {
      if (mountedRef.current) setSending(false);
    }
  }, [activeChannelId, attachments, draft, sending, snapshot]);

  return {
    snapshot,
    loading,
    error,
    reload: load,
    activeChannelId,
    activeChannel,
    messages,
    quickActions,
    selectChannel,
    draft,
    setDraft,
    attachments,
    addAttachments,
    removeAttachment,
    sending,
    send,
  };
}
