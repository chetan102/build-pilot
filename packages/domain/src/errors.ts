export class DomainError extends Error {
  public readonly code: string;

  constructor(message: string, code: string = 'DOMAIN_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidStateTransitionError extends DomainError {
  public readonly fromStatus: string;
  public readonly toStatus: string;

  constructor(fromStatus: string, toStatus: string, details?: string) {
    const msg = `Illegal state transition from "${fromStatus}" to "${toStatus}"${
      details ? `: ${details}` : '.'
    }`;
    super(msg, 'INVALID_STATE_TRANSITION');
    this.fromStatus = fromStatus;
    this.toStatus = toStatus;
  }
}

export class EntityNotFoundError extends DomainError {
  public readonly entityType: string;
  public readonly entityId: string;

  constructor(entityType: string, entityId: string) {
    super(`${entityType} with ID "${entityId}" not found.`, 'ENTITY_NOT_FOUND');
    this.entityType = entityType;
    this.entityId = entityId;
  }
}

export class PermissionDeniedError extends DomainError {
  public readonly permissionClass: string;
  public readonly action: string;

  constructor(action: string, permissionClass: string, reason?: string) {
    super(
      `Permission denied for action "${action}" requiring class "${permissionClass}"${
        reason ? `: ${reason}` : '.'
      }`,
      'PERMISSION_DENIED',
    );
    this.permissionClass = permissionClass;
    this.action = action;
  }
}
