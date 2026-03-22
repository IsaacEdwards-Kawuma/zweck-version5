import { Component } from "react";
import { Link } from "react-router-dom";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("Unhandled UI error", error, info);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const dev = import.meta.env.DEV;
      const msg = this.state.error?.message;

      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
          <div className="ui-surface max-w-md rounded-2xl p-6 text-center">
            <div className="text-lg font-semibold ui-page-heading">Something went wrong</div>
            <div className="mt-2 text-sm ui-body-text">
              The interface hit an unexpected error. You can try again or return to the dashboard.
            </div>
            {dev && msg ? (
              <pre className="mt-3 max-h-32 overflow-auto rounded border border-slate-200 bg-slate-50 p-2 text-left text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300">
                {msg}
              </pre>
            ) : null}
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                onClick={this.reset}
              >
                Try again
              </button>
              <Link
                to="/"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Go to dashboard
              </Link>
              <button
                type="button"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                onClick={() => window.location.reload()}
              >
                Reload app
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
