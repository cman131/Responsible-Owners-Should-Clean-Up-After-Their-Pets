import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { FocusedScene } from './scenes/FocusedScene.js';
import { TargetingScene } from './scenes/TargetingScene.js';
import type { BattleState } from '@poke-fighter/shared';

interface Props {
  state: BattleState | null;
  mySlotId: string;
  targetingMoveIndex: number | null;
  legalTargets: string[];
  onTargetSelected: (targetSlotId: string) => void;
  onCancelTargeting: () => void;
}

export function BattleCanvas({ state, mySlotId, targetingMoveIndex, legalTargets, onTargetSelected, onCancelTargeting }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const focusedSceneRef = useRef<FocusedScene | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width: 800,
      height: 400,
      backgroundColor: '#1a1a2e',
      parent: containerRef.current,
      scene: [FocusedScene, TargetingScene],
    });

    gameRef.current = game;

    game.events.once(Phaser.Core.Events.READY, () => {
      const scene = game.scene.getScene('FocusedScene') as FocusedScene;
      focusedSceneRef.current = scene;
      scene.scene.start('FocusedScene', { mySlotId });
    });

    return () => {
      game.destroy(true);
      gameRef.current = null;
      focusedSceneRef.current = null;
    };
  }, [mySlotId]);

  useEffect(() => {
    if (state && focusedSceneRef.current) {
      focusedSceneRef.current.updateState(state);
    }
  }, [state]);

  useEffect(() => {
    const game = gameRef.current;
    if (!game || !state || targetingMoveIndex === null) return;

    game.scene.stop('FocusedScene');
    game.scene.start('TargetingScene', {
      state,
      mySlotId,
      moveIndex: targetingMoveIndex,
      legalTargets,
      onTargetSelected: (id: string) => {
        game.scene.stop('TargetingScene');
        game.scene.start('FocusedScene', { mySlotId });
        onTargetSelected(id);
      },
      onCancel: () => {
        game.scene.stop('TargetingScene');
        game.scene.start('FocusedScene', { mySlotId });
        onCancelTargeting();
      },
    });
  }, [targetingMoveIndex]);

  return <div ref={containerRef} style={{ width: 800, height: 400 }} />;
}
