import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import FacultyLayout from './layouts/FacultyLayout';
import StudentLayout from './layouts/StudentLayout';
import NotFound from './pages/NotFound';
import FacultyDashboard from './pages/faculty/DashboardFaculty';
import FacultyLogin from './pages/faculty/FacultyLogin';
import FacultyMeetingCall from './pages/faculty/FacultyMeetingCall';
import FacultyMeetings from './pages/faculty/FacultyMeetings';
import FacultyChat from './pages/faculty/FacultyChat';
import FacultyResources from './pages/faculty/FacultyResources';
import StudentsFaculty from './pages/faculty/studentFaculty';
import TeacherProfile from './pages/faculty/TeacherProfile';
import UnassignedStudents from './pages/faculty/UnassignedStudents';
import Dashboard from './pages/student/Dashboard';
import EditProfile from './pages/student/EditProfile';
import Login from './pages/student/Login';
import NewQueryForm from './pages/student/NewQueryForm';
import RaiseQuery from './pages/student/RaiseQuery';
import AuthenticatorSetup from './pages/student/AuthenticatorSetup';
import SetNewPassword from './pages/student/SetNewPassword';
import SetPassword from './pages/student/SetPassword';
import SignUp from './pages/student/SignUp';
import StudentMeetingCall from './pages/student/StudentMeetingCall';
import StudentMeetings from './pages/student/StudentMeetings';
import StudentChat from './pages/student/StudentChat';
import StudentResources from './pages/student/StudentResources';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/register" element={<SignUp />} />
        <Route path="/faculty-login" element={<FacultyLogin />} />

        {/* First login: the student has no password yet (steps 3 to 8). */}
        <Route path="/set-password" element={<SetPassword />} />
        <Route
          path="/set-password/authenticator"
          element={<AuthenticatorSetup />}
        />
        <Route path="/set-password/new" element={<SetNewPassword />} />

        <Route element={<StudentLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/new-query" element={<NewQueryForm />} />
          <Route path="/Raise-Query" element={<RaiseQuery />} />
          <Route path="/edit-profile" element={<EditProfile />} />
          <Route path="/student-meetings" element={<StudentMeetings />} />
          <Route
            path="/student-meetings/:meetingId/call"
            element={<StudentMeetingCall />}
          />
          <Route path="/student-resources" element={<StudentResources />} />
          <Route path="/student-chat" element={<StudentChat />} />
        </Route>

        <Route element={<FacultyLayout />}>
          <Route path="/dashboard-faculty" element={<FacultyDashboard />} />
          <Route path="/faculty-students" element={<StudentsFaculty />} />
          <Route path="/unassigned-students" element={<UnassignedStudents />} />
          <Route path="/faculty-meetings" element={<FacultyMeetings />} />
          <Route
            path="/faculty-meetings/:meetingId/call"
            element={<FacultyMeetingCall />}
          />
          <Route path="/faculty-resources" element={<FacultyResources />} />
          <Route path="/faculty-chat" element={<FacultyChat />} />
          <Route path="/faculty-profile" element={<TeacherProfile />} />
        </Route>

        {/* Anything unmatched, rather than a blank page. */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  );
}

export default App;
