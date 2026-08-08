import React from 'react';
import './AppErrorBoundary.scss';

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('business-shield:runtime-error', {
        detail: {
          message: error?.message || 'Unknown UI error',
          stack: error?.stack || '',
          componentStack: info?.componentStack || '',
          pathname: window.location.pathname,
          occurredAt: new Date().toISOString(),
        },
      }));
    }
  }

  handleReload = () => window.location.reload();

  handleHome = () => {
    window.location.assign('/dashboard');
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="app-error-boundary" role="alert">
        <section className="app-error-boundary__card">
          <span className="app-error-boundary__eyebrow">RECOVERY MODE</span>
          <div className="app-error-boundary__mark">!</div>
          <h1>Интерфейс не смог продолжить работу</h1>
          <p>Данные не удалены. Обновите экран; если ошибка повторится, событие можно передать в техническую поддержку.</p>
          <div className="app-error-boundary__actions">
            <button type="button" onClick={this.handleReload}>Обновить страницу</button>
            <button type="button" className="is-secondary" onClick={this.handleHome}>На главную</button>
          </div>
          <details>
            <summary>Технические детали</summary>
            <code>{this.state.error?.message || 'Неизвестная ошибка'}</code>
          </details>
        </section>
      </main>
    );
  }
}
