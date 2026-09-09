# @baldin/plugin-tournament

Tournament management for Baldin, including registration, seeding, brackets,
match reporting, standings, ladders, circuits, and promotion/relegation leagues.

```ts
import { Baldin } from '@baldin/core';
import { TournamentPlugin } from '@baldin/plugin-tournament';

const database = new Baldin({ connectionString: 'memory://competitions' });
await database.connect();

const tournaments = new TournamentPlugin({ logLevel: 'silent' });
await database.usePlugin(tournaments);

const tournament = await tournaments.create({
  name: 'Baldin Cup',
  organizerId: 'organizer-1',
  format: 'single-elimination',
  participantType: 'team',
});
```

Format classes, bracket generators, seeding functions, and standings calculators
are available from `@baldin/plugin-tournament/toolkit`.
