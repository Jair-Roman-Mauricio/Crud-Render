-- Configurable fields the admin wants to collect before the survey starts
-- Example: {"email":true,"name":true,"last_name":true,"age":true}
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS required_fields JSONB NOT NULL DEFAULT '{"email":true,"name":true,"last_name":true,"age":true}';
