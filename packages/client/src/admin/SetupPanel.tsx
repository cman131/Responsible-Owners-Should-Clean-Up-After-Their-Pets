import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getSocket } from '../socket.js';
import { TeamStructureStep } from './steps/TeamStructureStep.js';
import { SlotAssignmentStep } from './steps/SlotAssignmentStep.js';
import { TeamBuilderStep } from './steps/TeamBuilderStep.js';
import { BattleSettingsStep } from './steps/BattleSettingsStep.js';

type Step = 'structure' | 'assignment' | 'teams' | 'settings' | 'started';

export function SetupPanel() {
  const [step, setStep] = useState<Step>('structure');
  const [structure, setStructure] = useState({ teamASlots: 1, teamBSlots: 1 });
  const [slotAssignment, setSlotAssignment] = useState<{ teamA: any[]; teamB: any[] } | null>(null);
  const [slotTeams, setSlotTeams] = useState<any[]>([]);

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

  function handleStart({ label, timerSeconds }: { label: string; timerSeconds: number }) {
    const socket = getSocket();
    const battleId = uuidv4();

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
        battleId,
        label,
        turnTimerSeconds: timerSeconds,
        teams: [
          { slots: buildSlotsWithTeams(slotAssignment!.teamA) },
          { slots: buildSlotsWithTeams(slotAssignment!.teamB) },
        ],
      },
    } as any);
    setStep('started');
  }

  if (step === 'started') {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <h2 style={{ color: '#27ae60', fontSize: 24 }}>Battle Started!</h2>
        <p style={{ color: '#aaa', marginTop: 12 }}>Waiting for players to join the battle room...</p>
      </div>
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
