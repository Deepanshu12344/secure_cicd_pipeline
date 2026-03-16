import { useFacultyAuthStore } from '../store/facultyAuth'
import FacultyStudentDetail from './FacultyStudentDetail'

export default function StudentReports() {
  const user = useFacultyAuthStore((state) => state.user)

  if (!user?.studentId) {
    return <div className="min-h-screen bg-[#fbfbfb] p-6 text-[#666]">Student profile is not configured.</div>
  }

  return <FacultyStudentDetail studentId={user.studentId} />
}
