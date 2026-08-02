# Task Management Node.js Services

Node.js services for the Task Management Platform.

This repository contains the Express.js services that complement the Laravel API by providing reusable infrastructure for authentication, authorization, structured logging, error handling, and future services such as notifications and analytics.

---

## Tech Stack

- Node.js 20+
- Express 5
- JSON Web Token
- Pino
- Zod
- Jest
- Supertest
- ESLint

---

## Requirements

- Node.js 20+
- npm 10+

---

## Installation

Clone the repository:

```bash
git clone https://github.com/mich022001/task-management-node-services.git
```

Enter the project directory:

```bash
cd task-management-node-services
```

Install dependencies:

```bash
npm install
```

---

## Environment Setup

Copy the example environment file:

```bash
cp .env.example .env
```

Configure the required environment variables:

```env
NODE_ENV=development
PORT=3000

JWT_SECRET=replace-with-a-secret-at-least-32-characters

FRONTEND_URL=http://localhost:5173
LOG_LEVEL=info

LARAVEL_API_URL=http://localhost:8000/api/v1
LARAVEL_INTERNAL_API_URL=http://localhost:8000/api/v1/internal
LARAVEL_SERVICE_KEY=
```

The real `.env` file must not be committed to Git.

When the Node.js service verifies JWTs issued by Laravel, both applications must use the same JWT secret.

---

## Running the Application

### Development

```bash
npm run dev
```

The development server uses Nodemon and automatically restarts when source files change.

### Production

```bash
npm start
```

The service runs on:

```text
http://localhost:3000
```

unless another port is configured.

---

## Available Endpoints

### Health Endpoint

```http
GET /api/v1/health
```

Example response:

```json
{
  "message": "Task Management Node.js Services",
  "status": "ok",
  "environment": "development",
  "version": "1.0.0",
  "uptime": 120.34,
  "timestamp": "2026-08-02T03:50:00.000Z"
}
```

The health response contains:

- Service name
- Application status
- Current environment
- Application version
- Process uptime
- Current timestamp

---

## Protected Verification Endpoints

These endpoints verify JWT authentication and role authorization.

### Authenticated Profile

```http
GET /api/v1/protected/profile
```

Allowed roles:

- admin
- manager
- team_member

### Admin Endpoint

```http
GET /api/v1/protected/admin
```

Allowed roles:

- admin

### Management Endpoint

```http
GET /api/v1/protected/management
```

Allowed roles:

- admin
- manager

### Error Handler Verification

```http
GET /api/v1/protected/error
```

This endpoint intentionally returns an HTTP `500` response to verify centralized error handling.

It is available only when:

```env
NODE_ENV=development
```

or:

```env
NODE_ENV=test
```

It is not registered in production.

---

## JWT Authentication

Protected endpoints require a Bearer token:

```http
Authorization: Bearer <JWT_TOKEN>
```

The JWT payload should contain:

```json
{
  "sub": "1",
  "email": "admin@example.com",
  "role": "admin",
  "is_active": true
}
```

Supported roles:

- `admin`
- `manager`
- `team_member`

The authentication middleware:

- Reads the Bearer token
- Verifies the JWT signature
- Rejects invalid tokens
- Rejects expired tokens
- Validates the token subject
- Attaches the normalized user to the request

The authorization middleware:

- Supports one or multiple allowed roles
- Rejects missing role claims
- Rejects unauthorized users
- Returns consistent JSON errors

---

## Error Responses

Application errors use a consistent JSON structure:

```json
{
  "message": "You are not authorized to perform this action.",
  "code": "FORBIDDEN"
}
```

Validation-related errors may also include:

```json
{
  "message": "Validation failed.",
  "code": "VALIDATION_ERROR",
  "errors": {
    "field": [
      "The field is invalid."
    ]
  }
}
```

Stack traces are returned only in the development environment.

---

## Logging

The application uses Pino for structured logging.

Logged information includes:

- Request method
- Request URL
- Response status
- Response duration
- Client address
- Server errors
- Startup events
- Shutdown events

Log levels are determined by response status:

- `info` for successful responses
- `warn` for client errors
- `error` for server errors

Sensitive values such as authorization headers, passwords, and tokens are redacted.

---

## Graceful Shutdown

The server handles:

- `SIGINT`
- `SIGTERM`
- Uncaught exceptions
- Unhandled promise rejections

The HTTP server is closed before the process exits.

A forced shutdown occurs if the server does not close within the configured timeout.

---

## Testing

Run the complete test suite:

```bash
npm test
```

Current automated test coverage includes:

- Environment validation
- Health endpoint
- Missing JWT
- Invalid JWT
- Expired JWT
- Malformed authorization headers
- Valid authentication
- Admin authorization
- Manager authorization
- Team Member authorization
- Missing role claims
- Unknown routes
- Centralized server errors
- Malformed JSON requests

Current test status:

```text
Test Suites: 5 passed
Tests:       23 passed
```

Generate a coverage report:

```bash
npm test -- --coverage
```

Current coverage:

```text
Statements: 87.5%
Lines:      88.34%
```

Environment validation tests run in child processes. Their behavior is tested, but those child processes are not included in Jest's main-process coverage instrumentation.

---

## Linting

Run ESLint:

```bash
npm run lint
```

The project uses ESLint flat configuration through:

```text
eslint.config.js
```

---

## Project Structure

```text
task-management-node-services/
├── src/
│   ├── config/
│   │   ├── env.js
│   │   └── logger.js
│   ├── controllers/
│   │   └── health.controller.js
│   ├── errors/
│   │   └── AppError.js
│   ├── middleware/
│   │   ├── authenticate.js
│   │   ├── authorizeRoles.js
│   │   ├── errorHandler.js
│   │   └── notFound.js
│   ├── routes/
│   │   ├── health.routes.js
│   │   └── protected.routes.js
│   ├── app.js
│   └── server.js
├── tests/
│   ├── helpers/
│   │   └── jwt.js
│   ├── authentication.test.js
│   ├── authorization.test.js
│   ├── environment.test.js
│   ├── errorHandler.test.js
│   └── health.test.js
├── .env.example
├── eslint.config.js
├── jest.config.js
├── package.json
└── README.md
```

---

## Laravel Integration

The Node.js service can validate JWTs generated by the Laravel API when both services use the same JWT secret and signing algorithm.

Role-based authorization also requires the token to contain the following claims:

```json
{
  "email": "manager@example.com",
  "role": "manager",
  "is_active": true
}
```

If Laravel does not include these claims, the Node.js service must retrieve the authenticated user's details from Laravel before performing role authorization.

---

## License

ISC
