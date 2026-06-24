interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: string;
}

export default function Spinner({ size = 'md', color }: SpinnerProps) {
  const cls = `spinner ${size === 'sm' ? 'spinner-sm' : size === 'lg' ? 'spinner-lg' : ''}`.trim();
  return (
    <span
      className={cls}
      style={color ? { color } : { color: 'var(--accent-light)' }}
      aria-label="Loading"
      role="status"
    />
  );
}
