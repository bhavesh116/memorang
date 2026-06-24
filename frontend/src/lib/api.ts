/// <reference types="vite/client" />
import { getAccessToken } from './supabase';
import type {
  LessonWorkspace,
  Learning,
  LearningChatMessage,
  LearningPlan,
  StudyWorkspace,
} from '@/types/learning';

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string) || 'http://localhost:3001';

// ── Core fetch helper ─────────────────────────────────────────────────────────

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body.message || `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ── API surface ───────────────────────────────────────────────────────────────

export const api = {
  learnings: {
    list: () =>
      request<{ learnings: Learning[] }>('/learnings'),

    create: (payload: { title: string; description?: string }) =>
      request<{ learning: Learning }>('/learnings', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    get: (id: string) =>
      request<{ learning: Learning }>(`/learnings/${id}`),

    status: (id: string) =>
      request<{ learning: Learning }>(`/learnings/${id}/status`),

    update: (id: string, payload: { title?: string; description?: string; stage?: string }) =>
      request<{ learning: Learning }>(`/learnings/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),

    delete: (id: string) =>
      request<{ success: boolean }>(`/learnings/${id}`, { method: 'DELETE' }),

    /**
     * Upload a PDF with XHR for progress tracking.
     */
    uploadPdf: (
      id: string,
      file: File,
      onProgress?: (pct: number) => void
    ): Promise<{ learning: Learning; pdf_url: string }> =>
      new Promise(async (resolve, reject) => {
        const token = await getAccessToken();
        const formData = new FormData();
        formData.append('file', file);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${BACKEND_URL}/learnings/${id}/upload`);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && onProgress) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText) as { learning: Learning; pdf_url: string });
          } else {
            const body = JSON.parse(xhr.responseText || '{}') as { message?: string };
            reject(new Error(body.message || `Upload failed: ${xhr.status}`));
          }
        };

        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(formData);
      }),

    reprocess: (id: string) =>
      request<{ learning: Learning }>(`/learnings/${id}/reprocess`, {
        method: 'POST',
      }),

    getPlanWorkspace: (id: string) =>
      request<{ workspace: StudyWorkspace }>(`/learnings/${id}/plan`),

    regeneratePlan: (
      id: string,
      difficulty: 'Easy' | 'Intermediate' | 'Hard',
    ) =>
      request<{ plan: LearningPlan }>(`/learnings/${id}/plan/regenerate`, {
        method: 'POST',
        body: JSON.stringify({ difficulty }),
      }),

    updateTopicSelection: (id: string, topicId: string, included: boolean) =>
      request<{ plan: LearningPlan }>(`/learnings/${id}/plan/topics/${topicId}`, {
        method: 'PATCH',
        body: JSON.stringify({ included }),
      }),

    updateSubtopicSelection: (
      id: string,
      subtopicId: string,
      included: boolean,
    ) =>
      request<{ plan: LearningPlan }>(
        `/learnings/${id}/plan/subtopics/${subtopicId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ included }),
        }
      ),

    approvePlan: (id: string) =>
      request<{ plan: LearningPlan }>(`/learnings/${id}/plan/approve`, {
        method: 'POST',
      }),

    streamPlanChat: async (
      id: string,
      message: string,
      handlers: {
        onAck?: (payload: { userMessage: LearningChatMessage; threadId: string; appliedChanges: string[] }) => void;
        onToken?: (text: string) => void;
        onMessage?: (payload: { message: LearningChatMessage }) => void;
        onPlan?: (payload: { plan: LearningPlan | null }) => void;
        onDone?: () => void;
        onError?: (message: string) => void;
      }
    ) => {
      const token = await getAccessToken();
      const res = await fetch(`${BACKEND_URL}/learnings/${id}/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message }),
      });

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(body.message || `Request failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = 'message';

      const flushEvent = (raw: string) => {
        const lines = raw.split('\n');
        let eventName = currentEvent;
        let data = '';

        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim();
          }
          if (line.startsWith('data:')) {
            data += line.slice(5).trim();
          }
        }

        if (!data) {
          return;
        }

        const parsed = JSON.parse(data);
        currentEvent = eventName;

        if (eventName === 'ack') handlers.onAck?.(parsed);
        if (eventName === 'token') handlers.onToken?.(parsed.text);
        if (eventName === 'message') handlers.onMessage?.(parsed);
        if (eventName === 'plan') handlers.onPlan?.(parsed);
        if (eventName === 'done') handlers.onDone?.();
        if (eventName === 'error') handlers.onError?.(parsed.message || 'Streaming failed');
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        let separatorIndex = buffer.indexOf('\n\n');

        while (separatorIndex !== -1) {
          const chunk = buffer.slice(0, separatorIndex);
          buffer = buffer.slice(separatorIndex + 2);
          flushEvent(chunk);
          separatorIndex = buffer.indexOf('\n\n');
        }
      }
    },

    getLessonWorkspace: (id: string) =>
      request<{ workspace: LessonWorkspace }>(`/learnings/${id}/lesson`),

    startLesson: (id: string, regenerate = false) =>
      request<{ workspace: LessonWorkspace }>(`/learnings/${id}/lesson/start`, {
        method: 'POST',
        body: JSON.stringify({ regenerate }),
      }),

    answerLessonQuestion: (
      id: string,
      lessonId: string,
      questionId: string,
      selectedChoiceIndex: number,
      responseTimeMs: number,
    ) =>
      request<{
        correct: boolean;
        hint: string | null;
        explanation: string | null;
        explanationImageUrl: string | null;
        lesson: LessonWorkspace;
        selectedChoiceIndex: number;
        completed: boolean;
      }>(`/learnings/${id}/lesson/${lessonId}/questions/${questionId}/answer`, {
        method: 'POST',
        body: JSON.stringify({ selectedChoiceIndex, responseTimeMs }),
      }),

    getLessonHint: (id: string, lessonId: string, questionId: string) =>
      request<{ hint: string; hintCount: number }>(
        `/learnings/${id}/lesson/${lessonId}/questions/${questionId}/hint`,
        { method: 'POST' },
      ),

    streamLessonChat: async (
      id: string,
      message: string,
      handlers: {
        onAck?: (payload: { userMessage: LearningChatMessage; threadId: string }) => void;
        onToken?: (text: string) => void;
        onMessage?: (payload: { message: LearningChatMessage }) => void;
        onDone?: () => void;
        onError?: (message: string) => void;
      },
    ) => {
      const token = await getAccessToken();
      const res = await fetch(`${BACKEND_URL}/learnings/${id}/lesson/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message }),
      });

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(body.message || `Request failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = 'message';

      const flushEvent = (raw: string) => {
        const lines = raw.split('\n');
        let eventName = currentEvent;
        let data = '';

        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim();
          }
          if (line.startsWith('data:')) {
            data += line.slice(5).trim();
          }
        }

        if (!data) {
          return;
        }

        const parsed = JSON.parse(data);
        currentEvent = eventName;

        if (eventName === 'ack') handlers.onAck?.(parsed);
        if (eventName === 'token') handlers.onToken?.(parsed.text);
        if (eventName === 'message') handlers.onMessage?.(parsed);
        if (eventName === 'done') handlers.onDone?.();
        if (eventName === 'error') handlers.onError?.(parsed.message || 'Streaming failed');
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        let separatorIndex = buffer.indexOf('\n\n');

        while (separatorIndex !== -1) {
          const chunk = buffer.slice(0, separatorIndex);
          buffer = buffer.slice(separatorIndex + 2);
          flushEvent(chunk);
          separatorIndex = buffer.indexOf('\n\n');
        }
      }
    },
  },
};
