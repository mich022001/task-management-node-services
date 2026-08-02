import AxiosMockAdapter from 'axios-mock-adapter';

import { checkLaravelHealth } from '../src/clients/laravel/healthClient.js';
import { getUser, getUsers } from '../src/clients/laravel/userClient.js';
import { getTeam, getTeams } from '../src/clients/laravel/teamClient.js';
import { getTask, getTasks } from '../src/clients/laravel/taskClient.js';
import { laravelAxios } from '../src/clients/laravel/laravelClient.js';

describe('Laravel internal API modules', () => {
  let mock;

  beforeEach(() => {
    mock = new AxiosMockAdapter(laravelAxios);
  });

  afterEach(() => {
    mock.restore();
  });

  test('health client calls the internal health endpoint', async () => {
    mock.onGet('/health').reply(200, {
      message: 'Internal Laravel API is available.',
      data: {
        status: 'ok',
      },
    });

    const response = await checkLaravelHealth();

    expect(response.data.status).toBe('ok');
  });

  test('user client lists users with query parameters', async () => {
    mock
      .onGet('/users', {
        params: {
          role: 'manager',
          per_page: 10,
        },
      })
      .reply(200, {
        data: [
          {
            id: 2,
            role: 'manager',
          },
        ],
      });

    const response = await getUsers({
      role: 'manager',
      per_page: 10,
    });

    expect(response.data).toHaveLength(1);
    expect(response.data[0].role).toBe('manager');
  });

  test('user client retrieves a user by id', async () => {
    mock.onGet('/users/2').reply(200, {
      data: {
        user: {
          id: 2,
          name: 'Team Manager',
        },
      },
    });

    const response = await getUser(2);

    expect(response.data.user.id).toBe(2);
  });

  test('team client lists teams with query parameters', async () => {
    mock
      .onGet('/teams', {
        params: {
          per_page: 5,
        },
      })
      .reply(200, {
        data: [
          {
            id: 1,
            name: 'Engineering',
          },
        ],
      });

    const response = await getTeams({
      per_page: 5,
    });

    expect(response.data[0].name).toBe('Engineering');
  });

  test('team client retrieves a team by id', async () => {
    mock.onGet('/teams/1').reply(200, {
      data: {
        team: {
          id: 1,
          name: 'Engineering',
        },
      },
    });

    const response = await getTeam(1);

    expect(response.data.team.id).toBe(1);
  });

  test('task client lists tasks with filters', async () => {
    mock
      .onGet('/tasks', {
        params: {
          status: 'pending',
          priority: 'high',
          team_id: 1,
        },
      })
      .reply(200, {
        data: [
          {
            id: 5,
            status: 'pending',
            priority: 'high',
          },
        ],
      });

    const response = await getTasks({
      status: 'pending',
      priority: 'high',
      team_id: 1,
    });

    expect(response.data).toHaveLength(1);
    expect(response.data[0].status).toBe('pending');
  });

  test('task client retrieves a task by id', async () => {
    mock.onGet('/tasks/5').reply(200, {
      data: {
        task: {
          id: 5,
          title: 'Write API documentation',
        },
      },
    });

    const response = await getTask(5);

    expect(response.data.task.id).toBe(5);
  });
});
