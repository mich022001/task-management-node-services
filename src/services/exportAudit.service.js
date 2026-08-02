import { randomUUID } from 'node:crypto';

import { logger } from '../config/logger.js';

function normalizeFilters(filters) {
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) {
    return {};
  }

  return structuredClone(filters);
}

export function createExportAuditEntry({
  user,
  resource,
  format,
  filters = {},
  status,
  filename = null,
  recordCount = null,
  error = null,
  timestamp = new Date(),
}) {
  if (!user?.id) {
    throw new TypeError('Export audit entry requires an authenticated user.');
  }

  if (!resource || typeof resource !== 'string') {
    throw new TypeError('Export audit entry requires a resource.');
  }

  if (!format || typeof format !== 'string') {
    throw new TypeError('Export audit entry requires a format.');
  }

  if (!['success', 'failed'].includes(status)) {
    throw new TypeError('Export audit status must be success or failed.');
  }

  const normalizedTimestamp =
    timestamp instanceof Date ? timestamp : new Date(timestamp);

  if (Number.isNaN(normalizedTimestamp.getTime())) {
    throw new TypeError('Export audit timestamp must be valid.');
  }

  return {
    id: randomUUID(),
    user_id: String(user.id),
    user_email: user.email ?? null,
    role: user.role ?? null,
    resource,
    format,
    filters: normalizeFilters(filters),
    status,
    filename,
    record_count:
      Number.isInteger(recordCount) && recordCount >= 0 ? recordCount : null,
    error:
      status === 'failed' && error
        ? {
            name: error.name ?? 'Error',
            code: error.code ?? null,
            message: error.message ?? 'Export failed.',
          }
        : null,
    created_at: normalizedTimestamp.toISOString(),
  };
}

export function logExportSuccess({
  user,
  resource,
  format,
  filters,
  filename,
  recordCount,
  loggerInstance = logger,
}) {
  const entry = createExportAuditEntry({
    user,
    resource,
    format,
    filters,
    status: 'success',
    filename,
    recordCount,
  });

  loggerInstance.info(
    {
      audit: entry,
    },
    'Export completed successfully.',
  );

  return entry;
}

export function logExportFailure({
  user,
  resource,
  format,
  filters,
  filename = null,
  error,
  loggerInstance = logger,
}) {
  const entry = createExportAuditEntry({
    user,
    resource,
    format,
    filters,
    status: 'failed',
    filename,
    error,
  });

  loggerInstance.error(
    {
      audit: entry,
    },
    'Export failed.',
  );

  return entry;
}
