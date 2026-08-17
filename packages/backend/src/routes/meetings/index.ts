export { default as studentMeetingRoutes } from './student.js';
export { default as facultyMeetingRoutes } from './faculty.js';
// Mount last: it owns the `/meetings/:meeting_id` catch-all.
export { default as sharedMeetingRoutes } from './shared.js';
