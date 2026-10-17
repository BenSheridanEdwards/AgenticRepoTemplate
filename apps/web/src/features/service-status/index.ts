// Public surface of the service-status feature. Only what is re-exported here
// may be imported by other modules; everything else in this folder (the hook,
// the fetch/parse function) is private. See .agents/project/ARCHITECTURE.md.
export { ServiceStatus } from './ServiceStatus';
