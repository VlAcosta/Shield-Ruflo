import React, { memo, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useSupportChat from '../hooks/useSupportChat';
import './SupportChatWorkspace.scss';
import useAccessControl from '../../access/hooks/useAccessControl';

function ChatIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 7.5C5 5.57 6.57 4 8.5 4H15.5C17.43 4 19 5.57 19 7.5V12.5C19 14.43 17.43 16 15.5 16H10L6 19V16.15C5.4 15.52 5 14.66 5 13.7V7.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>;
}

function HeadsetIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5.5 12V10.5C5.5 6.91 8.41 4 12 4C15.59 4 18.5 6.91 18.5 10.5V12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><path d="M5.5 11H7.5V16H5.5C4.67 16 4 15.33 4 14.5V12.5C4 11.67 4.67 11 5.5 11Z" stroke="currentColor" strokeWidth="1.7"/><path d="M18.5 11H16.5V16H18.5C19.33 16 20 15.33 20 14.5V12.5C20 11.67 19.33 11 18.5 11Z" stroke="currentColor" strokeWidth="1.7"/><path d="M16.5 16C16.5 18 15 19 13.5 19H12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;
}

function PaperclipIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9.4 12.8L14.2 8C15.4 6.8 17.3 6.8 18.5 8C19.7 9.2 19.7 11.1 18.5 12.3L11.4 19.4C9.6 21.2 6.7 21.2 4.9 19.4C3.1 17.6 3.1 14.7 4.9 12.9L11.5 6.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

function SendIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 5L10.5 14.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><path d="M20 5L14 19L10.5 14.5L6 11L20 5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>;
}

function PinIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8.5 5.5L14.8 11.8L13.2 13.4L15.6 15.8L14.5 16.9L12.1 14.5L7.5 19.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

function CloseIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 8L16 16M16 8L8 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;
}

function FileIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 4.8H13.2L17 8.6V19.2H7V4.8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M13 5V9H17" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>;
}

function ArrowIcon() {
  return <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M5 3.5L9.5 8L5 12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

function formatFileSize(size = 0) {
  if (size < 1024) return `${size} Б`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} КБ`;
  return `${(size / 1024 / 1024).toFixed(1)} МБ`;
}

function SupportChatWorkspace() {
  const access = useAccessControl();
  const canWrite = access.can('support.write');
  const navigate = useNavigate();
  const chat = useSupportChat();
  const [showPinned, setShowPinned] = useState(true);
  const [quickOpen, setQuickOpen] = useState(false);
  const messageListRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    setShowPinned(true);
    setQuickOpen(false);
  }, [chat.activeChannelId]);

  useEffect(() => {
    const node = messageListRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
  }, [chat.messages.length, chat.activeChannelId]);

  if (chat.loading) {
    return (
      <div className="support-chat-skeleton" aria-label="Загрузка поддержки">
        <span className="support-chat-skeleton__sidebar" />
        <span className="support-chat-skeleton__header" />
        <span className="support-chat-skeleton__body" />
        <span className="support-chat-skeleton__input" />
      </div>
    );
  }

  if (chat.error || !chat.snapshot || !chat.activeChannel) {
    return (
      <section className="support-chat-error">
        <span>!</span>
        <div>
          <h2>Чат поддержки временно недоступен</h2>
          <p>{chat.error || 'Не удалось получить историю диалогов.'}</p>
        </div>
        <button type="button" onClick={chat.reload}>Повторить</button>
      </section>
    );
  }

  const handleQuickAction = (item) => {
    if (item.action === 'route') {
      navigate(item.value);
      return;
    }

    chat.setDraft(item.value);
    setQuickOpen(false);
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const handleSubmit = async () => {
    if (!canWrite) return;
    const sent = await chat.send();
    if (sent) setQuickOpen(false);
  };

  return (
    <div className={`support-chat support-chat--${chat.activeChannel.tone}`}>
      <aside className="support-chat__channels">
        <div className="support-chat__channelsHead">
          <span>Поддержка</span>
          <h2>Кому написать?</h2>
          <p>Диалоги разделены, чтобы вопросы не смешивались.</p>
        </div>

        <div className="support-chat__channelList">
          {chat.snapshot.channels.map((channel) => {
            const active = channel.id === chat.activeChannelId;
            const lastMessage = chat.snapshot.threads[channel.id]?.at(-1);

            return (
              <button
                key={channel.id}
                type="button"
                className={`support-chat__channel ${active ? 'is-active' : ''} is-${channel.tone}`}
                onClick={() => chat.selectChannel(channel.id)}
              >
                <span className="support-chat__channelAvatar">{channel.initials}</span>
                <span className="support-chat__channelCopy">
                  <strong>{channel.shortTitle}</strong>
                  <small>{channel.status}</small>
                  <em>{lastMessage?.text || channel.description}</em>
                </span>
                <span className="support-chat__channelArrow"><ArrowIcon /></span>
              </button>
            );
          })}
        </div>

        <div className="support-chat__faqLink">
          <div><HeadsetIcon /></div>
          <span>
            <strong>Возможно, ответ уже есть</strong>
            <small>Посмотрите частые вопросы перед обращением.</small>
          </span>
          <button type="button" onClick={() => navigate('/faq')}>FAQ</button>
        </div>
      </aside>

      <section className="support-chat__conversation">
        <header className="support-chat__header">
          <div className="support-chat__person">
            <div className={`support-chat__avatar is-${chat.activeChannel.tone}`}>{chat.activeChannel.initials}</div>
            <div>
              <div className="support-chat__personName">
                <strong>{chat.activeChannel.title}</strong>
                <span className="support-chat__onlineDot" />
              </div>
              <p>{chat.activeChannel.name} · {chat.activeChannel.responseTime}</p>
            </div>
          </div>

          <div className="support-chat__headerMeta">
            <span>{chat.activeChannel.role}</span>
            <small>{chat.activeChannel.description}</small>
          </div>
        </header>

        {showPinned ? (
          <div className="support-chat__pinned">
            <PinIcon />
            <div>
              <strong>Перед началом</strong>
              <p>{chat.activeChannel.pinned}</p>
            </div>
            <button type="button" onClick={() => setShowPinned(false)} aria-label="Скрыть закреплённое сообщение"><CloseIcon /></button>
          </div>
        ) : null}

        <div className="support-chat__messages" ref={messageListRef}>
          <div className="support-chat__day"><span>Сегодня</span></div>

          {chat.messages.map((message) => (
            <article
              key={message.id}
              className={`support-chat__message ${message.from === 'client' ? 'is-client' : 'is-support'}`}
            >
              {message.from === 'support' ? (
                <div className={`support-chat__messageAvatar is-${chat.activeChannel.tone}`}>{chat.activeChannel.initials}</div>
              ) : null}

              <div className="support-chat__messageContent">
                {message.text ? <div className="support-chat__bubble">{message.text}</div> : null}
                {message.attachments?.length ? (
                  <div className="support-chat__messageFiles">
                    {message.attachments.map((file) => (
                      <div key={file.id}><FileIcon /><span><strong>{file.name}</strong><small>{formatFileSize(file.size)}</small></span></div>
                    ))}
                  </div>
                ) : null}
                <div className="support-chat__time">{message.time}{message.from === 'client' && message.delivered ? ' · ✓✓' : ''}</div>
              </div>
            </article>
          ))}
        </div>

        {quickOpen ? (
          <div className="support-chat__quickActions">
            {chat.quickActions.map((item) => (
              <button key={item.id} type="button" onClick={() => handleQuickAction(item)}>
                <span>{item.label}</span>
                <ArrowIcon />
              </button>
            ))}
          </div>
        ) : null}

        <footer className="support-chat__composer">
          {!canWrite ? <div className="support-chat__access-note">Только просмотр · ваша роль не разрешает отправлять сообщения</div> : null}
          {chat.attachments.length ? (
            <div className="support-chat__attachments">
              {chat.attachments.map((file) => (
                <div key={file.id}>
                  <FileIcon />
                  <span><strong>{file.name}</strong><small>{formatFileSize(file.size)}</small></span>
                  <button type="button" onClick={() => chat.removeAttachment(file.id)} aria-label={`Удалить ${file.name}`}><CloseIcon /></button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="support-chat__composerRow">
            <button
              type="button"
              className={`support-chat__quickButton ${quickOpen ? 'is-active' : ''}`}
              onClick={() => canWrite && setQuickOpen((value) => !value)} disabled={!canWrite}
              aria-label="Быстрые действия"
            >
              <ChatIcon />
            </button>

            <div className="support-chat__textareaWrap">
              <textarea
                ref={textareaRef}
                rows="1"
                value={chat.draft}
                onChange={(event) => canWrite && chat.setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder={!canWrite ? 'Только просмотр — отправка сообщений ограничена ролью' : chat.activeChannelId === 'technical' ? 'Опишите проблему... Enter — отправить, Shift+Enter — новая строка' : 'Напишите менеджеру... Enter — отправить'}
                readOnly={!canWrite}
              />
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(event) => {
                chat.addAttachments(event.target.files);
                event.target.value = '';
              }}
            />
            <button type="button" className="support-chat__attachButton" onClick={() => canWrite && fileInputRef.current?.click()} disabled={!canWrite} aria-label="Прикрепить файлы"><PaperclipIcon /></button>
            <button
              type="button"
              className="support-chat__sendButton"
              onClick={handleSubmit}
              disabled={!canWrite || chat.sending || (!chat.draft.trim() && !chat.attachments.length)}
              aria-label="Отправить сообщение"
            >
              <SendIcon />
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

export default memo(SupportChatWorkspace);
