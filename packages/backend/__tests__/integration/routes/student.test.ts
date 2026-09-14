import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FACULTY_EMAIL,
  STUDENT_REGISTRATION_NO,
  facultyProfile,
  meetingRow,
  queryRow,
  studentProfile,
  unassignedStudentProfile,
} from '../../fixtures/mockData.js';

/**
 * The whole stack runs for real — routing, auth middleware, services and the
 * SQL in the model layer — with only the driver replaced. Fake rows are chosen
 * by matching the SQL the model actually issued, so a query that changes shape
 * shows up here rather than silently returning the wrong fixture.
 */
const query = vi.fn();
const queryOne = vi.fn();
const mutate = vi.fn();
/** Statements issued inside withTransaction, so transactional work is checked. */
const txQueries: string[] = [];

vi.mock('../../../src/models/shared/index.js', () => ({
  query: (...a: unknown[]) => query(...a),
  queryOne: (...a: unknown[]) => queryOne(...a),
  mutate: (...a: unknown[]) => mutate(...a),
  // Run the callback for real against a recording connection, otherwise a
  // transactional code path would silently do nothing under test.
  withTransaction: (work: (c: unknown) => Promise<unknown>) =>
    work({
      query: (sql: string) => {
        txQueries.push(String(sql).replace(/\s+/g, ' ').trim());
        return Promise.resolve([{ affectedRows: 1 }]);
      },
    }),
  getPool: vi.fn(),
  isDuplicateEntryError: (error: unknown) =>
    (error as { code?: string }).code === 'ER_DUP_ENTRY',
  verifyConnection: vi.fn(),
  closePool: vi.fn(),
}));

const { createApp } = await import('../../../src/server.js');
const { signAccessToken } = await import('../../../src/utils/jwt.js');

const studentToken = signAccessToken({
  registration_no: STUDENT_REGISTRATION_NO,
  type: 'student',
});
const otherStudentToken = signAccessToken({
  registration_no: '229309999',
  type: 'student',
});
const facultyToken = signAccessToken({
  email: FACULTY_EMAIL,
  type: 'faculty',
});

function flat(sql: unknown): string {
  return String(sql).replace(/\s+/g, ' ');
}

let app: Express;

beforeEach(() => {
  vi.clearAllMocks();
  txQueries.length = 0;
  app = createApp();

  queryOne.mockImplementation((sql: string) => {
    const text = flat(sql);
    if (text.includes('FROM meetings')) {
      return Promise.resolve({
        meeting_id: 5,
        student_id: STUDENT_REGISTRATION_NO,
        faculty_email: FACULTY_EMAIL,
        status: 'ongoing',
        room_name: null,
        e2ee_key_version: 3,
      });
    }
    if (text.includes('FROM student')) return Promise.resolve(studentProfile());
    if (text.includes('FROM faculty')) return Promise.resolve(facultyProfile());
    return Promise.resolve(null);
  });

  query.mockImplementation((sql: string) => {
    const text = flat(sql);
    if (text.includes('FROM queries')) {
      return Promise.resolve([
        queryRow(),
        queryRow({ query_id: 2, status: 'Resolved' }),
      ]);
    }
    if (text.includes('FROM meetings')) {
      return Promise.resolve([
        meetingRow(),
        meetingRow({ meeting_id: 2, status: 'accepted' }),
        meetingRow({ meeting_id: 3, status: 'completed', marks: 24 }),
      ]);
    }
    if (text.includes('FROM resources')) {
      return Promise.resolve([]);
    }
    if (text.includes('assigned_faculty_email IS NULL')) {
      return Promise.resolve([unassignedStudentProfile()]);
    }
    if (text.includes('FROM student'))
      return Promise.resolve([studentProfile()]);
    return Promise.resolve([]);
  });

  mutate.mockResolvedValue({ insertId: 1, affectedRows: 1 });
});

describe('GET /api/student/:registration_no', () => {
  it('rejects an unauthenticated request', async () => {
    const response = await request(app).get(
      `/api/student/${STUDENT_REGISTRATION_NO}`
    );

    expect(response.status).toBe(401);
  });

  it('rejects a garbage bearer token', async () => {
    const response = await request(app)
      .get(`/api/student/${STUDENT_REGISTRATION_NO}`)
      .set('Authorization', 'Bearer not-a-real-token');

    expect(response.status).toBe(401);
  });

  it('rejects a faculty token on a student-only route', async () => {
    const response = await request(app)
      .get(`/api/student/${STUDENT_REGISTRATION_NO}`)
      .set('Authorization', `Bearer ${facultyToken}`);

    expect(response.status).toBe(403);
  });

  it("refuses one student reading another student's profile", async () => {
    const response = await request(app)
      .get(`/api/student/${STUDENT_REGISTRATION_NO}`)
      .set('Authorization', `Bearer ${otherStudentToken}`);

    expect(response.status).toBe(403);
    // The ownership check must short-circuit before any database work.
    expect(queryOne).not.toHaveBeenCalled();
  });

  it('returns the profile to its owner', async () => {
    const response = await request(app)
      .get(`/api/student/${STUDENT_REGISTRATION_NO}`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(response.status).toBe(200);
    expect(response.body.registration_no).toBe(STUDENT_REGISTRATION_NO);
  });

  it('never returns a password hash', async () => {
    const response = await request(app)
      .get(`/api/student/${STUDENT_REGISTRATION_NO}`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(JSON.stringify(response.body)).not.toContain('password');
  });

  it('answers 404 when the row is gone', async () => {
    queryOne.mockResolvedValue(null);

    const response = await request(app)
      .get(`/api/student/${STUDENT_REGISTRATION_NO}`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(response.status).toBe(404);
  });
});

describe('PUT /api/student/:registration_no', () => {
  it('updates the caller own profile', async () => {
    const response = await request(app)
      .put(`/api/student/${STUDENT_REGISTRATION_NO}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ name: 'Asha N.', branch: 'IT', year: 4 });

    expect(response.status).toBe(200);
    expect(mutate).toHaveBeenCalledOnce();
  });

  it('ignores an attempt to self-assign a mentor', async () => {
    await request(app)
      .put(`/api/student/${STUDENT_REGISTRATION_NO}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ name: 'Asha N.', assigned_faculty_email: 'other@example.edu' });

    // Mentor assignment is a faculty action; the update statement must not
    // touch that column whatever the request body says.
    const [sql, params] = mutate.mock.calls[0];
    expect(flat(sql)).not.toContain('assigned_faculty_email');
    expect(params).not.toContain('other@example.edu');
  });
});

describe('GET /api/dashboard/student', () => {
  it('rejects a faculty token', async () => {
    const response = await request(app)
      .get('/api/dashboard/student')
      .set('Authorization', `Bearer ${facultyToken}`);

    expect(response.status).toBe(403);
  });

  it('aggregates queries, meetings and the assigned mentor into one payload', async () => {
    const response = await request(app)
      .get('/api/dashboard/student')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(response.status).toBe(200);
    expect(response.body.student.registration_no).toBe(STUDENT_REGISTRATION_NO);
    expect(response.body.mentor.email).toBe(FACULTY_EMAIL);
    expect(response.body.queries).toEqual({
      total: 2,
      pending: 1,
      resolved: 1,
    });
    expect(response.body.meetings).toEqual({
      total: 3,
      pending: 1,
      accepted: 1,
      ongoing: 0,
      completed: 1,
    });
  });

  it('lists only accepted and ongoing meetings as upcoming', async () => {
    const response = await request(app)
      .get('/api/dashboard/student')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(response.body.upcomingMeetings).toHaveLength(1);
    expect(response.body.upcomingMeetings[0].status).toBe('accepted');
  });

  it('withholds marks from the student payload', async () => {
    const response = await request(app)
      .get('/api/dashboard/student')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(response.body.averageMarks).toBeUndefined();
  });

  it('reports a null mentor for an unassigned student', async () => {
    queryOne.mockImplementation((sql: string) =>
      flat(sql).includes('FROM student')
        ? Promise.resolve({
            ...studentProfile(),
            assigned_faculty_email: null,
          })
        : Promise.resolve(facultyProfile())
    );

    const response = await request(app)
      .get('/api/dashboard/student')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(response.body.mentor).toBeNull();
  });

  it('derives the student from the token, so there is no id to tamper with', async () => {
    await request(app)
      .get('/api/dashboard/student')
      .set('Authorization', `Bearer ${studentToken}`);

    const profileCall = queryOne.mock.calls.find((call) =>
      flat(call[0]).includes('FROM student')
    );
    expect(profileCall?.[1]).toEqual([STUDENT_REGISTRATION_NO]);
  });
});

describe('GET /api/dashboard/faculty', () => {
  it('rejects a student token', async () => {
    const response = await request(app)
      .get('/api/dashboard/faculty')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(response.status).toBe(403);
  });

  it('summarises the mentor caseload, including marks awarded', async () => {
    const response = await request(app)
      .get('/api/dashboard/faculty')
      .set('Authorization', `Bearer ${facultyToken}`);

    expect(response.status).toBe(200);
    expect(response.body.faculty.email).toBe(FACULTY_EMAIL);
    expect(response.body.students).toEqual({ assigned: 1, unassigned: 1 });
    expect(response.body.averageMarks).toBe(24);
    expect(response.body.pendingQueries).toHaveLength(1);
  });
});

describe('GET /api/student/:registration_no/resources', () => {
  it("refuses another student's resource list", async () => {
    const response = await request(app)
      .get(`/api/student/${STUDENT_REGISTRATION_NO}/resources`)
      .set('Authorization', `Bearer ${otherStudentToken}`);

    expect(response.status).toBe(403);
  });

  it('serves the list to its owner', async () => {
    const response = await request(app)
      .get(`/api/student/${STUDENT_REGISTRATION_NO}/resources`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(response.status).toBe(200);
    // Lists are paged, so the body is an envelope rather than a bare array.
    expect(response.body).toEqual({
      items: [],
      page: 1,
      pageSize: 25,
      hasMore: false,
    });
  });
});

describe('POST /api/resources', () => {
  it('rejects a student', async () => {
    const response = await request(app)
      .post('/api/resources')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ title: 'Reading list' });

    expect(response.status).toBe(403);
  });

  it('requires a title', async () => {
    const response = await request(app)
      .post('/api/resources')
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({ url: 'https://example.edu' });

    expect(response.status).toBe(400);
    expect(mutate).not.toHaveBeenCalled();
  });

  it('refuses a javascript: link', async () => {
    // Rendered as an anchor in the student UI, so anything but http(s) would
    // be a stored cross-site scripting vector.
    const response = await request(app)
      .post('/api/resources')
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({ title: 'Reading list', url: 'javascript:alert(1)' });

    expect(response.status).toBe(400);
    expect(mutate).not.toHaveBeenCalled();
  });

  it('stores the resource against the authenticated mentor', async () => {
    const response = await request(app)
      .post('/api/resources')
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({ title: 'Reading list', url: 'https://example.edu/reading' });

    expect(response.status).toBe(201);
    expect(mutate.mock.calls[0][1][0]).toBe(FACULTY_EMAIL);
  });
});

describe('POST /api/meetings/:id/room/reset-keys', () => {
  it('lets the mentor discard a key generation nobody can open', async () => {
    const response = await request(app)
      .post('/api/meetings/5/room/reset-keys')
      .set('Authorization', `Bearer ${facultyToken}`);

    expect(response.status).toBe(200);
    expect(response.body.key_version).toBe(0);

    // All three must happen together: a surviving envelope or request would be
    // sealed to a key generation that no longer means anything.
    expect(
      txQueries.some((q) => /DELETE FROM e2ee_key_envelopes/.test(q))
    ).toBe(true);
    expect(txQueries.some((q) => /DELETE FROM e2ee_key_requests/.test(q))).toBe(
      true
    );
    expect(
      txQueries.some((q) => /UPDATE meetings SET e2ee_key_version = 0/.test(q))
    ).toBe(true);
  });

  it('refuses a student: resetting destroys key material', async () => {
    // A student who cannot open the key should request one instead, which the
    // holder reseals automatically.
    const response = await request(app)
      .post('/api/meetings/5/room/reset-keys')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(response.status).toBe(403);
    // Nothing was destroyed on the way to the refusal.
    expect(txQueries).toHaveLength(0);
  });

  it('refuses someone who is not in the meeting', async () => {
    const response = await request(app)
      .post('/api/meetings/5/room/reset-keys')
      .set('Authorization', `Bearer ${otherStudentToken}`);

    expect(response.status).toBe(403);
  });

  it('rejects an unauthenticated caller', async () => {
    const response = await request(app).post('/api/meetings/5/room/reset-keys');

    expect(response.status).toBe(401);
  });
});

describe('direct messages', () => {
  it('refuses to send without a token', async () => {
    // This route was briefly unauthenticated; the crash that revealed it was
    // luck, so the guard is pinned here.
    const response = await request(app)
      .post('/api/messages')
      .send({ body: 'hello' });

    expect(response.status).toBe(401);
    expect(mutate).not.toHaveBeenCalled();
  });

  it('refuses to mark a thread read without a token', async () => {
    const response = await request(app).put('/api/messages/read').send({});

    expect(response.status).toBe(401);
  });

  it('lets a student message their own mentor', async () => {
    const response = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ body: 'Could we discuss my project?' });

    expect(response.status).toBe(201);
    // The recipient comes from the student's own assignment, never the body.
    const params = mutate.mock.calls[0][1];
    expect(params[0]).toBe(STUDENT_REGISTRATION_NO);
    expect(params[1]).toBe(FACULTY_EMAIL);
    expect(params[2]).toBe('student');
  });

  it('ignores a student_id supplied by a student', async () => {
    await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ body: 'hi', student_id: 'SOMEBODY-ELSE' });

    // A student cannot redirect a message at another conversation.
    expect(mutate.mock.calls[0][1][0]).toBe(STUDENT_REGISTRATION_NO);
  });

  it('rejects an empty message before touching the database', async () => {
    const response = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ body: '   ' });

    expect(response.status).toBe(400);
    expect(mutate).not.toHaveBeenCalled();
  });

  it('rejects a message past the length limit', async () => {
    const response = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ body: 'x'.repeat(4001) });

    expect(response.status).toBe(400);
    expect(mutate).not.toHaveBeenCalled();
  });

  it('refuses a mentor writing to a student who is not theirs', async () => {
    queryOne.mockImplementation((sql: string) =>
      flat(sql).includes('FROM student')
        ? Promise.resolve({
            ...studentProfile(),
            assigned_faculty_email: 'someone.else@example.edu',
          })
        : Promise.resolve(facultyProfile())
    );

    const response = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({ student_id: STUDENT_REGISTRATION_NO, body: 'hello' });

    expect(response.status).toBe(403);
    expect(mutate).not.toHaveBeenCalled();
  });

  it('serves a student their own thread only', async () => {
    query.mockResolvedValue([]);
    queryOne.mockImplementation((sql: string) => {
      const text = flat(sql);
      if (text.includes('COUNT(*)')) return Promise.resolve({ unread: 0 });
      if (text.includes('FROM student'))
        return Promise.resolve(studentProfile());
      return Promise.resolve(facultyProfile());
    });

    const response = await request(app)
      .get('/api/messages/student')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ items: [], unread: 0, page: 1 });
  });

  it('rejects a faculty token on the student thread route', async () => {
    const response = await request(app)
      .get('/api/messages/student')
      .set('Authorization', `Bearer ${facultyToken}`);

    expect(response.status).toBe(403);
  });
});
