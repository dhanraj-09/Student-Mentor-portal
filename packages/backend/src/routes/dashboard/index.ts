import { Router } from 'express';
import facultyDashboardRoutes from './faculty.js';
import studentDashboardRoutes from './student.js';

/**
 * Both dashboards live under the literal `/dashboard` segment, so this router
 * cannot collide with the `/student/:registration_no` catch-alls in profile.
 */
const router = Router();

router.use(studentDashboardRoutes);
router.use(facultyDashboardRoutes);

export { router as dashboardRoutes };
export default router;
