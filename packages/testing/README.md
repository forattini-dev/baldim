# @baldim/testing

Factories and seeders for Baldim applications and plugin test suites.

```ts
import { Factory, Seeder } from '@baldim/testing';

Factory.define('users', ({ seq }) => ({ id: `user-${seq}`, name: `User ${seq}` }));
const seeder = new Seeder(database);
await seeder.seed({ users: 10 });
```

Factories support sequences, asynchronous fields, traits, overrides, and before/after-create callbacks. `Factory.reset()` clears all process-wide factory state between test suites.
