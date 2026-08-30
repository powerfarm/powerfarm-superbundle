export class InstitutionalRefusalError extends Error {
  constructor({ reason = 'institutional authority denied', code = 'POWERFARM_REFUSED', decision = 'DENY', toolName, runRef = null } = {}) {
    super(reason);
    this.name = 'InstitutionalRefusalError';
    this.code = code;
    this.decision = decision;
    this.toolName = toolName;
    this.runRef = runRef;
  }
}
