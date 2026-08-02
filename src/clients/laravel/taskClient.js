import { laravelRequest } from './laravelClient.js';

export function getTasks(params = {}) {
  return laravelRequest({
    method: 'GET',
    url: '/tasks',
    params,
  });
}

export function getTask(taskId) {
  return laravelRequest({
    method: 'GET',
    url: `/tasks/${taskId}`,
  });
}
