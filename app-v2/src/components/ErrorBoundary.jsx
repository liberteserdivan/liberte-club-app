import React from "react";
import { hideNativeSplash } from "../lib/nativeSplash.js";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || "Beklenmeyen hata" };
  }

  componentDidCatch() {
    hideNativeSplash();
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, fontFamily: "sans-serif" }}>
          <h2>Bir sorun olustu</h2>
          <p>{this.state.message}</p>
          <button type="button" onClick={() => window.location.reload()}>Yeniden dene</button>
        </div>
      );
    }
    return this.props.children;
  }
}