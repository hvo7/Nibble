import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  render() { return this.state.error ? <div className="startup"><h1>Let’s get Nibble back.</h1><p>{this.state.error}</p><button onClick={() => location.reload()}>Reload Nibble</button></div> : this.props.children; }
}
createRoot(document.getElementById('root')!).render(<ErrorBoundary>{import.meta.env.MODE === 'staging' && <div className="staging-banner" role="status">Nibble staging · Separate test recipes · Production has not been updated</div>}<App/></ErrorBoundary>);
