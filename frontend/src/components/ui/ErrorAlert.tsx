import { AlertTriangle } from 'lucide-react';

interface Props {
  message: string;
  className?: string;
  style?: React.CSSProperties;
}

export default function ErrorAlert({ message, className = '', style }: Props) {
  return (
    <div className={`msg msg-error ${className}`.trim()} style={style}>
      <span><AlertTriangle size={16} /></span> {message}
    </div>
  );
}
