import { laravelRequest } from './laravelClient.js';

export function getUsers(params = {}) {
  return laravelRequest({
    method: 'GET',
    url: '/users',
    params,
  });
}

export function getUser(userId) {
  return laravelRequest({
    method: 'GET',
    url: `/users/${userId}`,
  });
}
