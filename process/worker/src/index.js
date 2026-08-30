import { WorkerEntrypoint } from 'cloudflare:workers';
import { bootstrapInstitution, persistAdmittedBatch } from './core.mjs';

export class ProcessAdmissionWriterPort extends WorkerEntrypoint {
  async persistAdmittedBatch(request) {
    return persistAdmittedBatch({ request, env: this.env });
  }

  async bootstrapInstitution(request) {
    return bootstrapInstitution({ request, env: this.env });
  }
}

export default {
  async fetch() { return new Response('Not found', { status: 404 }); },
};
