-- ---------------------------------------------------------------------------
-- Mentor-shared learning resources.
--
-- Run once against each environment's database (the local container picks this
-- up automatically through schema.sql):
--
--   mysql -h <host> -u <user> -p <database> < infra/mysql/migrations/002_resources.sql
--
-- A resource belongs to the faculty member who posted it, and is visible to
-- every student currently assigned to them — there is no per-student sharing
-- table, because mentorship assignment already expresses the audience.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS resources (
  resource_id   INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  faculty_email VARCHAR(191) NOT NULL,
  title         VARCHAR(255) NOT NULL,
  description   TEXT NULL,
  url           VARCHAR(1024) NULL,
  category      VARCHAR(191) NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_resources_faculty FOREIGN KEY (faculty_email)
    REFERENCES faculty(email) ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_resources_faculty (faculty_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
