import React, { memo, useEffect, useRef, useState } from 'react';

function formatFileSize(size = 0) {
  if (size < 1024) return `${size} Б`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} КБ`;
  return `${(size / 1024 / 1024).toFixed(1)} МБ`;
}

function TicketConversation({ ticket, saving, onSend }) {
  const [mode, setMode] = useState('reply');
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [attachmentError, setAttachmentError] = useState('');
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    setText('');
    setAttachments([]);
    setAttachmentError('');
    setMode('reply');
  }, [ticket?.id]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [ticket?.id, ticket?.messages?.length]);

  if (!ticket) return null;

  const addAttachments = (files) => {
    const allowed = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain', 'text/csv', 'application/json']);
    const selected = Array.from(files || []);
    const invalid = selected.find((file) => file.size > 2 * 1024 * 1024 || !allowed.has(file.type));
    setAttachmentError(invalid ? 'PDF, JPG, PNG, WebP, TXT, CSV и JSON · до 2 МБ на файл.' : '');
    const mapped = selected
      .filter((file) => file.size > 0 && file.size <= 2 * 1024 * 1024 && allowed.has(file.type))
      .map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}`,
        name: file.name,
        size: file.size,
        type: file.type,
        file,
      }));
    setAttachments((current) => {
      const unique = new Map([...current, ...mapped].map((item) => [item.id, item]));
      return Array.from(unique.values()).slice(0, 5);
    });
  };

  const submit = async () => {
    const clean = text.trim();
    if ((!clean && !attachments.length) || saving) return;
    await onSend({
      text: clean,
      author: mode === 'note' ? 'Admin · заметка' : 'Admin',
      role: mode === 'note' ? 'admin' : 'agent',
      internal: mode === 'note',
      attachments,
    });
    setText('');
    setAttachments([]);
    setAttachmentError('');
  };

  return (
    <section className="admin-ticket-conversation">
      <div ref={scrollRef} className="admin-ticket-conversation__messages">
        {ticket.messages.map((message, index) => (
          <article
            key={message.id}
            className={`admin-ticket-message is-${message.internal ? 'note' : message.role}`}
            style={{ '--message-index': index }}
          >
            <span className="admin-ticket-message__avatar">
              {message.role === 'client' ? ticket.clientInitials : message.internal ? 'IN' : 'AD'}
            </span>
            <div>
              <header><strong>{message.author}</strong><time>{message.createdAt}</time>{message.internal ? <em>внутренняя</em> : null}</header>
              {message.text ? <p>{message.text}</p> : null}
              {message.attachments?.length ? (
                <div className="admin-ticket-message__attachments">
                  {message.attachments.map((file) => (
                    <a key={file.id} href={`/api/v1/admin/support/attachments/${file.id}`}>
                      <span>📎</span>
                      <strong>{file.name}</strong>
                      <small>{formatFileSize(file.size)}</small>
                    </a>
                  ))}
                </div>
              ) : null}
              {message.role !== 'client' && !message.internal ? <small>✓ Доставлено</small> : null}
            </div>
          </article>
        ))}
      </div>

      <div className={`admin-ticket-composer ${mode === 'note' ? 'is-note' : ''}`}>
        <div className="admin-ticket-composer__modes">
          <button type="button" className={mode === 'reply' ? 'is-active' : ''} onClick={() => setMode('reply')}>Ответ клиенту</button>
          <button type="button" className={mode === 'note' ? 'is-active' : ''} onClick={() => setMode('note')}>Внутренняя заметка</button>
        </div>
        <textarea
          rows="4"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={mode === 'note' ? 'Заметка будет видна только команде…' : 'Ответить клиенту…'}
          maxLength="3000"
        />
        {attachmentError ? <div className="admin-ticket-composer__fileError">{attachmentError}</div> : null}
        {attachments.length ? (
          <div className="admin-ticket-composer__files">
            {attachments.map((file) => (
              <span key={file.id}>
                📎 {file.name} · {formatFileSize(file.size)}
                <button type="button" onClick={() => setAttachments((current) => current.filter((item) => item.id !== file.id))}>×</button>
              </span>
            ))}
          </div>
        ) : null}
        <footer>
          <span><kbd>Enter</kbd> отправить · <kbd>Shift + Enter</kbd> новая строка</span>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.csv,.json"
              multiple
              hidden
              onChange={(event) => {
                addAttachments(event.target.files);
                event.target.value = '';
              }}
            />
            <button type="button" className="admin-ticket-composer__attach" onClick={() => fileInputRef.current?.click()} aria-label="Прикрепить файл">＋</button>
            <button type="button" className="admin-ticket-composer__send" onClick={submit} disabled={(!text.trim() && !attachments.length) || saving}>{saving ? 'Отправка…' : mode === 'note' ? 'Добавить заметку' : 'Отправить'}</button>
          </div>
        </footer>
      </div>
    </section>
  );
}

export default memo(TicketConversation);
