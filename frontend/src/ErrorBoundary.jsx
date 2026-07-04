import { Component } from 'react';

export default class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('App crashed:', error, info); }
  render() {
    if (this.state.error) {
      return (
        <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
            <p className="mb-4 text-gray-400">We've logged this and will investigate.</p>
            <button onClick={() => window.location.reload()} className="px-4 py-2 bg-indigo-600 rounded">
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
