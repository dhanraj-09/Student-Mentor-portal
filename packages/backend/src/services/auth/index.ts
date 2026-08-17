export {
  registerStudent,
  registerFaculty,
  loginStudent,
  loginFaculty,
  refreshAccessToken,
} from './authService.js';
export type {
  AuthErrorCode,
  ServiceResult,
  StudentSession,
  FacultySession,
  RegistrationInput,
} from './authService.js';
