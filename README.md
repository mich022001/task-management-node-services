# Task Management Platform – Node.js Services

Node.js microservice for the **Task Management Platform** responsible for analytics, notifications, data export, and scheduled background jobs.

This service works alongside the Laravel API and provides specialized functionality that is separated from the core application for better scalability and maintainability.

---

## Tech Stack

- Node.js
- Express.js
- JavaScript (ES Modules)
- PostgreSQL (via Laravel API)
- Nodemailer
- node-cron
- ExcelJS
- JWT Authentication
- Jest
- ESLint
- Prettier

---

## Features

### Notifications

- Email notification service
- Gmail SMTP integration
- Notification queue
- User notification preferences
- Laravel service authentication

### Analytics & Reporting

- Task summary analytics
- Team reports
- Team highlights
- Upcoming deadlines
- Member productivity
- Export-ready analytics endpoints

### Data Export

Supports exporting reports in:

- CSV
- JSON
- Excel (.xlsx)

Features include:

- Dynamic report generation
- Browser downloads
- Role-based access
- Audit logging

### Background Scheduler

Automated jobs powered by **node-cron**:

- Daily task digest
- Deadline reminders
- Cleanup jobs
- Graceful shutdown support

---

## Project Structure

```text
src/
├── config/
├── controllers/
├── cron/
├── middleware/
├── routes/
├── services/
├── runtime/
├── validation/
└── server.js

tests/
```

---

## Installation

```bash
git clone https://github.com/mich022001/task-management-node-services.git

cd task-management-node-services

npm install
```

---

## Environment Variables

Create a `.env` file.

Example:

```env
NODE_ENV=development
PORT=3001

LARAVEL_API_URL=http://localhost:8000/api/v1
LARAVEL_INTERNAL_API_URL=http://127.0.0.1:8000/api/v1/internal

JWT_SECRET=your-secret

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

NODE_SERVICE_KEY=your-service-key
```

---

## Running the Service

Development

```bash
npm run dev
```

Production

```bash
npm start
```

---

## Testing

Run automated tests:

```bash
npm test
```

---

## Code Quality

Lint

```bash
npm run lint
```

Format

```bash
npm run format
```

---

## Related Repository

Laravel API

https://github.com/mich022001/task-management-laravel-api

---

## Author

**Michael Valenzuela**
