import { laravelRequest } from './laravelClient.js';

export function checkLaravelHealth() {
  return laravelRequest({
    method: 'GET',
    url: '/health',
  });
}
