import React from 'react';
import { hideNativeSplash } from '../lib/nativeSplash.js';
import { reportError } from '../lib/errorHub.js';

// Beklenmeyen hatalarda siyah ekran yerine mesaj gösterir
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, traceId: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    hideNativeSplash();
    // reportError izlenebilir bir kayıt id'si döndürür; kullanıcıya kısa traceId
    // olarak gösterilir (destek/log eşleştirme için). PII içermez.
    const entry = reportError({
      source: 'react.errorBoundary',
      message: error?.message || 'Render error',
      userMessage: 'Uygulama beklenmedik bir hatayla karşılaştı.',
      detail: {
        stack: error?.stack ? String(error.stack).slice(0, 1200) : null,
        componentStack: info?.componentStack ? String(info.componentStack).slice(0, 1500) : null
      },
      showToast: false,
      persist: true
    });
    this.setState({ traceId: entry?.id || null });
  }

  render() {
    if (this.state.error) {
      return (
        <main className="errorFallback">
          <h1>Uygulama beklenmeyen bir hata aldı</h1>
          <p>Lütfen yeniden deneyin. Sorun sürerse uygulamayı kapatıp tekrar açın.</p>
          {this.state.traceId && <p className="errorTraceId">Hata kodu: {this.state.traceId}</p>}
          <button type="button" onClick={() => window.location.reload()}>Yeniden dene</button>
        </main>
      );
    }
    return this.props.children;
  }
}
