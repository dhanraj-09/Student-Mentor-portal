import { useCallback, useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Clock, Info, Plus, X } from 'lucide-react';
import type { Faculty, Query } from 'shared';
import {
  createQuery,
  getFacultyData,
  getStudentData,
  getStudentQueries,
} from '../../api/api';
import { formatDate } from '../../utils/format';
import './styles/newqueryform.css';

type FormField = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

interface QueryFormState {
  category: string;
  subcategory: string;
  subject: string;
  description: string;
}

const emptyForm: QueryFormState = {
  category: '',
  subcategory: '',
  subject: '',
  description: '',
};

const NewQueryForm = () => {
  const navigate = useNavigate();

  const [queries, setQueries] = useState<Query[]>([]);
  const [mentor, setMentor] = useState<Faculty | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<QueryFormState>(emptyForm);

  const studentRegNo = sessionStorage.getItem('studentSessionID');

  const fetchDashboardData = useCallback(async (): Promise<void> => {
    if (studentRegNo === null) return;

    setLoading(true);
    try {
      const queriesRes = await getStudentQueries(studentRegNo);
      setQueries(queriesRes.data.items);

      const studentRes = await getStudentData(studentRegNo);
      const assignedEmail = studentRes.data.assigned_faculty_email;

      if (
        assignedEmail !== null &&
        assignedEmail !== undefined &&
        assignedEmail !== ''
      ) {
        const facultyRes = await getFacultyData(assignedEmail);
        setMentor(facultyRes.data);
      }
    } catch (error) {
      console.error('Failed to load query data', error);
    } finally {
      setLoading(false);
    }
  }, [studentRegNo]);

  useEffect(() => {
    if (studentRegNo === null) {
      navigate('/');
      return;
    }
    void fetchDashboardData();
  }, [studentRegNo, navigate, fetchDashboardData]);

  const handleInputChange = (e: ChangeEvent<FormField>): void => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (studentRegNo === null) return;

    setSubmitting(true);
    try {
      await createQuery({ student_id: studentRegNo, ...formData });
      await fetchDashboardData();

      setFormData(emptyForm);
      setIsPanelOpen(false);
    } catch {
      alert('Failed to submit query. Please check backend connection.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="raise-query-container">
      <header className="query-header">
        <h2 className="page-title">Raise a Query</h2>
        <div className="info-icon">
          <Info size={24} />
        </div>
      </header>

      <div className="mentor-section">
        <div className="mentor-info-wrapper">
          <div className="mentor-avatar">
            {mentor !== null ? mentor.name.charAt(0).toUpperCase() : '?'}
          </div>
          <div className="mentor-details">
            <h3>{mentor !== null ? mentor.name : 'No Mentor Assigned'}</h3>
            <p>
              {mentor !== null
                ? mentor.department
                : 'Contact admin for assignment'}
            </p>
          </div>
        </div>
        <div className="add-new-btn" onClick={() => setIsPanelOpen(true)}>
          <div className="plus-box">
            <Plus size={24} strokeWidth={2.5} />
          </div>
          <span>New Query</span>
        </div>
      </div>

      <div className="query-list-container">
        {loading ? (
          <div className="loading-text">Loading your queries...</div>
        ) : queries.length === 0 ? (
          <div className="empty-state">
            You haven&apos;t raised any queries yet. Click &quot;New Query&quot;
            to begin.
          </div>
        ) : (
          <div className="query-list">
            {queries.map((q) => (
              <div key={q.query_id} className="query-card">
                <div className="card-header">
                  <span className={`status-badge ${q.status.toLowerCase()}`}>
                    {q.status === 'Resolved' ? (
                      <CheckCircle size={14} />
                    ) : (
                      <Clock size={14} />
                    )}
                    {q.status}
                  </span>
                  <span className="date-text">{formatDate(q.created_at)}</span>
                </div>
                <h3 className="query-subject">{q.subject}</h3>
                <div className="category-tags">
                  <span className="tag">{q.category}</span>
                  <span className="tag outline">{q.subcategory}</span>
                </div>
                <p className="query-body">{q.description}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        className={`slide-overlay ${isPanelOpen ? 'open' : ''}`}
        onClick={() => setIsPanelOpen(false)}
      />
      <div className={`slide-panel ${isPanelOpen ? 'open' : ''}`}>
        <div className="panel-header">
          <h2>Submit a Request</h2>
          <X
            size={24}
            className="close-btn"
            onClick={() => setIsPanelOpen(false)}
          />
        </div>

        <form className="query-form" onSubmit={(e) => void handleSubmit(e)}>
          <div className="form-group">
            <label>Category *</label>
            <select
              name="category"
              value={formData.category}
              onChange={handleInputChange}
              required
            >
              <option value="" disabled>
                Select Category
              </option>
              <option value="Technical">Technical</option>
              <option value="Academic">Academic</option>
              <option value="Administrative">Administrative</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div className="form-group">
            <label>Subcategory *</label>
            <input
              type="text"
              name="subcategory"
              maxLength={100}
              placeholder="e.g. Leave Request, Subject Change"
              value={formData.subcategory}
              onChange={handleInputChange}
              required
            />
          </div>

          <div className="form-group">
            <label>Subject *</label>
            <input
              type="text"
              name="subject"
              maxLength={255}
              placeholder="Brief subject line"
              value={formData.subject}
              onChange={handleInputChange}
              required
            />
          </div>

          <div className="form-group">
            <label>Description *</label>
            <textarea
              name="description"
              maxLength={700}
              rows={6}
              placeholder="Detail your issue here... (Max 700 chars)"
              value={formData.description}
              onChange={handleInputChange}
              required
            />
          </div>

          <button type="submit" className="submit-btn" disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit Query'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default NewQueryForm;
