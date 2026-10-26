# 72. Pin the anti-slop CLI dependencies

- **Status:** Proposed

Implement [0070](0070-vendored-anti-slop-oxlint-rules.md): root devDependencies
`oxlint` and `@oxlint/plugins` at exactly `1.78.0`, with its installation safeguards.
G1 adds commands; G2 wires gates. Fallow classifies the root advisory module as config.
