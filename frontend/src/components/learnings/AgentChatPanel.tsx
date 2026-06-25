import { Bot, SendHorizonal } from 'lucide-react';
import Button from '@/components/ui/Button';
import type { LearningChatMessage } from '@/types/learning';

interface Props {
  title: string;
  helperText: string;
  emptyText: string;
  assistantLabel: string;
  placeholder: string;
  composerHelperText: string;
  messages: LearningChatMessage[];
  draft: string;
  error: string | null;
  streaming: boolean;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  className?: string;
  headerExtra?: React.ReactNode;
}

export default function AgentChatPanel({
  title,
  helperText,
  emptyText,
  assistantLabel,
  placeholder,
  composerHelperText,
  messages,
  draft,
  error,
  streaming,
  onDraftChange,
  onSend,
  onKeyDown,
  className = 'study-chat-card',
  headerExtra,
}: Props) {
  return (
    <div className={className}>
      <div className="study-chat-header">
        {headerExtra ?? (
          <div className="study-chat-title">
            <Bot size={16} />
            <span>{title}</span>
          </div>
        )}
        <span className="study-chat-helper">{helperText}</span>
      </div>

      <div className="study-chat-messages">
        {messages.length === 0 ? (
          <div className="study-chat-empty">
            <Bot size={18} />
            <span>{emptyText}</span>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`study-chat-message study-chat-message-${message.role}`}
            >
              <div className="study-chat-role">
                {message.role === 'assistant' ? assistantLabel : 'You'}
              </div>
              <div className="study-chat-content">{message.content}</div>
            </div>
          ))
        )}
      </div>

      <div className="study-chat-composer">
        <textarea
          className="input study-chat-textarea"
          placeholder={placeholder}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={onKeyDown}
          disabled={streaming}
        />
        <div className="study-chat-composer-footer">
          {error ? (
            <span className="study-chat-error">{error}</span>
          ) : (
            <span className="study-chat-helper">{composerHelperText}</span>
          )}
          <Button
            loading={streaming}
            onClick={onSend}
            disabled={streaming || !draft.trim()}
          >
            {!streaming ? <SendHorizonal size={16} /> : null}
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
