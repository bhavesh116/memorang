import Spinner from '@/components/ui/Spinner';

interface Props {
  message?: string;
  fullHeight?: boolean;
}

export default function LoadingScreen({
  message = 'Loading…',
  fullHeight = true,
}: Props) {
  return (
    <div
      className="loading-screen"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: fullHeight ? '100vh' : '100%',
        background: fullHeight ? 'var(--bg-root)' : undefined,
        flexDirection: 'column',
        gap: '0.75rem',
        color: 'var(--text-muted)',
      }}
    >
      <Spinner size="lg" />
      <span style={{ fontSize: '0.875rem' }}>{message}</span>
    </div>
  );
}
