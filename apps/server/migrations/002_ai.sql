CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE documents (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  title      text NOT NULL,
  mime       text NOT NULL,
  status     text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'failed')),
  error      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE session_documents (
  session_id  uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  PRIMARY KEY (session_id, document_id)
);

-- Parent/child chunking: children are small and get embedded; parents are what the LLM reads.
CREATE TABLE chunks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  parent_id   uuid REFERENCES chunks(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('parent', 'child')),
  ord         int  NOT NULL,
  content     text NOT NULL,
  context     text,           -- "contextual retrieval" line written by the LLM
  embedding   vector(384),
  tsv         tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(context, '') || ' ' || content)) STORED
);
CREATE INDEX chunks_doc_idx ON chunks (document_id, kind, ord);
CREATE INDEX chunks_embedding_idx ON chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX chunks_tsv_idx ON chunks USING gin (tsv);

-- Knowledge graph for GraphRAG.
CREATE TABLE concepts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  embedding   vector(384),
  UNIQUE (document_id, name)
);
CREATE INDEX concepts_embedding_idx ON concepts USING hnsw (embedding vector_cosine_ops);

CREATE TABLE concept_edges (
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  source_id   uuid NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  target_id   uuid NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  relation    text NOT NULL,
  PRIMARY KEY (source_id, target_id, relation)
);

CREATE TABLE chunk_concepts (
  chunk_id   uuid NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  concept_id uuid NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  PRIMARY KEY (chunk_id, concept_id)
);

-- Every local model call, for the usage dashboard and per-teacher daily limits.
CREATE TABLE ai_calls (
  id                 bigserial PRIMARY KEY,
  teacher_id         uuid REFERENCES teachers(id) ON DELETE SET NULL,
  feature            text NOT NULL,
  model              text NOT NULL,
  input_tokens       int NOT NULL DEFAULT 0,
  output_tokens      int NOT NULL DEFAULT 0,
  latency_ms         int NOT NULL DEFAULT 0,
  ok                 boolean NOT NULL DEFAULT true,
  error              text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_calls_teacher_idx ON ai_calls (teacher_id, created_at);

CREATE INDEX ai_calls_created_idx ON ai_calls (created_at);

CREATE TABLE ai_jobs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid REFERENCES teachers(id) ON DELETE CASCADE,
  participant_id uuid REFERENCES participants(id) ON DELETE CASCADE,
  kind       text NOT NULL,
  status     text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  input      jsonb NOT NULL,
  output     jsonb,
  error      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_jobs_teacher_idx ON ai_jobs (teacher_id, created_at);

CREATE TABLE poll_insights (
  poll_id    uuid PRIMARY KEY REFERENCES polls(id) ON DELETE CASCADE,
  insight    jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
