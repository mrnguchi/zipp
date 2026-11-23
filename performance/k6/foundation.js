import http from 'k6/http';
import { check } from 'k6';

const target = __ENV.BASE_URL || 'http://api:3000';
if (!/^http:\/\/(api|127\.0\.0\.1|localhost)(:\d+)?$/.test(target) && __ENV.ALLOW_REMOTE_LOAD !== 'true') {
  throw new Error('Remote load requires explicit ALLOW_REMOTE_LOAD=true and an authorized isolated target');
}
const rate = Number(__ENV.RATE || 20);
if (!Number.isInteger(rate) || rate < 1 || rate > 1000) throw new Error('RATE must be between 1 and 1000');
const burst = __ENV.PROFILE === 'burst';
if (burst && rate > 200) throw new Error('Burst RATE must be at most 200 (peak 1000)');
const duration = __ENV.DURATION || '30s';
if (!/^\d+s$/.test(duration) || Number(duration.slice(0,-1)) < 1 || Number(duration.slice(0,-1)) > 120) throw new Error('DURATION must be 1s through 120s');
export const options = {
  scenarios: { foundation: burst ? {
    executor: 'ramping-arrival-rate', startRate: rate, timeUnit: '1s', preAllocatedVUs: 50, maxVUs: 150,
    stages: [{ target: rate, duration: '10s' }, { target: rate * 5, duration: '10s' }, { target: rate, duration: '10s' }],
  } : { executor: 'constant-arrival-rate', rate, timeUnit: '1s', duration, preAllocatedVUs: 20, maxVUs: 100 } },
  thresholds: {
    http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<500', 'p(99)<1000'], checks: ['rate>0.99'], dropped_iterations: ['count==0'],
  },
};
export default function () {
  const response = http.get(`${target}/health/ready`, { timeout: '3s', tags: { endpoint: 'foundation-readiness' } });
  check(response, { ready: (r) => r.status === 200 });
}
