// The part of JSON Schema that schema/surviving-lines.schema.json uses, checked by hand so the tests need
// no dependency: type, const, enum, required, properties, additionalProperties false, items, minimum and
// maximum, and local $ref ("#/$defs/name"). Returns every violation with its path; an empty list means the value conforms.
// (test/surviving-lines.test.js carries its own copy of this function; keep the two in step.)

/**
 * @param {any} schema
 * @param {any} value
 * @param {string} [path]
 * @param {any} [root] the document that local $ref values ("#/$defs/name") are resolved against
 * @returns {string[]}
 */
export function schemaErrors(schema, value, path = "$", root = schema) {
  if (typeof schema.$ref === "string") {
    const target = schema.$ref.replace(/^#\//, "").split("/").reduce((/** @type {any} */ node, key) => node?.[key], root);
    if (!target) return [`${path}: unresolved reference ${schema.$ref}`];
    return schemaErrors(target, value, path, root);
  }
  /** @type {string[]} */
  const errors = [];
  const typeOf = (/** @type {any} */ v) => (v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v);
  if (schema.type) {
    const types = [].concat(schema.type);
    const actual = typeOf(value);
    if (!types.includes(actual) && !(actual === "integer" && types.includes("number"))) {
      return [`${path}: expected ${types.join(" or ")}, got ${actual}`];
    }
  }
  if ("const" in schema && value !== schema.const) errors.push(`${path}: expected ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: ${JSON.stringify(value)} is not an allowed value`);
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: ${value} < ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: ${value} > ${schema.maximum}`);
  }
  if (typeOf(value) === "object") {
    for (const key of schema.required ?? []) if (!(key in value)) errors.push(`${path}: missing key ${key}`);
    for (const [key, v] of Object.entries(value)) {
      if (schema.properties?.[key]) errors.push(...schemaErrors(schema.properties[key], v, `${path}.${key}`, root));
      else if (schema.additionalProperties === false) errors.push(`${path}: key ${key} is not in the schema`);
    }
  }
  if (Array.isArray(value) && schema.items) value.forEach((v, i) => errors.push(...schemaErrors(schema.items, v, `${path}[${i}]`, root)));
  return errors;
}
