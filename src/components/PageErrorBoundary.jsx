import React from 'react';
import { recordRuntimeIssue } from '@/utils/appDiagnostics';

export default class PageErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    const pageName = this.props.pageName || 'Unknown page';
    console.error('Pathfinder page crashed:', pageName, error, info);
    recordRuntimeIssue({
      type: 'react_page_crash',
      page: pageName,
      message: error,
      error,
      stack: `${error?.stack || ''}\n${info?.componentStack || ''}`,
    });
  }

  componentDidUpdate(prevProps) {
    if (prevProps.pageName !== this.props.pageName && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    const message = this.state.error?.message || 'An unexpected runtime error occurred.';
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-slate-950 p-6 text-slate-100">
        <div className="w-full max-w-xl rounded-2xl border border-red-700/60 bg-slate-900 p-6 shadow-2xl">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-red-400">Page Error</div>
          <h2 className="mt-2 text-xl font-black">{this.props.pageName || 'This page'} could not load</h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">{message}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={() => this.setState({ error: null })} className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-bold hover:bg-slate-700">Try Again</button>
            <button type="button" onClick={() => window.location.reload()} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-600">Reload Pathfinder</button>
          </div>
        </div>
      </div>
    );
  }
}
