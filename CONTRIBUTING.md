# Contributing to ClassPulse

Thanks for helping! ClassPulse is used in real classrooms, so we value changes that are small, tested and
easy to review.

## Getting set up

Follow the [Quick start](README.md#-quick-start). You'll have the API on `:5000`, the AI worker, and the
web app on `:5173`. To work on polling only, set `AI_ENABLED=false`; Ollama isn't needed.

## Where things live

| You want to change… | Look in |
|---|---|
| A page or component | `apps/web/src/pages`, `apps/web/src/components` (styles: `apps/web/src/styles/global.css`) |
| A socket event or payload | `packages/shared/src/events.ts` and `types.ts` (shared by server and web, so both type-check) |
| Validation | `packages/shared/src/schemas.ts` (Zod) |
| Poll lifecycle, auth, REST routes | `apps/server/src` |
| Database schema | add a new file in `apps/server/migrations/` (never edit an applied one) |
| Retrieval, prompts, AI features | `packages/rag-core/src` |
| Which AI job runs where | `apps/ai-worker/src/index.ts` |

## Before you open a pull request

```bash
npm run lint && npm run typecheck && npm test
npm run e2e                       # with the app running (npm run dev); config in e2e/
```

- **UI changes:** include a before/after screenshot. Check light and dark mode and a phone-width screen.
- **Retrieval or prompt changes:** run `npm run eval` and paste the before/after table into the PR. If you
  add a strategy, add it to `RAG_STRATEGIES` in `packages/shared` so the UI and the benchmark pick it up.
- **New socket events:** type them in `packages/shared/src/events.ts` and validate the payload with Zod
  on the server. The client is never trusted.
- **AI features** must keep working without a GPU, and must degrade gracefully when Ollama is offline.

## Conventions

- TypeScript strict mode everywhere; no `any` without a comment saying why.
- Comments explain *why*, not *what*.
- Prettier formatting (`npm run format`).
- Commit messages in the imperative mood ("Add word-cloud question type").

## Reporting bugs and security issues

Open an issue with steps to reproduce, what you expected, and what happened (screenshots help). Please
report security problems privately to the maintainer through GitHub, not in a public issue.

## License

By contributing, you agree your contributions are licensed under the [MIT License](LICENSE).
