-- Accounts and encrypted records. Shipped migrations never change; add a new numbered file instead.
-- Neon never sees a password or plaintext data: only the data key locked with the password (and with the
-- recovery key), and records encrypted with that data key.

CREATE TABLE toolbelt.users (
	id uuid PRIMARY KEY,
	username text NOT NULL,
	-- Lower-cased, so "Ali" and "ali" cannot both exist.
	username_key text NOT NULL UNIQUE,
	-- Argon2id parameters and salt for the master password.
	password_kdf jsonb NOT NULL,
	-- The data key, AES-GCM encrypted with the key derived from the master password.
	password_wrapped_key text NOT NULL,
	recovery_kdf jsonb NOT NULL,
	recovery_wrapped_key text NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE toolbelt.records (
	user_id uuid NOT NULL REFERENCES toolbelt.users (id) ON DELETE CASCADE,
	-- What kind of record: "kv" for settings and tool values, later "memory", "chat", ...
	collection text NOT NULL,
	id text NOT NULL,
	-- AES-GCM ciphertext, bound to (user_id, collection, id). NULL once deleted.
	ciphertext text,
	deleted boolean NOT NULL DEFAULT false,
	updated_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (user_id, collection, id)
);
--> statement-breakpoint
CREATE INDEX records_by_user_and_time ON toolbelt.records (user_id, updated_at);
