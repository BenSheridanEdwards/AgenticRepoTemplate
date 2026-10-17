/**
 * The architecture contract as data: the roles, their allowed directions and
 * the roles every package must hold. The roles and directions come from the
 * `boundaries` block of `.fallowrc.jsonc`, as Fallow resolves it
 * (`fallow config --format json`), so the rules file stays the one source.
 * `fallow list --boundaries` is not the input: it drops `allowTypeOnly`.
 */

/**
 * @typedef {'web-app' | 'web-api-client' | 'web-routes' | 'web-features' | 'ui'
 *   | 'api-app' | 'api-trpc' | 'api-procedures' | 'api-application' | 'api-domain'
 *   | 'api-integrations'} Role
 * @typedef {'web' | 'api' | 'ui'} Kind
 * @typedef {{ readonly from: Role, readonly to: Role, readonly typeOnly: boolean }} Direction
 * @typedef {{
 *   readonly roles: readonly Role[],
 *   readonly directions: readonly Direction[],
 *   readonly requiredRoles: Readonly<Record<'web' | 'api', readonly Role[]>>,
 *   readonly kindOf: (role: Role) => Kind,
 *   readonly roleOf: (file: string) => Role | undefined,
 * }} Contract
 */

/** The roles each package of a result must hold; `web-features` and `api-integrations` are optional. */
const REQUIRED_ROLES = {
  web: ['web-app', 'web-api-client', 'web-routes'],
  api: ['api-app', 'api-trpc', 'api-procedures', 'api-application', 'api-domain'],
};

/** Translate a Fallow zone glob (`**`, `*`, `{a,b}`, literal paths) into an anchored RegExp. */
export function globToRegExp(pattern) {
  let body = '';
  let braceDepth = 0;
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (pattern.startsWith('**', index)) {
      body += '.*';
      index += 1;
    } else if (character === '*') {
      body += '[^/]*';
    } else if (character === '{') {
      braceDepth += 1;
      body += '(?:';
    } else if (character === '}' && braceDepth > 0) {
      braceDepth -= 1;
      body += ')';
    } else if (character === ',' && braceDepth > 0) {
      body += '|';
    } else {
      body += character.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${body}$`);
}

/** @param {string} role @returns {Kind} */
function kindOf(role) {
  if (role === 'ui') {
    return 'ui';
  }
  const kind = role.split('-')[0];
  if (kind === 'web' || kind === 'api') {
    return kind;
  }
  throw new Error(
    `contract: zone "${role}" names no package kind; start its name with web-, api- or ui.`,
  );
}

/**
 * @param {string} configJson output of `fallow config --format json`
 * @returns {Contract}
 */
export function loadContract(configJson) {
  const { boundaries } = JSON.parse(configJson);
  if (!boundaries?.zones) {
    throw new Error('contract: the Fallow config has no boundaries; check .fallowrc.jsonc.');
  }
  const roles = boundaries.zones.map((zone) => zone.name);
  roles.forEach(kindOf);
  for (const role of Object.values(REQUIRED_ROLES).flat()) {
    if (!roles.includes(role)) {
      throw new Error(`contract: required role "${role}" has no zone in .fallowrc.jsonc.`);
    }
  }
  const directions = boundaries.rules.flatMap((rule) => [
    ...(rule.allow ?? []).map((to) => ({ from: rule.from, to, typeOnly: false })),
    ...(rule.allowTypeOnly ?? []).map((to) => ({ from: rule.from, to, typeOnly: true })),
  ]);
  const matchers = boundaries.zones.flatMap((zone) =>
    zone.patterns.map((pattern) => ({ regExp: globToRegExp(pattern), role: zone.name })),
  );
  return {
    roles,
    directions,
    requiredRoles: REQUIRED_ROLES,
    kindOf,
    roleOf: (file) => matchers.find((matcher) => matcher.regExp.test(file))?.role,
  };
}
