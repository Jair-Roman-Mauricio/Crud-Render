CREATE INDEX IF NOT EXISTS idx_surveys_admin_id       ON surveys(admin_id);
CREATE INDEX IF NOT EXISTS idx_questions_survey_id    ON questions(survey_id, question_order);
CREATE INDEX IF NOT EXISTS idx_survey_links_token     ON survey_links(token);
CREATE INDEX IF NOT EXISTS idx_survey_links_survey_id ON survey_links(survey_id);
CREATE INDEX IF NOT EXISTS idx_responses_link_id      ON responses(survey_link_id);
CREATE INDEX IF NOT EXISTS idx_responses_session      ON responses(respondent_session_id);
CREATE INDEX IF NOT EXISTS idx_messages_response_id   ON messages(response_id, created_at);
