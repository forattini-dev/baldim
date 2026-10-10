import { Baldim, type InferSchema } from '../src/lite.js';
const database = new Baldim({ connectionString: 'memory://types' });
const users = await database.createResource({
  name: 'users',
  attributes: {
    name: 'string|required',
    age: 'number|optional',
    enabled: 'boolean|default:true',
    profile: { type: 'object', properties: { city: 'string|required' } },
  },
});
await users.insert({ name: 'Ada', profile: { city: 'London' } });
await users.update('a', { age: 3 });
await users.query({ 'profile.city': 'London', age: { $gte: 3 } });
const user = await users.get('a');
const name: string = user.name;
// @ts-expect-error wrong field type
await users.insert({ name: 42, profile: { city: 'London' } });
// @ts-expect-error missing required field
await users.insert({ profile: { city: 'London' } });
// @ts-expect-error unknown query field
await users.query({ unknown: 'value' });
// @ts-expect-error wrong predicate operand
await users.query({ age: { $gte: 'wrong' } });
// @ts-expect-error wrong update field type
await users.update('a', { age: 'wrong' });
// @ts-expect-error unknown selected field
await users.query({}, { select: ['unknown'] });
// @ts-expect-error wrong nested field type
await users.patch('a', { 'profile.city': 42 });
const projected = await users.query({}, { select: ['name'] });
// @ts-expect-error projection does not promise unselected fields
const alwaysPresent: string = projected[0]!.name;
void name;
void alwaysPresent;

const legacyResource: import('../src/resource.class.js').Resource = users;
void legacyResource;
