import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useContext, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Resource } from 'shared';
import {
  createResource,
  deleteResource,
  getApiErrorMessage,
  getFacultyResources,
  updateResource,
} from '../../api/api';
import { FacultyContext } from '../../context/FacultyContext';
import './facultyresources.css';

interface FormState {
  title: string;
  description: string;
  url: string;
  category: string;
}

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  url: '',
  category: '',
};

const FacultyResources = () => {
  const { faculty, loading: facultyLoading } = useContext(FacultyContext);
  const [resources, setResources] = useState<Resource[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  // null means the form is creating rather than editing.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Lists are paged; the page size is generous, so this is a nudge rather
  // than a pager for now.
  const [hasMore, setHasMore] = useState(false);

  const email = faculty?.email ?? null;

  const load = useCallback(async (): Promise<void> => {
    if (email === null) return;
    try {
      const response = await getFacultyResources(email);
      setResources(response.data.items);
      setHasMore(response.data.hasMore);
      setError(null);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError, 'Could not load resources'));
    } finally {
      setLoading(false);
    }
  }, [email]);

  useEffect(() => {
    if (facultyLoading) return;
    void load();
  }, [facultyLoading, load]);

  const resetForm = (): void => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    // Empty optional fields are sent as null so the server stores an absent
    // value rather than an empty string.
    const payload = {
      title: form.title,
      description: form.description.trim() === '' ? null : form.description,
      url: form.url.trim() === '' ? null : form.url,
      category: form.category.trim() === '' ? null : form.category,
    };

    try {
      if (editingId === null) {
        await createResource(payload);
      } else {
        await updateResource(editingId, payload);
      }
      resetForm();
      await load();
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, 'Could not save the resource'));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (resource: Resource): void => {
    setEditingId(resource.resource_id);
    setForm({
      title: resource.title,
      description: resource.description ?? '',
      url: resource.url ?? '',
      category: resource.category ?? '',
    });
  };

  const handleDelete = async (resourceId: number): Promise<void> => {
    setError(null);
    try {
      await deleteResource(resourceId);
      if (editingId === resourceId) resetForm();
      await load();
    } catch (deleteError) {
      setError(getApiErrorMessage(deleteError, 'Could not delete it'));
    }
  };

  return (
    <div className="resources-page">
      <header className="resources-header">
        <h1>Resources</h1>
        <p>Shared with every student currently assigned to you.</p>
      </header>

      {error !== null && <div className="resources-error">{error}</div>}

      <form className="resource-form" onSubmit={(e) => void handleSubmit(e)}>
        <h2>{editingId === null ? 'Add a resource' : 'Edit resource'}</h2>

        <label>
          Title
          <input
            type="text"
            value={form.title}
            maxLength={255}
            required
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </label>

        <label>
          Link (optional)
          <input
            type="url"
            placeholder="https://..."
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
          />
        </label>

        <label>
          Category (optional)
          <input
            type="text"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          />
        </label>

        <label>
          Notes (optional)
          <textarea
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>

        <div className="resource-form-actions">
          <button type="submit" className="btn-primary" disabled={saving}>
            <Plus size={16} />
            {editingId === null ? 'Add resource' : 'Save changes'}
          </button>
          {editingId !== null && (
            <button type="button" className="btn-secondary" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>

      {loading ? (
        <p className="resources-empty">Loading resources...</p>
      ) : resources.length === 0 ? (
        <p className="resources-empty">
          Nothing shared yet. Add your first resource above.
        </p>
      ) : (
        <ul className="resource-list">
          {resources.map((resource) => (
            <li key={resource.resource_id} className="resource-card">
              <div className="resource-body">
                <h3>{resource.title}</h3>
                {resource.category !== null && (
                  <span className="resource-tag">{resource.category}</span>
                )}
                {resource.description !== null && <p>{resource.description}</p>}
                {resource.url !== null && (
                  <a
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {resource.url}
                  </a>
                )}
              </div>
              <div className="resource-actions">
                <button
                  type="button"
                  aria-label="Edit resource"
                  onClick={() => handleEdit(resource)}
                >
                  <Pencil size={16} />
                </button>
                <button
                  type="button"
                  aria-label="Delete resource"
                  onClick={() => void handleDelete(resource.resource_id)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {hasMore && (
        <p className="resources-empty">
          Showing the most recent resources only.
        </p>
      )}
    </div>
  );
};

export default FacultyResources;
