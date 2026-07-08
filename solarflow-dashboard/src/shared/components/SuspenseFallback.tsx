import { Component, ReactNode } from 'react';

interface SuspenseFallbackProps {
  children?: ReactNode;
  message?: string;
}

export class SuspenseFallback extends Component<SuspenseFallbackProps> {
  render() {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-gray-600 dark:text-gray-400">
            {this.props.message || 'Loading...'}
          </p>
        </div>
      </div>
    );
  }
}

export default SuspenseFallback;