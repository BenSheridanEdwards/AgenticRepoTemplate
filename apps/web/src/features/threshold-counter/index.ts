// Public surface of the threshold-counter feature. Only what is re-exported
// here may be imported by other modules; everything else in this folder
// (the hook, the pure rules) is private. See .agents/project/ARCHITECTURE.md.
export { ThresholdCounter } from './ThresholdCounter';
