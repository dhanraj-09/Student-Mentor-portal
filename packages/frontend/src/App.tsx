import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import FacultyLayout from './layouts/FacultyLayout';
import StudentLayout from './layouts/StudentLayout';
import FacultyDashboard from './pages/faculty/DashboardFaculty';
import FacultyLogin from './pages/faculty/FacultyLogin';
import FacultyMeetings from './pages/faculty/FacultyMeetings';
import StudentsFaculty from './pages/faculty/studentFaculty';
import TeacherProfile from './pages/faculty/TeacherProfile';
import UnassignedStudents from './pages/faculty/UnassignedStudents';
import Dashboard from './pages/student/Dashboard';
import EditProfile from './pages/student/EditProfile';
import Login from './pages/student/Login';
import NewQueryForm from './pages/student/NewQueryForm';
import RaiseQuery from './pages/student/RaiseQuery';
import SignUp from './pages/student/SignUp';
import StudentMeetings from './pages/student/StudentMeetings';

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
        </Route>

        <Route element={<FacultyLayout />}>
          <Route path="/dashboard-faculty" element={<FacultyDashboard />} />
          <Route path="/faculty-students" element={<StudentsFaculty />} />
          <Route path="/unassigned-students" element={<UnassignedStudents />} />
          <Route path="/faculty-meetings" element={<FacultyMeetings />} />
        </Route>

        <Route path="/faculty-profile" element={<TeacherProfile />} />
      </Routes>
    </Router>
  );
}

export default App;
