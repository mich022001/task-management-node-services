import { laravelRequest } from './laravelClient.js';

export function getTeams(params = {}) {
  return laravelRequest({
    method: 'GET',
    url: '/teams',
    params,
  });
}

export function getTeam(teamId) {
  return laravelRequest({
    method: 'GET',
    url: `/teams/${teamId}`,
  });
}
