export { assignStudentToFaculty } from './Assignment.js';

export {
  findQueriesByStudent,
  findQueriesByFaculty,
  insertQuery,
  findQueryOwnedByFaculty,
  updateQueryResponse,
} from './Query.js';
export type { QueryRow, NewQuery } from './Query.js';

export {
  findResourcesByFaculty,
  findResourcesForStudent,
  findResourceOwnedByFaculty,
  insertResource,
  updateResource,
  deleteResource,
} from './Resource.js';
export type { ResourceRow, NewResource, ResourceUpdate } from './Resource.js';

export {
  findThread,
  insertMessage,
  markThreadRead,
  countUnread,
  findFacultyThreads,
} from './Message.js';
export type { MessageRow, NewMessage, ThreadSummaryRow } from './Message.js';
