import { Send } from 'lucide-react';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { DirectMessage, ThreadSummary } from 'shared';
import {
  getApiErrorMessage,
  getFacultyThread,
  getFacultyThreads,
  markThreadRead,
  sendDirectMessage,
} from '../../api/api';
import { FacultyContext } from '../../context/FacultyContext';
import { formatDateTime } from '../../utils/format';
import '../student/styles/chat.css';

const REFRESH_MS = 15000;

const FacultyChat = () => {
  const { faculty, loading: facultyLoading } = useContext(FacultyContext);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const email = faculty?.email ?? null;

  const loadThreads = useCallback(async (): Promise<void> => {
    if (email === null) return;
    try {
      const response = await getFacultyThreads(email);
      setThreads(response.data);
      // Open the busiest conversation rather than an empty pane.
      setSelected((current) => current ?? response.data[0]?.student_id ?? null);
      setError(null);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError, 'Could not load conversations'));
    } finally {
      setLoading(false);
    }
  }, [email]);

  const loadThread = useCallback(
    async (studentId: string, markRead: boolean): Promise<void> => {
      try {
        const response = await getFacultyThread(studentId, { limit: 50 });
        setMessages([...response.data.items].reverse());
        if (markRead && response.data.unread > 0) {
          await markThreadRead(studentId);
          await loadThreads();
        }
      } catch (loadError) {
        setError(getApiErrorMessage(loadError, 'Could not load messages'));
      }
    },
    [loadThreads]
  );

  useEffect(() => {
    if (facultyLoading) return;
    void loadThreads();
  }, [facultyLoading, loadThreads]);

  useEffect(() => {
    if (selected === null) return;
    void loadThread(selected, true);
    const timer = window.setInterval(
      () => void loadThread(selected, true),
      REFRESH_MS
    );
    return () => window.clearInterval(timer);
  }, [selected, loadThread]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (selected === null || draft.trim() === '') return;

    setSending(true);
    setError(null);
    try {
      await sendDirectMessage({ body: draft, student_id: selected });
      setDraft('');
      await loadThread(selected, false);
      await loadThreads();
    } catch (sendError) {
      setError(getApiErrorMessage(sendError, 'Could not send that message'));
    } finally {
      setSending(false);
    }
  };

  const activeName =
    threads.find((thread) => thread.student_id === selected)?.student_name ??
    '';

  return (
    <div className="chat-page chat-with-list">
      <header className="chat-header">
        <h1>Chat</h1>
        <p>Messages with the students assigned to you.</p>
      </header>

      <p className="chat-privacy">
        These messages are stored on the portal and can be read by its
        administrators. The chat inside a video call is end-to-end encrypted and
        is not.
      </p>

      {error !== null && <div className="chat-error">{error}</div>}

      <div className="chat-layout">
        <aside className="chat-list" aria-label="Conversations">
          {loading ? (
            <p className="chat-empty">Loading...</p>
          ) : threads.length === 0 ? (
            <p className="chat-empty">No students assigned yet.</p>
          ) : (
            threads.map((thread) => (
              <button
                key={thread.student_id}
                type="button"
                className={`chat-list-item ${
                  thread.student_id === selected ? 'active' : ''
                }`}
                onClick={() => setSelected(thread.student_id)}
              >
                <span className="chat-list-name">
                  {thread.student_name}
                  {thread.unread > 0 && (
                    <span className="chat-unread">{thread.unread}</span>
                  )}
                </span>
                <span className="chat-list-preview">
                  {thread.last_body ?? 'No messages yet'}
                </span>
              </button>
            ))
          )}
        </aside>

        <section className="chat-pane">
          {selected === null ? (
            <p className="chat-empty">
              Pick a student to see the conversation.
            </p>
          ) : (
            <>
              <div className="chat-thread">
                {messages.length === 0 ? (
                  <p className="chat-empty">
                    No messages with {activeName} yet.
                  </p>
                ) : (
                  messages.map((message) => (
                    <article
                      key={message.message_id}
                      className={`chat-bubble ${
                        message.sender_type === 'faculty' ? 'mine' : 'theirs'
                      }`}
                    >
                      <p className="chat-body">{message.body}</p>
                      <time className="chat-time">
                        {formatDateTime(message.created_at)}
                      </time>
                    </article>
                  ))
                )}
                <div ref={endRef} />
              </div>

              <form
                className="chat-form"
                onSubmit={(e) => void handleSubmit(e)}
              >
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={`Message ${activeName}`}
                  maxLength={4000}
                  disabled={sending}
                  aria-label="Message"
                />
                <button type="submit" disabled={sending || draft.trim() === ''}>
                  <Send size={16} /> Send
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
};

export default FacultyChat;
