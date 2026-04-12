'use client'
import { useRouter } from 'next/navigation'

interface TopBarProps {
  title: string
  backTo?: string
  right?: React.ReactNode
}

export default function TopBar({ title, backTo, right }: TopBarProps) {
  const router = useRouter()

  return (
    <div style={{
      background: '#111827',
      borderBottom: '1px solid #2a3050',
      padding: '14px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      maxWidth: '600px',
      margin: '0 auto',
      position: 'sticky',
      top: 0,
      zIndex: 50,
    }}>
      {backTo && (
        <button
          onClick={() => router.push(backTo)}
          style={{ background: 'none', border: 'none', color: '#00e5c8', fontSize: '18px', cursor: 'pointer', fontWeight: 600, padding: '0 4px' }}
        >
          ←
        </button>
      )}
      <span style={{ color: '#e8ecf4', fontSize: '16px', fontWeight: 700, flex: 1, letterSpacing: '-0.3px' }}>{title}</span>
      {right}
    </div>
  )
}
