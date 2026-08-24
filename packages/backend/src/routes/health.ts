import { Router } from 'express';
import { verifyConnection } from '../models/shared/index.js';
import { isLiveKitConfigured } from '../services/meetings/livekitService.js';

/**
 * Liveness and readiness.
 *
 * `/health` answers whether this process is up at all — it must not touch a
 * dependency, or a database blip would have an orchestrator restart a server
 * that is working fine.
 *
 * `/ready` answers whether the process can actually serve traffic, which is
 * the question a load balancer needs. Returning 200 without checking meant an
 * instance whose database had gone kept receiving requests, and left "is the
 * stack up?" with no single answer.
 */

const router = Router();

/** Long enough for a busy pool, short enough not to hold up a probe. */
const DB_TIMEOUT_MS = 2000;

type DependencyState = 'ok' | 'down' | 'not_configured';

interface ReadinessReport {
  status: 'ready' | 'degraded';
  database: DependencyState;
  livekit: DependencyState;
  uptimeSeconds: number;
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_resolve, reject) =>
      setTimeout(() => reject(new Error('timed out')), ms)
    ),
  ]);
}

async function checkDatabase(): Promise<DependencyState> {
  try {
    await withTimeout(verifyConnection(), DB_TIMEOUT_MS);
    return 'ok';
  } catch {
    return 'down';
  }
}

router.get('/health', (_req, res) => {
  res.status(200).json({ status: 'Server is running' });
});

router.get('/ready', (_req, res, next) => {
  void checkDatabase()
    .then((database) => {
      // LiveKit is only reachable from the browser, so the server can report
      // whether it is configured but not whether it is up. Saying so plainly
      // beats implying a check that never happened.
      const livekit: DependencyState = isLiveKitConfigured()
        ? 'ok'
        : 'not_configured';

      const report: ReadinessReport = {
        // Video is a feature of this portal, not a prerequisite for serving
        // it, so only the database decides readiness.
        status: database === 'ok' ? 'ready' : 'degraded',
        database,
        livekit,
        uptimeSeconds: Math.round(process.uptime()),
      };

      res.status(report.status === 'ready' ? 200 : 503).json(report);
    })
    .catch(next);
});

export { router as healthRoutes };
export default router;
