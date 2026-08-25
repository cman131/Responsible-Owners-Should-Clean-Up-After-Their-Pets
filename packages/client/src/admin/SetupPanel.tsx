import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getSocket } from '../socket.js';
import { TeamStructureStep } from './steps/TeamStructureStep.js';
import { SlotAssignmentStep } from './steps/SlotAssignmentStep.js';
import { TeamBuilderStep } from './steps/TeamBuilderStep.js';
import { BattleSettingsStep } from './steps/BattleSettingsStep.js';
import { BattleWaitingScreen } from './BattleWaitingScreen.js';

type Step = 'structure' | 'assignment' | 'teams' | 'settings' | 'started';

interface SlotConfig {
  slotId: string;
  displayName: string;
  type: 'player' | 'npc';
}

interface SetupPanelProps {
  onBack: () => void;
  onWatch: (battleId: string) => void;
}

export function SetupPanel({ onBack, onWatch }: SetupPanelProps) {
  const [step, setStep] = useState<Step>('structure');
  const [structure, setStructure] = useState({ teamASlots: 1, teamBSlots: 1 });
  const [slotAssignment, setSlotAssignment] = useState<{ teamA: any[]; teamB: any[] } | null>(null);
  const [slotTeams, setSlotTeams] = useState<any[]>([]);
  const [battleId, setBattleId] = useState<string | null>(null);

  function handleStructureNext(config: { teamASlots: number; teamBSlots: number }) {
    setStructure(config);
    setStep('assignment');
  }

  function handleAssignmentNext(slots: { teamA: any[]; teamB: any[] }) {
    setSlotAssignment(slots);
    setStep('teams');
  }

  function handleTeamsNext(st: any[]) {
    setSlotTeams(st);
    setStep('settings');
  }

  function handleStart({ label }: { label: string }) {
    const socket = getSocket();
    const id = uuidv4();
    setBattleId(id);

    function buildSlotsWithTeams(slots: any[]) {
      return slots.map((slot: any) => {
        const teamData = slotTeams.find((st) => st.slotId === slot.slotId);
        return {
          slotId: slot.slotId,
          displayName: slot.displayName,
          isNpc: slot.type === 'npc',
          party: teamData?.team ?? [],
        };
      });
    }

    socket.emit('admin:action', {
      type: 'start-battle',
      data: {
        battleId: id,
        label,
        teams: [
          { slots: buildSlotsWithTeams(slotAssignment!.teamA) },
          { slots: buildSlotsWithTeams(slotAssignment!.teamB) },
        ],
      },
    } as any);
    setStep('started');
  }

  if (step === 'started' && battleId && slotAssignment) {
    return (
      <BattleWaitingScreen
        battleId={battleId}
        slotAssignment={slotAssignment as { teamA: SlotConfig[]; teamB: SlotConfig[] }}
        onBack={onBack}
        onWatch={onWatch}
      />
    );
  }

  const stepTitles = {
    structure: '1 / 4 — Structure',
    assignment: '2 / 4 — Assign Slots',
    teams: '3 / 4 — Build Teams',
    settings: '4 / 4 — Settings',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0d0d1a', padding: 32 }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <button onClick={onBack} style={{ background: 'none', border: '1px solid #555', color: '#aaa', padding: '4px 12px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}>← HUB</button>
          <h1 style={{ color: '#e74c3c', letterSpacing: 4 }}>BATTLE SETUP</h1>
          <span style={{ color: '#aaa', fontSize: 12 }}>{stepTitles[step as keyof typeof stepTitles]}</span>
        </div>
        <div style={{ background: '#111', border: '1px solid #333', borderRadius: 8 }}>
          {step === 'structure' && <TeamStructureStep onNext={handleStructureNext} />}
          {step === 'assignment' && (
            <SlotAssignmentStep
              teamASlots={structure.teamASlots}
              teamBSlots={structure.teamBSlots}
              onNext={handleAssignmentNext}
              onBack={() => setStep('structure')}
            />
          )}
          {step === 'teams' && slotAssignment && (
            <TeamBuilderStep
              slots={slotAssignment}
              onNext={handleTeamsNext}
              onBack={() => setStep('assignment')}
            />
          )}
          {step === 'settings' && (
            <BattleSettingsStep
              onStart={handleStart}
              onBack={() => setStep('teams')}
            />
          )}
        </div>
      </div>
    </div>
  );
}
