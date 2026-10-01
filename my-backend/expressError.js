// Error types that carry an HTTP status code. Routes throw these inside their try blocks and
// send back `error.status` with the message.

class ExpressError extends Error {
    constructor(message, status) {
        super();
        this.message = message;
        this.status = status;
    }
}

// 404: the thing asked for doesn't exist (or isn't yours to see).
class NotFoundError extends ExpressError {
    constructor(message = 'Not Found') {
        super(message, 404);
    }
}

// 400: the request itself is invalid (missing field, wrong value).
class BadRequestError extends ExpressError {
    constructor(message = 'Bad Request') {
        super(message, 400);
    }
}

// 401: not signed in, or the login token is invalid.
class UnauthorizedError extends ExpressError {
    constructor(message = 'Unauthorized') {
        super(message, 401);
    }
}

// 403: signed in, but not allowed to do this.
class ForbiddenError extends ExpressError {
    constructor(message = 'Forbidden') {
        super(message, 403);
    }
}

// 429: out of credits, or at a guest limit.
class QuotaExceededError extends ExpressError {
    constructor(message = 'Quota exceeded') {
        super(message, 429);
    }
}

module.exports = { ExpressError, NotFoundError, BadRequestError, UnauthorizedError, ForbiddenError, QuotaExceededError };
