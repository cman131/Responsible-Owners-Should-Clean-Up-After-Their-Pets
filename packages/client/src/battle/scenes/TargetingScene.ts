import Phaser from 'phaser';
import type { BattleState } from '@poke-fighter/shared';

export interface TargetingSceneData {
  state: BattleState;
  mySlotId: string;
  moveIndex: number;
  legalTargets: string[];
  onTargetSelected: (targetSlotId: string) => void;
  onCancel: () => void;
}

export class TargetingScene extends Phaser.Scene {
  private sceneData!: TargetingSceneData;

  constructor() {
    super({ key: 'TargetingScene' });
  }

  init(data: TargetingSceneData) {
    this.sceneData = data;
  }

  create() {
    const { state, mySlotId, legalTargets, onTargetSelected, onCancel } = this.sceneData;

    this.add.rectangle(400, 240, 800, 480, 0x0d0d1a).setOrigin(0.5);

    const myTeamIdx = state.teams.findIndex((t) => t.slots.some((s) => s.slotId === mySlotId));
    const foeTeamIdx = myTeamIdx === 0 ? 1 : 0;

    const foeSlots = state.teams[foeTeamIdx]?.slots ?? [];
    foeSlots.forEach((slot, i) => {
      const mon = slot.party[slot.activePokemonIndex];
      if (!mon || mon.fainted) return;

      const x = 150 + i * 180;
      const y = 130;
      const isLegal = legalTargets.includes(slot.slotId);

      const card = this.add.rectangle(x, y, 140, 100, isLegal ? 0x3a0a0a : 0x222222)
        .setStrokeStyle(2, isLegal ? 0xe74c3c : 0x444444)
        .setInteractive({ useHandCursor: isLegal });

      this.add.text(x, y - 20, slot.displayName, { fontSize: '12px', color: '#ffffff' }).setOrigin(0.5);
      this.add.text(x, y + 10, `HP ${mon.currentHp}/${mon.maxHp}`, { fontSize: '10px', color: '#2ecc71' }).setOrigin(0.5);

      if (isLegal) {
        card.on('pointerup', () => onTargetSelected(slot.slotId));
        card.on('pointerover', () => card.setFillStyle(0x5a1a1a));
        card.on('pointerout', () => card.setFillStyle(0x3a0a0a));
      }
    });

    const allySlots = state.teams[myTeamIdx]?.slots ?? [];
    allySlots.forEach((slot, i) => {
      const mon = slot.party[slot.activePokemonIndex];
      if (!mon || mon.fainted) return;

      const x = 150 + i * 180;
      const y = 320;
      const isMe = slot.slotId === mySlotId;

      this.add.rectangle(x, y, 140, 100, 0x0a1a2a).setStrokeStyle(2, isMe ? 0x27ae60 : 0x2980b9);
      this.add.text(x, y - 20, slot.displayName, { fontSize: '12px', color: '#ffffff' }).setOrigin(0.5);
      this.add.text(x, y + 10, `HP ${mon.currentHp}/${mon.maxHp}`, { fontSize: '10px', color: '#2ecc71' }).setOrigin(0.5);
      this.add.text(x, y + 25, isMe ? 'YOU' : 'ALLY', { fontSize: '9px', color: '#555555' }).setOrigin(0.5);
    });

    const cancelText = this.add.text(700, 440, '[ESC] Cancel', { fontSize: '12px', color: '#e74c3c' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    cancelText.on('pointerup', onCancel);
    this.input.keyboard?.on('keydown-ESC', onCancel);
  }
}
