-- Existing releases already perform case-insensitive account lookup. Refuse
-- startup with an actionable migration error if legacy rows violate that rule.
DO $migration$
BEGIN
    IF EXISTS (
        SELECT lower(username)
        FROM users
        GROUP BY lower(username)
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'case-insensitive duplicate usernames exist; resolve them before migration 003';
    END IF;
    IF EXISTS (
        SELECT lower(email)
        FROM users
        GROUP BY lower(email)
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'case-insensitive duplicate emails exist; resolve them before migration 003';
    END IF;
END
$migration$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower_unique ON users (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower_unique ON users (lower(email));
