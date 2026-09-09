# @baldim/plugin-tournament

Tournament management for Baldim, including registration, seeding, brackets,
match reporting, standings, ladders, circuits, and promotion/relegation leagues.

```ts
import { Baldim } from '@baldim/core';
import { TournamentPlugin } from '@baldim/plugin-tournament';

const database = new Baldim({ connectionString: 'memory://competitions' });
await database.connect();

const tournaments = new TournamentPlugin({ logLevel: 'silent' });
await database.usePlugin(tournaments);

const tournament = await tournaments.create({
  name: 'Baldim Cup',
  organizerId: 'organizer-1',
  format: 'single-elimination',
  participantType: 'team',
});
```

Format classes, bracket generators, seeding functions, and standings calculators
are available from `@baldim/plugin-tournament/toolkit`.
