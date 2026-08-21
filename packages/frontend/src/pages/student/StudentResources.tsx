import { ExternalLink } from 'lucide-react';
import { useContext, useEffect, useState } from 'react';
import type { Resource } from 'shared';
import { getApiErrorMessage, getStudentResources } from '../../api/api';
import { StudentContext } from '../../context/StudentContext';
import '../faculty/facultyresources.css';

const StudentResources = () => {
  const { Student, assignedFaculty } = useContext(StudentContext);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const registrationNo = Student?.registration_no ?? null;

  useEffect(() => {
    if (registrationNo === null) return;

    const load = async (): Promise<void> => {
      try {
        const response = await getStudentResources(registrationNo);
        setResources(response.data.items);
        setError(null);
      } catch (loadError) {
        setError(getApiErrorMessage(loadError, 'Could not load resources'));
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [registrationNo]);

  return (
    <div className="resources-page">
      <header className="resources-header">
        <h1>Resources</h1>
        <p>
          {assignedFaculty === null
            ? 'Shared by your mentor once one is assigned.'
            : `Shared by ${assignedFaculty.name}.`}
        </p>
      </header>

      {error !== null && <div className="resources-error">{error}</div>}

      {loading ? (
        <p className="resources-empty">Loading resources...</p>
      ) : resources.length === 0 ? (
        <p className="resources-empty">
          {assignedFaculty === null
            ? 'You do not have an assigned mentor yet.'
            : 'Your mentor has not shared anything yet.'}
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
                    Open <ExternalLink size={14} />
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default StudentResources;
