import { defineConfig } from 'styleproof';

// Review gate: the StyleProof status stays red until a reviewer ticks
// "Approve all changes" on the report comment. styleproof-init scaffolds
// blocking: 'advisory', which would turn that status green unconditionally.
export default defineConfig({
  blocking: true,
  requireApproval: true,
});
