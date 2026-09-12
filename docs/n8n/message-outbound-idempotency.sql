CREATE TABLE IF NOT EXISTS message_outbound_idempotency (
    request_id VARCHAR(120) PRIMARY KEY,
    status VARCHAR(20) NOT NULL
        CHECK (status IN ('PROCESSING', 'SENT', 'FAILED', 'UNKNOWN')),
    provider VARCHAR(50),
    provider_message_id VARCHAR(255),
    response_json JSONB,
    error_code VARCHAR(120),
    attempt_count INTEGER NOT NULL DEFAULT 1
        CHECK (attempt_count >= 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
