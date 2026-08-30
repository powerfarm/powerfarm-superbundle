const UNSAFE = /[^a-z0-9_-]+/g;

export function kindify(value) {
  return String(value).toLowerCase().replace(UNSAFE, '-').replace(/^-+|-+$/g, '') || 'unnamed';
}

export class MappingError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MappingError';
  }
}

export class DottedToolPolicy {
  constructor({ mappings = {}, strict = true, prefix = 'tool.invoke', subjectPrefix = 'tool:' } = {}) {
    this.mappings = { ...mappings };
    this.strict = strict;
    this.prefix = prefix;
    this.subjectPrefix = subjectPrefix;
  }

  project(toolName) {
    const explicit = this.mappings[toolName];
    if (explicit) {
      if (!explicit.kind || !explicit.subject) throw new MappingError(`invalid mapping for ${toolName}`);
      return { kind: String(explicit.kind), subject: String(explicit.subject) };
    }
    if (this.strict) throw new MappingError(`tool ${JSON.stringify(toolName)} has no explicit institutional mapping`);
    const safe = kindify(toolName);
    return { kind: `${this.prefix}.${safe}`, subject: `${this.subjectPrefix}${safe}` };
  }
}
