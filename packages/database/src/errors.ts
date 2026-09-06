export class DatabaseError extends Error {
  public readonly code: string;

  constructor(message: string, code: string = 'DATABASE_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class DatabaseConnectionError extends DatabaseError {
  public readonly uri?: string;

  constructor(message: string, uri?: string) {
    super(message, 'DATABASE_CONNECTION_ERROR');
    this.uri = uri;
  }
}

export class DatabaseTimeoutError extends DatabaseError {
  constructor(message: string = 'Database operation timed out.') {
    super(message, 'DATABASE_TIMEOUT_ERROR');
  }
}
