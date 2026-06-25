import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Bot, X } from 'lucide-react';
import AgentChatPanel from '@/components/learnings/AgentChatPanel';
import type { LearningChatMessage } from '@/types/learning';

interface Props {
  open: boolean;
  messages: LearningChatMessage[];
  draft: string;
  error: string | null;
  streaming: boolean;
  onClose: () => void;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

export default function CoachChatDrawer({
  open,
  messages,
  draft,
  error,
  streaming,
  onClose,
  onDraftChange,
  onSend,
  onKeyDown,
}: Props) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const scrollY = window.scrollY;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    const originalBodyOverflow = document.body.style.overflow;
    const originalBodyPosition = document.body.style.position;
    const originalBodyTop = document.body.style.top;
    const originalBodyLeft = document.body.style.left;
    const originalBodyRight = document.body.style.right;
    const originalBodyWidth = document.body.style.width;

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';

    return () => {
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.body.style.overflow = originalBodyOverflow;
      document.body.style.position = originalBodyPosition;
      document.body.style.top = originalBodyTop;
      document.body.style.left = originalBodyLeft;
      document.body.style.right = originalBodyRight;
      document.body.style.width = originalBodyWidth;
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return createPortal(
    <>
      <div
        className="lesson-coach-overlay lesson-coach-overlay-open"
        onClick={onClose}
      />
      <aside className="lesson-coach-drawer lesson-coach-drawer-open">
        <AgentChatPanel
          className="study-chat-card lesson-chat-card lesson-chat-card-drawer"
          title="Learn More"
          helperText="Ask for hints or concept help. The coach will not reveal the answer."
          emptyText="Need help? Ask the coach for a hint or a quick explanation of the current objective."
          assistantLabel="Coach"
          placeholder="Ask for a hint or tell the coach what concept you want clarified."
          composerHelperText="The coach will guide you without spoiling the answer."
          messages={messages}
          draft={draft}
          error={error}
          streaming={streaming}
          onDraftChange={onDraftChange}
          onSend={onSend}
          onKeyDown={onKeyDown}
          headerExtra={
            <div className="lesson-chat-drawer-topbar">
              <div className="study-chat-title">
                <Bot size={16} />
                <span>Learn More</span>
              </div>
              <button
                type="button"
                className="lesson-drawer-close"
                onClick={onClose}
                aria-label="Close learn more drawer"
              >
                <X size={18} />
              </button>
            </div>
          }
        />
      </aside>
    </>,
    document.body,
  );
}
