import { QRCodeSVG } from 'qrcode.react';

interface Props {
  url: string;
  onClose: () => void;
}

export function QrCodeModal({ url, onClose }: Props) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: '#0d0d1a',
          border: '1px solid #3498db',
          borderRadius: 8,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
          maxWidth: 320,
        }}
      >
        <div style={{ color: '#aaa', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' }}>
          Join Link
        </div>
        <QRCodeSVG value={url} size={200} bgColor="#fff" fgColor="#000" />
        <div
          style={{
            color: '#3498db',
            fontSize: 11,
            wordBreak: 'break-all',
            textAlign: 'center',
            userSelect: 'text',
          }}
        >
          {url}
        </div>
        <button
          aria-label="Close"
          onClick={onClose}
          style={{
            background: '#333',
            color: '#fff',
            border: 'none',
            padding: '5px 20px',
            borderRadius: 3,
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 11,
            letterSpacing: 1,
          }}
        >
          CLOSE
        </button>
      </div>
    </div>
  );
}
