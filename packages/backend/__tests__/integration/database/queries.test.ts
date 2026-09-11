import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FACULTY_EMAIL,
  STUDENT_REGISTRATION_NO,
  queryRow,
} from '../../fixtures/mockData.js';

const query = vi.fn();
const queryOne = vi.fn();
const mutate = vi.fn();

vi.mock('../../../src/models/shared/index.js', () => ({
  query: (...args: unknown[]) => query(...args),
  queryOne: (...args: unknown[]) => queryOne(...args),
  mutate: (...args: unknown[]) => mutate(...args),
  withTransaction: vi.fn(),
  getPool: vi.fn(),
  isDuplicateEntryError: vi.fn(),
  verifyConnection: vi.fn(),
  closePool: vi.fn(),
}));

const {
  findQueriesByStudent,
  findQueriesByFaculty,
  findQueryOwnedByFaculty,
  insertQuery,
  updateQueryResponse,
} = await import('../../../src/models/community/Query.js');

const {
  findResourcesForStudent,
  findResourceOwnedByFaculty,
  insertResource,
  deleteResource,
} = await import('../../../src/models/community/Resource.js');

/** Collapses the SQL to one line so assertions ignore source formatting. */
function sqlOf(call: unknown[]): string {
  return String(call[0]).replace(/\s+/g, ' ').trim();
}

beforeEach(() => {
  vi.clearAllMocks();
  query.mockResolvedValue([]);
  queryOne.mockResolvedValue(null);
  mutate.mockResolvedValue({ insertId: 7, affectedRows: 1 });
});

describe('query model', () => {
  it('scopes a student listing to that student, via a bound parameter', async () => {
    await findQueriesByStudent(STUDENT_REGISTRATION_NO);

    const [sql, params] = query.mock.calls[0];
    expect(sqlOf([sql])).toContain('WHERE student_id = ?');
    expect(params).toEqual([STUDENT_REGISTRATION_NO]);
  });

  it('never interpolates the identifier into the SQL text', async () => {
    // A registration number is user-controlled; if it ever reached the SQL
    // string itself this assertion is how we would find out.
    const hostile = "229301001' OR '1'='1";
    await findQueriesByStudent(hostile);

    const [sql, params] = query.mock.calls[0];
    expect(String(sql)).not.toContain(hostile);
    expect(params).toEqual([hostile]);
  });

  it('reaches a faculty listing only through the mentorship join', async () => {
    await findQueriesByFaculty(FACULTY_EMAIL);

    const sql = sqlOf(query.mock.calls[0]);
    expect(sql).toContain('JOIN student s ON q.student_id = s.registration_no');
    expect(sql).toContain('WHERE s.assigned_faculty_email = ?');
  });

  it('returns the rows the driver produced', async () => {
    const rows = [queryRow(), queryRow({ query_id: 2 })];
    query.mockResolvedValue(rows);

    await expect(findQueriesByStudent(STUDENT_REGISTRATION_NO)).resolves.toBe(
      rows
    );
  });

  it('checks ownership by joining through the student, not by trusting the caller', async () => {
    await findQueryOwnedByFaculty('12', FACULTY_EMAIL);

    const [sql, params] = queryOne.mock.calls[0];
    expect(sqlOf([sql])).toContain(
      'WHERE q.query_id = ? AND s.assigned_faculty_email = ?'
    );
    expect(params).toEqual(['12', FACULTY_EMAIL]);
  });

  it('returns the new id from an insert', async () => {
    const id = await insertQuery({
      student_id: STUDENT_REGISTRATION_NO,
      category: 'Academics',
      subcategory: 'Curriculum',
      subject: 'Elective choice',
      description: 'Which elective?',
    });

    expect(id).toBe(7);
    expect(mutate.mock.calls[0][1]).toEqual([
      STUDENT_REGISTRATION_NO,
      'Academics',
      'Curriculum',
      'Elective choice',
      'Which elective?',
    ]);
  });

  it('stamps responded_at server-side rather than from the request', async () => {
    await updateQueryResponse('12', 'Take the systems elective', 'Resolved');

    const sql = sqlOf(mutate.mock.calls[0]);
    expect(sql).toContain('responded_at = NOW()');
    expect(mutate.mock.calls[0][1]).toEqual([
      'Take the systems elective',
      'Resolved',
      '12',
    ]);
  });
});

describe('resource model', () => {
  it("limits a student to their own mentor's resources through the join", async () => {
    await findResourcesForStudent(STUDENT_REGISTRATION_NO);

    const [sql, params] = query.mock.calls[0];
    expect(sqlOf([sql])).toContain(
      'JOIN student s ON s.assigned_faculty_email = r.faculty_email'
    );
    expect(params).toEqual([STUDENT_REGISTRATION_NO]);
  });

  it('binds the owner into the ownership lookup', async () => {
    await findResourceOwnedByFaculty('3', FACULTY_EMAIL);

    const [sql, params] = queryOne.mock.calls[0];
    expect(sqlOf([sql])).toContain(
      'WHERE resource_id = ? AND faculty_email = ?'
    );
    expect(params).toEqual(['3', FACULTY_EMAIL]);
  });

  it('records the author on insert', async () => {
    await insertResource({
      faculty_email: FACULTY_EMAIL,
      title: 'Systems reading list',
      description: null,
      url: 'https://example.edu/reading',
      category: 'Reading',
    });

    expect(mutate.mock.calls[0][1]).toEqual([
      FACULTY_EMAIL,
      'Systems reading list',
      null,
      'https://example.edu/reading',
      'Reading',
    ]);
  });

  it("scopes a delete to the owner so one mentor cannot remove another mentor's resource", async () => {
    mutate.mockResolvedValue({ insertId: 0, affectedRows: 0 });

    const affected = await deleteResource('3', FACULTY_EMAIL);

    expect(sqlOf(mutate.mock.calls[0])).toContain(
      'WHERE resource_id = ? AND faculty_email = ?'
    );
    expect(affected).toBe(0);
  });
});
