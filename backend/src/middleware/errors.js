// 404 and error handlers. Clients never receive stack traces.
const { HttpError } = require('../errors');

function notFound(req, res, next) {
  next(new HttpError(404, 'Resource not found'));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.status || err.statusCode || 500;
  let message = err.message;
  let details = err.details;

  if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Request body must be valid JSON';
  } else if (err.code === '23505') {
    // unique_violation
    status = 409;
    message = uniqueMessage(err.constraint);
  } else if (err.code === '23514' || err.code === '23503') {
    // check_violation / foreign_key_violation
    status = 409;
    message = 'The request conflicts with existing data';
  } else if (!(err instanceof HttpError) && status >= 500) {
    message = 'Internal server error';
    details = undefined;
  }

  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}:`, err);
  }

  const body = { error: message };
  if (details) body.details = details;
  res.status(status).json(body);
}

function uniqueMessage(constraint = '') {
  if (constraint.includes('isbn')) return 'A book with this ISBN already exists';
  if (constraint.includes('member_code')) return 'A member with this member code already exists';
  if (constraint.includes('email')) return 'This email is already in use';
  return 'A record with these values already exists';
}

module.exports = { notFound, errorHandler };
