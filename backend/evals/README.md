# Backend Evals

Run the prompt and retrieval evals with:

```bash
npm run evals
```

This suite covers the main AI-facing behaviors in the backend:

- study plan generation prompt construction
- plan-edit extraction prompt constraints
- study-planning chat system prompt behavior before and after approval
- retrieval context assembly with embedding vector formatting and truncation
- lesson generation prompt construction
- lesson coach prompt guardrails
- embedding helper delegation
- document chunk embedding batching, vector persistence formatting, and progress updates

The evals are intentionally deterministic and use mocked model / database dependencies so they can run in CI or during interviews without live Azure OpenAI or Supabase access.
