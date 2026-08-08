import React, { memo, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FAQ_CATEGORIES, FAQ_ITEMS } from '../model/supportData';
import './FaqWorkspace.scss';

function SearchIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="6.4" stroke="currentColor" strokeWidth="1.7"/><path d="M16 16L20 20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;
}

function ChevronIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 10L12 14L16 10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

function ChatIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5.5 7.8C5.5 6.03 6.93 4.6 8.7 4.6H15.3C17.07 4.6 18.5 6.03 18.5 7.8V12.2C18.5 13.97 17.07 15.4 15.3 15.4H10.2L6.4 18.4V15.2C5.84 14.62 5.5 13.83 5.5 12.96V7.8Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>;
}

function SparkIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4.5L13.4 8.6L17.5 10L13.4 11.4L12 15.5L10.6 11.4L6.5 10L10.6 8.6L12 4.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M18 15L18.7 17.3L21 18L18.7 18.7L18 21L17.3 18.7L15 18L17.3 17.3L18 15Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>;
}

function CheckIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7.5 12.2L10.6 15.3L16.8 9.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

function FaqWorkspace() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [openedId, setOpenedId] = useState(FAQ_ITEMS[0].id);
  const [feedback, setFeedback] = useState({});

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return FAQ_ITEMS.filter((item) => {
      const categoryMatch = category === 'all' || item.category === category;
      const queryMatch = !normalized || `${item.question} ${item.answer}`.toLowerCase().includes(normalized);
      return categoryMatch && queryMatch;
    });
  }, [category, query]);

  const popularItems = useMemo(() => FAQ_ITEMS.filter((item) => item.popular).slice(0, 5), []);

  return (
    <div className="support-faq">
      <section className="support-faq__hero">
        <div className="support-faq__heroCopy">
          <span className="support-faq__eyebrow"><SparkIcon /> Центр помощи</span>
          <h2>Как можем помочь?</h2>
          <p>Быстрые ответы по работе кабинета. Если вопрос не решился — команда поддержки доступна в чате.</p>
        </div>

        <div className="support-faq__search">
          <SearchIcon />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по вопросам, функциям и настройкам"
            aria-label="Поиск по FAQ"
          />
          {query ? <button type="button" onClick={() => setQuery('')}>Очистить</button> : null}
        </div>
      </section>

      <div className="support-faq__layout">
        <aside className="support-faq__aside">
          <div className="support-faq__categoryCard">
            <span className="support-faq__asideLabel">Разделы</span>
            <div className="support-faq__categories">
              {FAQ_CATEGORIES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={category === item.id ? 'is-active' : ''}
                  onClick={() => setCategory(item.id)}
                >
                  <span>{item.label}</span>
                  <em>{item.id === 'all' ? FAQ_ITEMS.length : FAQ_ITEMS.filter((faq) => faq.category === item.id).length}</em>
                </button>
              ))}
            </div>
          </div>

          <div className="support-faq__popularCard">
            <span className="support-faq__asideLabel">Часто ищут</span>
            {popularItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setCategory('all');
                  setQuery('');
                  setOpenedId(item.id);
                }}
              >
                <span>{item.question}</span>
                <ChevronIcon />
              </button>
            ))}
          </div>
        </aside>

        <main className="support-faq__main">
          <section className="support-faq__listCard">
            <div className="support-faq__listHead">
              <div>
                <span>FAQ</span>
                <h3>{category === 'all' ? 'Популярные вопросы' : FAQ_CATEGORIES.find((item) => item.id === category)?.label}</h3>
              </div>
              <em>{filteredItems.length} ответов</em>
            </div>

            <div className="support-faq__list">
              {filteredItems.length ? filteredItems.map((item) => {
                const isOpen = openedId === item.id;
                const reaction = feedback[item.id];

                return (
                  <article className={`support-faq__item ${isOpen ? 'is-open' : ''}`} key={item.id}>
                    <button
                      type="button"
                      className="support-faq__question"
                      aria-expanded={isOpen}
                      onClick={() => setOpenedId((current) => current === item.id ? null : item.id)}
                    >
                      <span>{item.question}</span>
                      <i><ChevronIcon /></i>
                    </button>

                    <div className="support-faq__answerWrap" aria-hidden={!isOpen}>
                      <div className="support-faq__answer">
                        <p>{item.answer}</p>
                        <div className="support-faq__feedback">
                          {reaction ? (
                            <span><CheckIcon /> Спасибо за обратную связь</span>
                          ) : (
                            <>
                              <span>Ответ помог?</span>
                              <button type="button" onClick={() => setFeedback((current) => ({ ...current, [item.id]: 'yes' }))}>Да</button>
                              <button type="button" onClick={() => setFeedback((current) => ({ ...current, [item.id]: 'no' }))}>Не совсем</button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              }) : (
                <div className="support-faq__empty">
                  <SearchIcon />
                  <h3>Ничего не нашли</h3>
                  <p>Попробуйте изменить запрос или сразу напишите технической поддержке.</p>
                  <button type="button" onClick={() => navigate('/chat?channel=technical')}>Открыть чат поддержки</button>
                </div>
              )}
            </div>
          </section>

          <section className="support-faq__cta">
            <div className="support-faq__ctaIcon"><ChatIcon /></div>
            <div>
              <span>Нужна помощь человека?</span>
              <h3>Менеджер и техническая поддержка — в одном чате</h3>
              <p>Выберите, с кем хотите поговорить. История диалогов сохраняется отдельно для каждого канала.</p>
            </div>
            <div className="support-faq__ctaActions">
              <button type="button" onClick={() => navigate('/chat?channel=manager')}>Написать менеджеру</button>
              <button type="button" className="is-primary" onClick={() => navigate('/chat?channel=technical')}>Техническая поддержка</button>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

export default memo(FaqWorkspace);
