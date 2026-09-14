import { Send } from 'lucide-react';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { DirectMessage } from 'shared';
import {
  getApiErrorMessage,
  getStudentThread,
  markThreadRead,
  sendDirectMessage,
} from '../../api/api';
import { StudentContext } from '../../context/StudentContext';
import { formatDateTime } from '../../utils/format';
import './styles/chat.css';

/** Polling interval; a mentoring thread is not a live chat room. */
const REFRESH_MS = 15000;

const StudentChat = () => {
  const { Student, assignedFaculty } = useContext(StudentContext);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const hasMentor = assignedFaculty !== null;

  const load = useCallback(async (markRead: boolean): Promise<void> => {
    try {
      const response = await getStudentThread({ limit: 50 });
      // The server returns newest first; a conversation reads oldest first.
      setMessages([...response.data.items].reverse());
      setError(null);
      if (markRead && response.data.unread > 0) {
        await markThreadRead();
      }
    } catch (loadError) {
      setError(getApiErrorMessage(loadError, 'Could not load messages'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (Student === null || !hasMentor) {
      setLoading(false);
      return;
    }
    void load(true);
    const timer = window.setInterval(() => void load(true), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [Student, hasMentor, load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (draft.trim() === '') return;

    setSending(true);
    setError(null);
    try {
      await sendDirectMessage({ body: draft });
      setDraft('');
      await load(false);
    } catch (sendError) {
      setError(getApiErrorMessage(sendError, 'Could not send that message'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="chat-page">
      <header className="chat-header">
        <h1>Chat</h1>
        <p>
          {hasMentor
            ? `Messages between you and ${assignedFaculty.name}.`
            : 'You will be able to message your mentor once one is assigned.'}
        </p>
      </header>

      {/* Said plainly: the in-call chat is end-to-end encrypted, this is not. */}
      <p className="chat-privacy">
        These messages are stored on the portal and can be read by its
        administrators. The chat inside a video call is end-to-end encrypted and
        is not.
      </p>

      {error !== null && <div className="chat-error">{error}</div>}

      <div className="chat-thread">
        {!hasMentor ? (
          <p className="chat-empty">No mentor assigned yet.</p>
        ) : loading ? (
          <p className="chat-empty">Loading messages...</p>
        ) : messages.length === 0 ? (
          <p className="chat-empty">
            No messages yet. Say hello to your mentor.
          </p>
        ) : (
          messages.map((message) => (
            <article
              key={message.message_id}
              className={`chat-bubble ${
                message.sender_type === 'student' ? 'mine' : 'theirs'
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

      <form className="chat-form" onSubmit={(e) => void handleSubmit(e)}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={hasMentor ? 'Message your mentor' : 'No mentor assigned'}
          maxLength={4000}
          disabled={!hasMentor || sending}
          aria-label="Message"
        />
        <button
          type="submit"
          disabled={!hasMentor || sending || draft.trim() === ''}
        >
          <Send size={16} /> Send
        </button>
      </form>
    </div>
  );
};

export default StudentChat;
