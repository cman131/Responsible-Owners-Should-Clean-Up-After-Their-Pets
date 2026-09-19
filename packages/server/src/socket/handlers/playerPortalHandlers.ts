import type { Socket } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents, PokemonSet } from '@poke-fighter/shared';
import type { AppDatabase } from '../../db/Database.js';
import { IMPLEMENTED_ITEM_IDS } from '../../engine/items.js';
import { filterItemsQuery } from './adminHandlers.js';

function coreFingerprint(p: PokemonSet): string {
  return JSON.stringify({
    speciesId: p.speciesId,
    level: p.level,
    nature: p.nature,
    ability: p.ability,
    moves: p.moves,
    evs: p.evs,
    ivs: p.ivs,
  });
}

export function registerPlayerPortalHandlers(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  db: AppDatabase
): void {
  socket.on('player:portal-auth', ({ playerKey }) => {
    const match = db.players.list().find((p) => p.playerKey === playerKey);
    if (!match) {
      socket.emit('player:portal-error', { message: 'Invalid player key.' });
      return;
    }
    socket.data['portalProfileId'] = match.profileId;
    socket.emit('player:portal-data', { profile: match });
  });

  socket.on('player:portal-save', ({ profileId, team, bank }) => {
    const portalId = socket.data['portalProfileId'] as string | undefined;
    if (!portalId) {
      socket.emit('player:portal-error', { message: 'Not authenticated. Use player:portal-auth first.' });
      return;
    }
    if (portalId !== profileId) {
      socket.emit('player:portal-error', { message: 'Profile ID does not match authenticated player.' });
      return;
    }

    const existing = db.players.list().find((p) => p.profileId === profileId);
    if (!existing) {
      socket.emit('player:portal-error', { message: 'Player profile not found.' });
      return;
    }

    const existingPool = [
      ...(existing.defaultTeam?.pokemon ?? []),
      ...(existing.bank ?? []),
    ];
    const existingFingerprints = existingPool.map(coreFingerprint);

    const incoming = [...team, ...bank];
    for (const p of incoming) {
      if (!existingFingerprints.includes(coreFingerprint(p))) {
        socket.emit('player:portal-error', { message: 'Invalid change: only held items, nicknames, and team/bank order may be changed.' });
        return;
      }
    }

    const updated = {
      ...existing,
      ...(existing.defaultTeam !== undefined || team.length > 0 ? {
        defaultTeam: existing.defaultTeam !== undefined ? {
          ...existing.defaultTeam,
          pokemon: team,
        } : {
          templateId: profileId + '-team',
          name: `${existing.displayName}'s Team`,
          createdAt: new Date().toISOString(),
          pokemon: team,
        },
      } : {}),
      bank,
    };
    db.players.save(updated);
    socket.emit('player:portal-data', { profile: updated });
  });

  socket.on('player:portal-items-query', async ({ speciesName }) => {
    try {
      const { DataLoader } = await import('../../data/loader.js');
      const data = new DataLoader();
      const allImplemented = data.getAllItems().filter((i) => {
        const normByName = i.name.toLowerCase().replace(/\s+/g, '-');
        return IMPLEMENTED_ITEM_IDS.has(normByName);
      });
      const results = filterItemsQuery(allImplemented, {
        equippableOnly: true,
        ...(speciesName !== undefined ? { speciesName } : {}),
      });
      socket.emit('player:portal-items', { results });
    } catch (err) {
      console.error('[player:portal-items-query] handler error:', err);
    }
  });
}
