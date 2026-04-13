import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, showDetails: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { error, errorInfo, showDetails } = this.state;

    return (
      <div className="flex flex-col items-center justify-center h-full cyber-floor">
        <div className="pet-frame w-full max-w-sm mx-4 p-5 flex flex-col gap-4">
          <div className="text-center">
            <div className="text-exe-red font-pixel text-sm tracking-widest mb-1">// ERROR //</div>
            <div className="text-txt-primary font-mono text-xs">エラーが発生しました</div>
          </div>

          <button
            onClick={() => location.reload()}
            className="w-full py-2 bg-navi/20 border border-navi text-navi font-pixel text-xs tracking-widest hover:bg-navi/40 active:bg-navi/60 transition-colors"
          >
            RELOAD
          </button>

          <div>
            <button
              onClick={() => this.setState(s => ({ showDetails: !s.showDetails }))}
              className="text-txt-muted font-mono text-[10px] hover:text-txt-primary transition-colors"
            >
              {showDetails ? '▲ 詳細を隠す' : '▼ エラー詳細'}
            </button>
            {showDetails && (
              <div className="mt-2 bg-cyber-900 border border-cyber-700 rounded p-2 overflow-auto max-h-40">
                <pre className="text-exe-red font-mono text-[9px] whitespace-pre-wrap break-all">
                  {error?.toString()}
                  {errorInfo?.componentStack}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
}
