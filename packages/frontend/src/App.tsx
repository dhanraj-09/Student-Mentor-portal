import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import FacultyLayout from './layouts/FacultyLayout';
import StudentLayout from './layouts/StudentLayout';
import FacultyDashboard from './pages/faculty/DashboardFaculty';
import FacultyLogin from './pages/faculty/FacultyLogin';
import FacultyMeetingCall from './pages/faculty/FacultyMeetingCall';
import FacultyMeetings from './pages/faculty/FacultyMeetings';
import FacultyResources from './pages/faculty/FacultyResources';
import StudentsFaculty from './pages/faculty/studentFaculty';
import TeacherProfile from './pages/faculty/TeacherProfile';
import UnassignedStudents from './pages/faculty/UnassignedStudents';
import Dashboard from './pages/student/Dashboard';
import EditProfile from './pages/student/EditProfile';
import Login from './pages/student/Login';
import NewQueryForm from './pages/student/NewQueryForm';
import RaiseQuery from './pages/student/RaiseQuery';
import SignUp from './pages/student/SignUp';
import StudentMeetingCall from './pages/student/StudentMeetingCall';
import StudentMeetings from './pages/student/StudentMeetings';
import StudentResources from './pages/student/StudentResources';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/register" element={<SignUp />} />
        <Route path="/faculty-login" element={<FacultyLogin />} />

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
          <Route path="/faculty-profile" element={<TeacherProfile />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
