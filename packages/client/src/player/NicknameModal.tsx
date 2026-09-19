import { useState } from 'react';

interface Props {
  currentNickname: string;
  onSave: (nickname: string) => void;
  onCancel: () => void;
}

export function NicknameModal({ currentNickname, onSave, onCancel }: Props) {
  const [value, setValue] = useState(currentNickname);

  function handleSave() {
    if (!value.trim()) return;
    onSave(value.trim());
  }

  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={title}>RENAME</div>
        <input
          style={input}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
          autoFocus
        />
        <div style={buttons}>
          <button onClick={onCancel} style={cancelBtn}>CANCEL</button>
          <button onClick={handleSave} disabled={!value.trim()} style={saveBtn(!value.trim())}>SAVE</button>
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
};
const modal: React.CSSProperties = {
  background: '#0d0d1a', border: '2px solid #3498db', borderRadius: 8,
  padding: 20, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 260,
};
const title: React.CSSProperties = { color: '#3498db', fontSize: 11, letterSpacing: 2 };
const input: React.CSSProperties = {
  background: '#1a1a2e', border: '1px solid #3498db', color: '#fff',
  padding: '6px 10px', borderRadius: 4, fontFamily: 'inherit', fontSize: 14,
};
const buttons: React.CSSProperties = { display: 'flex', gap: 8, justifyContent: 'flex-end' };
const cancelBtn: React.CSSProperties = {
  background: '#333', border: 'none', color: '#fff', padding: '6px 14px',
  borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, letterSpacing: 1,
};
function saveBtn(disabled: boolean): React.CSSProperties {
  return {
    background: disabled ? '#555' : '#2980b9', border: 'none', color: '#fff',
    padding: '6px 14px', borderRadius: 3, cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit', fontSize: 11, letterSpacing: 1,
  };
}
