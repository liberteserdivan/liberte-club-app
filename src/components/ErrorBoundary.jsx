import React from 'react';

// Beklenmeyen hatalarda siyah ekran yerine mesaj gösterir
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <main className="errorFallback">
          <h1>Bir şeyler ters gitti</h1>
          <p>{this.state.error.message || 'Bilinmeyen hata'}</p>
          <button type="button" onClick={() => window.location.reload()}>Yeniden dene</button>
        </main>
      );
    }
    return this.props.children;
  }
}
