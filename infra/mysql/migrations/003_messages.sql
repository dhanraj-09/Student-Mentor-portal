-- ---------------------------------------------------------------------------
-- Direct messages between a student and their assigned mentor.
--
-- Run once against each environment's database (the local container picks this
-- up automatically through schema.sql):
--
--   mysql -h <host> -u <user> -p <database> < infra/mysql/migrations/003_messages.sql
--
-- A conversation is implied by the (student, mentor) pair rather than given
-- its own table: mentorship assignment already defines who may talk to whom,
-- and a separate conversation row would be a second place for that truth to
-- live and drift.
--
-- NOTE ON ENCRYPTION: unlike the in-call chat, these messages are stored on
-- the server in plaintext and are therefore readable by whoever operates the
-- database. The in-call chat rides the meeting's end-to-end encrypted data
-- channel and never touches storage. The two are deliberately different, and
-- the UI says so rather than implying a protection that is not there.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS messages (
  message_id    INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  student_id    VARCHAR(64) NOT NULL,
  faculty_email VARCHAR(191) NOT NULL,
  -- Which side wrote it. The pair above identifies the conversation, so this
  -- is the only thing needed to place a message on the correct side.
  sender_type   ENUM('student', 'faculty') NOT NULL,
  body          TEXT NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at       TIMESTAMP NULL,
  CONSTRAINT fk_messages_student FOREIGN KEY (student_id)
    REFERENCES student(registration_no) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_messages_faculty FOREIGN KEY (faculty_email)
    REFERENCES faculty(email) ON DELETE CASCADE ON UPDATE CASCADE,
  -- Every read is "this conversation, newest first", which this serves.
  INDEX idx_messages_thread (student_id, faculty_email, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
