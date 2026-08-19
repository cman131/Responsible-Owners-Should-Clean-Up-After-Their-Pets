import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { PlayerProfile, NpcProfile, TeamTemplate } from '@poke-fighter/shared';

export class RegistryStore {
  private readonly dir: string;
  private players: Map<string, PlayerProfile>;
  private npcs: Map<string, NpcProfile>;
  private teams: Map<string, TeamTemplate>;

  constructor(dir: string) {
    this.dir = dir;
    mkdirSync(dir, { recursive: true });
    this.players = this.loadPlayers();
    this.npcs = this.loadNpcs();
    this.teams = this.loadTeams();
  }

  private loadPlayers(): Map<string, PlayerProfile> {
    const path = join(this.dir, 'players.json');
    if (!existsSync(path)) return new Map();
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as PlayerProfile[];
    return new Map(raw.map((p) => [p.profileId, p]));
  }

  private loadNpcs(): Map<string, NpcProfile> {
    const path = join(this.dir, 'npcs.json');
    if (!existsSync(path)) return new Map();
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as NpcProfile[];
    return new Map(raw.map((n) => [n.profileId, n]));
  }

  private loadTeams(): Map<string, TeamTemplate> {
    const path = join(this.dir, 'teams.json');
    if (!existsSync(path)) return new Map();
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as TeamTemplate[];
    return new Map(raw.map((t) => [t.templateId, t]));
  }

  private persist<T>(filename: string, map: Map<string, T>): void {
    writeFileSync(join(this.dir, filename), JSON.stringify(Array.from(map.values()), null, 2));
  }

  savePlayer(profile: PlayerProfile): void { this.players.set(profile.profileId, profile); this.persist('players.json', this.players); }
  getPlayer(id: string): PlayerProfile | undefined { return this.players.get(id); }
  getPlayerByName(name: string): PlayerProfile | undefined { return Array.from(this.players.values()).find((p) => p.displayName.toLowerCase() === name.toLowerCase()); }
  listPlayers(): PlayerProfile[] { return Array.from(this.players.values()); }
  deletePlayer(id: string): void { this.players.delete(id); this.persist('players.json', this.players); }

  saveNpc(profile: NpcProfile): void { this.npcs.set(profile.profileId, profile); this.persist('npcs.json', this.npcs); }
  getNpc(id: string): NpcProfile | undefined { return this.npcs.get(id); }
  listNpcs(): NpcProfile[] { return Array.from(this.npcs.values()); }
  deleteNpc(id: string): void { this.npcs.delete(id); this.persist('npcs.json', this.npcs); }

  saveTeam(template: TeamTemplate): void { this.teams.set(template.templateId, template); this.persist('teams.json', this.teams); }
  getTeam(id: string): TeamTemplate | undefined { return this.teams.get(id); }
  listTeams(): TeamTemplate[] { return Array.from(this.teams.values()); }
  deleteTeam(id: string): void { this.teams.delete(id); this.persist('teams.json', this.teams); }
}
