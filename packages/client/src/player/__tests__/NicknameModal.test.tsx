import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NicknameModal } from '../NicknameModal.js';

describe('NicknameModal', () => {
  it('pre-fills input with current nickname', () => {
    render(<NicknameModal currentNickname="Pikachu" onSave={vi.fn()} onCancel={vi.fn()} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('Pikachu');
  });

  it('calls onSave with new nickname value when SAVE clicked', () => {
    const onSave = vi.fn();
    render(<NicknameModal currentNickname="Pikachu" onSave={onSave} onCancel={vi.fn()} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Sparky' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onSave).toHaveBeenCalledWith('Sparky');
  });

  it('calls onCancel when CANCEL clicked', () => {
    const onCancel = vi.fn();
    render(<NicknameModal currentNickname="Pikachu" onSave={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('does not call onSave when input is empty', () => {
    const onSave = vi.fn();
    render(<NicknameModal currentNickname="Pikachu" onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onSave).not.toHaveBeenCalled();
  });
});
