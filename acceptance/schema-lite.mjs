// bb2dash :: acceptance/schema-lite.mjs
//
// A JSON Schema validator for the few keywords the two schemas in this folder use, with no
// dependency. `validate(schema, value)` returns the problems as plain lines, each starting with
// the place in the value (`$.stages[2].kind: …`); an empty list means the value is valid.
//
// It refuses a keyword it does not check: a schema that leaned on one would pass every value
// silently, and the schema would promise more than this file holds. For the same reason `$ref`
// stands alone: a keyword beside it would be skipped, so a schema that has one is refused.
//
// Checked: type, const, enum, pattern, minLength, maxLength, minimum, maximum, required,
// properties, additionalProperties (false, or a schema), items, minItems, maxItems, oneOf, and
// $ref to `#/$defs/<name>` of the schema it was given.
//
// A value's keys and a schema's keywords are read as the object's own (`Object.hasOwn`), never
// with `in`: every object answers to "constructor" and "toString" without holding them.

/** Keywords that say something about a schema and nothing about a value. */
const ANNOTATIONS = new Set(['$schema', '$id', '$defs', '$comment', 'title', 'description', 'examples']);

const REF_PREFIX = '#/$defs/';

/** The JSON Schema type of a value; an integer is told from other numbers. */
function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
}

function isType(value, wanted) {
  const actual = typeOf(value);
  return actual === wanted || (wanted === 'number' && actual === 'integer');
}

/** One checker per keyword: (the keyword's value, the value under test, where it is, the context) → problems. */
const CHECKS = {
  type(wanted, value, at) {
    const allowed = Array.isArray(wanted) ? wanted : [wanted];
    return allowed.some((name) => isType(value, name)) ? [] : [`${at}: expected ${allowed.join(' or ')}, got ${typeOf(value)}`];
  },
  const(wanted, value, at) {
    return value === wanted ? [] : [`${at}: ${JSON.stringify(value)} is not ${JSON.stringify(wanted)}`];
  },
  enum(allowed, value, at) {
    return allowed.includes(value) ? [] : [`${at}: ${JSON.stringify(value)} is not one of ${allowed.join(', ')}`];
  },
  pattern(source, value, at) {
    if (typeof value !== 'string' || new RegExp(source).test(value)) return [];
    return [`${at}: ${JSON.stringify(value)} does not match ${source}`];
  },
  minLength(least, value, at) {
    return typeof value !== 'string' || value.length >= least ? [] : [`${at}: shorter than ${least} character(s)`];
  },
  maxLength(most, value, at) {
    return typeof value !== 'string' || value.length <= most ? [] : [`${at}: longer than ${most} character(s)`];
  },
  minimum(least, value, at) {
    return typeof value !== 'number' || value >= least ? [] : [`${at}: ${value} is below the minimum ${least}`];
  },
  maximum(most, value, at) {
    return typeof value !== 'number' || value <= most ? [] : [`${at}: ${value} is above the maximum ${most}`];
  },
  minItems(least, value, at) {
    return !Array.isArray(value) || value.length >= least ? [] : [`${at}: fewer than ${least} item(s)`];
  },
  maxItems(most, value, at) {
    return !Array.isArray(value) || value.length <= most ? [] : [`${at}: more than ${most} item(s)`];
  },
  required(names, value, at) {
    if (typeOf(value) !== 'object') return [];
    return names.filter((name) => !Object.hasOwn(value, name)).map((name) => `${at}.${name}: missing`);
  },
  properties(schemas, value, at, context) {
    if (typeOf(value) !== 'object') return [];
    return Object.entries(schemas)
      .filter(([name]) => Object.hasOwn(value, name))
      .flatMap(([name, schema]) => check(schema, value[name], `${at}.${name}`, context));
  },
  additionalProperties(rule, value, at, context) {
    if (typeOf(value) !== 'object') return [];
    const known = new Set(Object.keys(context.schema.properties ?? {}));
    const extra = Object.keys(value).filter((name) => !known.has(name));
    if (rule === false) return extra.map((name) => `${at}.${name}: not an allowed key`);
    return rule === true ? [] : extra.flatMap((name) => check(rule, value[name], `${at}.${name}`, context));
  },
  items(schema, value, at, context) {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item, index) => check(schema, item, `${at}[${index}]`, context));
  },
  oneOf(shapes, value, at, context) {
    const tried = shapes.map((shape) => check(shape, value, at, context));
    const matching = tried.filter((problems) => problems.length === 0).length;
    if (matching === 1) return [];
    if (matching > 1) return [`${at}: matches ${matching} of the ${shapes.length} allowed shapes, and must match one`];
    // The shape with the fewest problems is the one the value was meant to be.
    const nearest = tried.reduce((best, problems) => (problems.length < best.length ? problems : best));
    return [`${at}: matches none of the ${shapes.length} allowed shapes (nearest: ${nearest.join('; ')})`];
  },
};

function resolveRef(ref, root) {
  if (!ref.startsWith(REF_PREFIX)) throw new Error(`schema-lite follows only ${REF_PREFIX}<name>, not "${ref}"`);
  const name = ref.slice(REF_PREFIX.length);
  const definitions = root.$defs ?? {};
  if (!Object.hasOwn(definitions, name)) throw new Error(`schema-lite: no such definition: ${ref}`);
  return definitions[name];
}

/** Follows a `$ref`, which must be the schema object's only keyword: whatever stood beside it would not be checked. */
function followRef(schema, value, at, context) {
  const beside = Object.keys(schema).filter((keyword) => keyword !== '$ref');
  if (beside.length > 0) {
    throw new Error(`schema-lite: "$ref" stands alone, and here it is beside "${beside.join('", "')}" (at ${at})`);
  }
  return check(resolveRef(schema.$ref, context.root), value, at, context);
}

/** The problems of one value against one schema. `context.root` is the schema `$ref` reads its definitions from. */
function check(schema, value, at, context) {
  if (typeOf(schema) !== 'object') throw new Error(`schema-lite: a schema is an object, not ${typeOf(schema)} (at ${at})`);
  if (Object.hasOwn(schema, '$ref')) return followRef(schema, value, at, context);
  for (const keyword of Object.keys(schema)) {
    if (!ANNOTATIONS.has(keyword) && !Object.hasOwn(CHECKS, keyword)) {
      throw new Error(`schema-lite does not check the keyword "${keyword}" (at ${at})`);
    }
  }
  // In the order CHECKS lists them, whatever order the schema wrote them in: the same value
  // always reports the same lines.
  const own = { ...context, schema };
  return Object.keys(CHECKS)
    .filter((keyword) => Object.hasOwn(schema, keyword))
    .flatMap((keyword) => CHECKS[keyword](schema[keyword], value, at, own));
}

/** Every way `value` breaks `schema`, as plain lines; none when it is valid. */
export function validate(schema, value) {
  return check(schema, value, '$', { root: schema, schema });
}
