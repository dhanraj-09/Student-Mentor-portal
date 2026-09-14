-- ---------------------------------------------------------------------------
-- First login flow: password not set.
--
-- Students are provisioned without a password. On their first login attempt the
-- portal detects that, and they set a password either through a link sent to
-- their Outlook email or by pairing Microsoft Authenticator.
--
--   mysql -h <host> -u <user> -p <database> < infra/mysql/migrations/002_first_login_password_setup.sql
-- ---------------------------------------------------------------------------

-- A provisioned student has no password yet, so the column has to allow NULL.
ALTER TABLE student
  MODIFY COLUMN password_hash VARCHAR(255) NULL;

-- Where the reset link is sent. Left NULL for accounts whose address follows
-- the institutional pattern, which the backend derives from the registration
-- number (STUDENT_EMAIL_DOMAIN).
ALTER TABLE student
  ADD COLUMN email VARCHAR(191) NULL AFTER name;

ALTER TABLE student
  ADD CONSTRAINT uniq_student_email UNIQUE (email);

-- Single-use tokens for setting a password. Only a SHA-256 hash of the token is
-- stored, so a database leak does not hand over usable reset links.
CREATE TABLE IF NOT EXISTS password_setup_tokens (
  token_id        INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  registration_no VARCHAR(64) NOT NULL,
  token_hash      CHAR(64) NOT NULL,
  -- 'email'  : issued by the reset-link email
  -- 'totp'   : issued after a Microsoft Authenticator code was verified
  purpose         ENUM('email', 'totp') NOT NULL,
  expires_at      DATETIME NOT NULL,
  used_at         DATETIME NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_setup_tokens_student FOREIGN KEY (registration_no)
    REFERENCES student(registration_no) ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE KEY uniq_setup_token_hash (token_hash),
  INDEX idx_setup_tokens_student (registration_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- One TOTP secret per student, paired with Microsoft Authenticator.
CREATE TABLE IF NOT EXISTS student_totp (
  registration_no VARCHAR(64) NOT NULL PRIMARY KEY,
  secret          VARCHAR(128) NOT NULL,
  confirmed_at    DATETIME NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_student_totp_student FOREIGN KEY (registration_no)
    REFERENCES student(registration_no) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
