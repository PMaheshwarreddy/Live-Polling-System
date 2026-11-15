CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE teachers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  name          text NOT NULL,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text NOT NULL UNIQUE,
  teacher_id uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  title      text NOT NULL,
  status     text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_teacher_idx ON sessions (teacher_id, created_at DESC);

CREATE TABLE participants (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  name       text NOT NULL,
  kicked_at  timestamptz,
  joined_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX participants_session_idx ON participants (session_id);

CREATE TABLE polls (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  seq             int  NOT NULL,
  question        text NOT NULL,
  options         jsonb NOT NULL,
  correct_options int[] NOT NULL,
  explanation     text,
  duration_sec    int  NOT NULL,
  document_id     uuid,
  started_at      timestamptz NOT NULL DEFAULT now(),
  ends_at         timestamptz NOT NULL,
  ended_at        timestamptz,
  UNIQUE (session_id, seq)
);
-- At most one running poll per session, enforced by the database (safe across server instances).
CREATE UNIQUE INDEX polls_one_active_idx ON polls (session_id) WHERE ended_at IS NULL;

CREATE TABLE responses (
  poll_id        uuid NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  option_index   int  NOT NULL,
  answered_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (poll_id, participant_id)
);

CREATE TABLE chat_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  sender_id   uuid NOT NULL,
  sender_name text NOT NULL,
  sender_role text NOT NULL,
  text        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_session_idx ON chat_messages (session_id, created_at DESC);
