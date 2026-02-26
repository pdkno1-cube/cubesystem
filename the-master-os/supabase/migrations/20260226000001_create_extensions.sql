-- =============================================================================
-- Migration: Create Extensions
-- The Master OS — Required PostgreSQL Extensions
-- =============================================================================

-- UUID generation (gen_random_uuid, uuid_generate_v4)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Cryptographic functions (crypt, gen_salt, gen_random_bytes)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
