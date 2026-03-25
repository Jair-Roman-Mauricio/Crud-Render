CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20)  NOT NULL CHECK (role IN ('superadmin', 'admin')),
  company_name  VARCHAR(255),
  permissions   JSONB        NOT NULL DEFAULT '{}',
  is_active     BOOLEAN      NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS surveys (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         VARCHAR(255) NOT NULL,
  description   TEXT,
  system_prompt TEXT        NOT NULL DEFAULT '',
  language      VARCHAR(10)  NOT NULL DEFAULT 'auto',
  status        VARCHAR(20)  NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS questions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id      UUID        NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  question_text  TEXT        NOT NULL,
  question_order INTEGER     NOT NULL,
  type           VARCHAR(30)  NOT NULL DEFAULT 'open' CHECK (type IN ('open', 'scale', 'multiple_choice', 'yes_no')),
  options        JSONB,
  is_required    BOOLEAN     NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS survey_links (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id     UUID        NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  token         VARCHAR(64)  NOT NULL UNIQUE,
  label         VARCHAR(255),
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  max_responses INTEGER,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS responses (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_link_id        UUID        NOT NULL REFERENCES survey_links(id) ON DELETE CASCADE,
  respondent_session_id VARCHAR(64) NOT NULL,
  metadata              JSONB       NOT NULL DEFAULT '{}',
  status                VARCHAR(20)  NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  started_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at          TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id UUID        NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  role        VARCHAR(10)  NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT        NOT NULL,
  token_count INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS surveys_updated_at ON surveys;
CREATE TRIGGER surveys_updated_at
  BEFORE UPDATE ON surveys FOR EACH ROW EXECUTE FUNCTION update_updated_at();
