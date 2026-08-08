import React, { memo, useEffect, useRef, useState } from 'react';

function TicketConversation({ ticket, saving, onSend }) {
  const [mode, setMode] = useState('reply');
  const [text, setText] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    setText('');
    setMode('reply');
  }, [ticket?.id]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [ticket?.id, ticket?.messages?.length]);

  if (!ticket) return null;

  const submit = async () => {
    const clean = text.trim();
    if (!clean || saving) return;
    await onSend({
      text: clean,
      author: mode === 'note' ? 'Admin · заметка' : 'Admin',
      role: mode === 'note' ? 'admin' : 'agent',
      internal: mode === 'note',
    });
    setText('');
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
              <p>{message.text}</p>
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
        <footer>
          <span><kbd>Enter</kbd> отправить · <kbd>Shift + Enter</kbd> новая строка</span>
          <div>
            <button type="button" className="admin-ticket-composer__attach" aria-label="Прикрепить файл" title="Загрузка файлов будет подключена к backend">＋</button>
            <button type="button" className="admin-ticket-composer__send" onClick={submit} disabled={!text.trim() || saving}>{saving ? 'Отправка…' : mode === 'note' ? 'Добавить заметку' : 'Отправить'}</button>
          </div>
        </footer>
      </div>
    </section>
  );
}

export default memo(TicketConversation);
