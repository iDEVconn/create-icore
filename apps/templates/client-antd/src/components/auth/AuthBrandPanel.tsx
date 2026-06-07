import { Space, Typography } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';

const FEATURES = [
  'Strategy-pattern auth & storage',
  'Multi-provider: password, magic link, OAuth',
  'CASL role-based access control',
];

export function AuthBrandPanel() {
  return (
    <div
      style={{
        flex: 1,
        background: 'linear-gradient(135deg, #0d1117 0%, #0f1e0f 100%)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '48px 56px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '20%',
          left: '10%',
          width: 320,
          height: 320,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(34,197,94,0.15) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />
      <Space direction="vertical" size={32} style={{ position: 'relative', zIndex: 1 }}>
        <Space direction="vertical" size={4}>
          <Typography.Title level={2} style={{ color: '#22c55e', margin: 0, fontSize: 28 }}>
            iCore
          </Typography.Title>
          <Typography.Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
            Enterprise scaffold for NestJS + React
          </Typography.Text>
        </Space>

        <Space direction="vertical" size={8}>
          {FEATURES.map((f) => (
            <Space key={f} size={8} align="center">
              <CheckCircleOutlined style={{ color: '#22c55e', fontSize: 14 }} />
              <Typography.Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14 }}>
                {f}
              </Typography.Text>
            </Space>
          ))}
        </Space>
      </Space>
    </div>
  );
}
