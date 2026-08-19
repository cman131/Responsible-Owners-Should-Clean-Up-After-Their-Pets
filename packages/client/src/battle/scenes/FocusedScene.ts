import Phaser from 'phaser';
import type { BattleState, SlotState } from '@poke-fighter/shared';

export interface FocusedSceneData {
  mySlotId: string;
}

export class FocusedScene extends Phaser.Scene {
  private mySlotId = '';
  private state: BattleState | null = null;
  private sprites: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super({ key: 'FocusedScene' });
  }

  init(data: FocusedSceneData) {
    this.mySlotId = data.mySlotId;
  }

  create() {
    // GBA-style background: bottom half green, top half sky blue
    this.add.rectangle(400, 300, 800, 280, 0x5a8a3a).setOrigin(0.5);
    this.add.rectangle(400, 100, 800, 200, 0x87ceeb).setOrigin(0.5);
  }

  updateState(state: BattleState) {
    this.state = state;
    this.renderPokemon(state);
  }

  private renderPokemon(state: BattleState) {
    this.sprites.forEach((s) => s.destroy());
    this.sprites = [];

    const myTeamIdx = state.teams.findIndex((t) => t.slots.some((s) => s.slotId === this.mySlotId));
    const foeTeamIdx = myTeamIdx === 0 ? 1 : 0;
    const myTeam = state.teams[myTeamIdx];
    const foeTeam = state.teams[foeTeamIdx];

    const mySlot = myTeam?.slots.find((s) => s.slotId === this.mySlotId);
    if (mySlot) this.renderMyPokemon(mySlot);

    myTeam?.slots.filter((s) => s.slotId !== this.mySlotId && !s.isSpectator).forEach((slot, i) => {
      this.renderAllyPokemon(slot, i);
    });

    const foeSlots = foeTeam?.slots.filter((s) => !s.isSpectator) ?? [];
    foeSlots.forEach((slot, i) => {
      if (i === 0) this.renderPrimaryFoe(slot);
      else this.renderSecondaryFoe(slot, i);
    });
  }

  private renderMyPokemon(slot: SlotState) {
    const mon = slot.party[slot.activePokemonIndex];
    if (!mon || mon.fainted) return;
    const rect = this.add.rectangle(120, 190, 80, 80, 0x2980b9);
    const label = this.add.text(120, 238, slot.displayName, { fontSize: '10px', color: '#ffffff' }).setOrigin(0.5);
    this.sprites.push(rect, label);
  }

  private renderAllyPokemon(slot: SlotState, index: number) {
    const mon = slot.party[slot.activePokemonIndex];
    if (!mon || mon.fainted) return;
    const x = 220 + index * 50;
    const rect = this.add.rectangle(x, 200, 40, 40, 0x2471a3, 0.6);
    this.sprites.push(rect);
  }

  private renderPrimaryFoe(slot: SlotState) {
    const mon = slot.party[slot.activePokemonIndex];
    if (!mon || mon.fainted) return;
    const rect = this.add.rectangle(660, 80, 70, 70, 0xe74c3c);
    this.sprites.push(rect);
  }

  private renderSecondaryFoe(slot: SlotState, index: number) {
    const mon = slot.party[slot.activePokemonIndex];
    if (!mon || mon.fainted) return;
    const x = 80 + (index - 1) * 50;
    const rect = this.add.rectangle(x, 60, 35, 35, 0xc0392b, 0.6);
    this.sprites.push(rect);
  }
}
