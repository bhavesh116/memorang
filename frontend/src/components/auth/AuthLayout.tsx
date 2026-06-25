import { Brain } from 'lucide-react';
import type { ReactNode } from 'react';

export interface AuthFeature {
  icon: ReactNode;
  text: string;
}

interface Props {
  title: string;
  subtitle: string;
  features: AuthFeature[];
  children: ReactNode;
}

export default function AuthLayout({ title, subtitle, features, children }: Props) {
  return (
    <div className="auth-root">
      <div className="auth-hero">
        <div className="auth-hero-content">
          <div className="auth-hero-logo"><Brain size={48} /></div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
          <div className="auth-hero-features">
            {features.map((feature) => (
              <div key={feature.text} className="auth-hero-feature">
                <span>{feature.icon}</span> {feature.text}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="auth-form-panel">{children}</div>
    </div>
  );
}
