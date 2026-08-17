import { Component, type ErrorInfo, type ReactNode } from 'react';

interface AvgPresentationErrorBoundaryProps {
  children: ReactNode;
  onUseTextMode: () => void;
  resetToken?: string;
}

interface AvgPresentationErrorBoundaryState {
  error?: Error;
}

export class AvgPresentationErrorBoundary extends Component<
  AvgPresentationErrorBoundaryProps,
  AvgPresentationErrorBoundaryState
> {
  state: AvgPresentationErrorBoundaryState = {};

  static getDerivedStateFromError(error: Error): AvgPresentationErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('AVG presentation renderer failed.', error, info.componentStack);
  }

  componentDidUpdate(previousProps: AvgPresentationErrorBoundaryProps): void {
    if (
      this.state.error &&
      previousProps.resetToken !== this.props.resetToken
    ) {
      this.setState({ error: undefined });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <section className="avg-story-fallback" role="alert">
          <strong>AVG 画面发生异常</strong>
          <p>原正文与游戏状态没有受到影响。</p>
          <button type="button" onClick={this.props.onUseTextMode}>切换原正文</button>
        </section>
      );
    }
    return this.props.children;
  }
}
