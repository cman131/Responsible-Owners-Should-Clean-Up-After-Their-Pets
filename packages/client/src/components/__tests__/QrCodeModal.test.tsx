import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => <svg data-testid="qr-code" data-value={value} />,
}));

import { QrCodeModal } from '../QrCodeModal.js';

describe('QrCodeModal', () => {
  it('renders a QR code for the given URL', () => {
    render(<QrCodeModal url="http://localhost/?battleId=abc" onClose={vi.fn()} />);
    expect(screen.getByTestId('qr-code')).toBeTruthy();
  });

  it('passes the URL as the QR code value', () => {
    render(<QrCodeModal url="http://localhost/?battleId=abc" onClose={vi.fn()} />);
    expect(screen.getByTestId('qr-code').getAttribute('data-value')).toBe('http://localhost/?battleId=abc');
  });

  it('shows the URL as readable text', () => {
    render(<QrCodeModal url="http://localhost/?battleId=abc" onClose={vi.fn()} />);
    expect(screen.getByText('http://localhost/?battleId=abc')).toBeTruthy();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<QrCodeModal url="http://localhost/?battleId=abc" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renders an overlay backdrop', () => {
    const { container } = render(<QrCodeModal url="http://localhost/?battleId=abc" onClose={vi.fn()} />);
    const overlay = container.firstChild as HTMLElement;
    expect(overlay.style.position).toBe('fixed');
  });
});
