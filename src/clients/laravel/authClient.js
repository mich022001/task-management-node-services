import { publicLaravelRequest } from './publicLaravelClient.js';

export function login(credentials) {
  return publicLaravelRequest({
    method: 'POST',
    url: '/auth/login',
    data: credentials,
  });
}
