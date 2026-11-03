import doctor from 'oxlint-plugin-react-doctor';

const mutation = doctor.rules['no-mutating-array-method-on-prop-or-hook-result'];

export default {
  ...doctor,
  rules: {
    ...doctor.rules,
    'no-mutating-array-method-on-prop-or-hook-result': {
      ...mutation,
      create(context) {
        const filename = context.physicalFilename ?? context.filename;
        if (
          /\.(test|spec)\.tsx?$/.test(filename) ||
          /\/features\/[^/]+\/integrations(\.ts|\/)/.test(filename)
        )
          return mutation.create(context);
        const ownedContext = Object.create(context, {
          report: {
            value(diagnostic) {
              // Policy owns dotted calls; Doctor retains computed and wrapped receivers.
              const callee = diagnostic.node.callee;
              if (callee?.type === 'MemberExpression' && !callee.computed) return;
              context.report(diagnostic);
            },
          },
        });
        return mutation.create(ownedContext);
      },
    },
  },
};
