import { useTheme } from '../ThemeContext';

export default function Settings() {
    const { theme, toggleTheme } = useTheme();

    const settingSections = [
        {
            title: 'Device Configuration',
            icon: '⚙️',
            items: [
                { label: 'ESP32 Module', value: 'Connected', status: 'ok' },
                { label: 'MPU6050 Sensor', value: 'Active — 100Hz', status: 'ok' },
                { label: 'LM35 Temperature', value: 'Active — 10Hz', status: 'ok' },
                { label: 'MAX30102 SpO₂', value: 'Active — 50Hz', status: 'ok' },
                { label: 'BLE Signal', value: '-42 dBm (Excellent)', status: 'ok' },
            ],
        },
        {
            title: 'Alert Thresholds',
            icon: '🔔',
            items: [
                { label: 'Heart Rate — High', value: '> 100 BPM', status: 'warn' },
                { label: 'Heart Rate — Low', value: '< 55 BPM', status: 'warn' },
                { label: 'SpO₂ — Low', value: '< 95%', status: 'crit' },
                { label: 'Temperature — High', value: '> 37.5°C', status: 'warn' },
                { label: 'Angle Deviation', value: '> 5° from target', status: 'warn' },
            ],
        },
        {
            title: 'Session Settings',
            icon: '⏱️',
            items: [
                { label: 'Default Session Length', value: '45 minutes', status: 'ok' },
                { label: 'Target Repetitions', value: '30 per exercise', status: 'ok' },
                { label: 'Rest Interval', value: '60 seconds', status: 'ok' },
                { label: 'Auto-Save Interval', value: 'Every 30 seconds', status: 'ok' },
            ],
        },
    ];

    return (
        <>
            <div className="page-header">
                <div className="page-title">Settings</div>
                <div className="page-subtitle">System configuration and preferences</div>
            </div>

            {/* Theme Toggle Card */}
            <div className="section">
                <div className="card">
                    <div className="card-header">
                        <div className="card-title">
                            <div className="card-title-icon" style={{ background: 'rgba(251,191,36,.12)' }}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
                            </div>
                            Appearance
                        </div>
                    </div>
                    <div className="settings-appearance-row" style={{ padding: '12px 0' }}>
                        <div>
                            <div style={{ fontSize: '14px', fontWeight: 600 }}>Theme Mode</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Switch between dark and light interface</div>
                        </div>
                        <button onClick={toggleTheme} style={{
                            display: 'flex', alignItems: 'center', gap: '10px',
                            padding: '10px 20px', borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border)', background: 'var(--surface-2)',
                            color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600,
                            cursor: 'pointer', fontFamily: 'var(--font)',
                            transition: 'all .2s',
                        }}>
                            {theme === 'dark' ? '☀️ Switch to Light' : '🌙 Switch to Dark'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Setting Sections */}
            {settingSections.map((section, si) => (
                <div key={si} className="section">
                    <div className="card">
                        <div className="card-header">
                            <div className="card-title">
                                <span style={{ fontSize: '18px' }}>{section.icon}</span>
                                {section.title}
                            </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {section.items.map((item, ii) => (
                                <div key={ii} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 8px', borderRadius: '8px', transition: 'background .15s' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: item.status === 'ok' ? 'var(--green)' : item.status === 'warn' ? 'var(--orange)' : 'var(--red)', boxShadow: `0 0 6px ${item.status === 'ok' ? 'rgba(52,211,153,.4)' : item.status === 'warn' ? 'rgba(251,191,36,.4)' : 'rgba(248,113,113,.4)'}` }}></div>
                                        <span style={{ fontSize: '13.5px', fontWeight: 500 }}>{item.label}</span>
                                    </div>
                                    <span style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'var(--mono)', color: item.status === 'ok' ? 'var(--green)' : item.status === 'warn' ? 'var(--orange)' : 'var(--red)' }}>{item.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ))}

            {/* System Info */}
            <div className="section">
                <div className="card">
                    <div className="card-header">
                        <div className="card-title">
                            <span style={{ fontSize: '18px' }}>ℹ️</span>
                            System Information
                        </div>
                    </div>
                    <div className="system-info-grid">
                        {[
                            { label: 'Firmware Version', value: 'v2.4.1' },
                            { label: 'App Version', value: 'v1.0.0' },
                            { label: 'Last Calibration', value: 'Mar 10, 2026' },
                            { label: 'Data Storage', value: '2.4 GB / 8 GB' },
                            { label: 'Uptime', value: '14d 6h 42m' },
                            { label: 'Cloud Sync', value: 'Active' },
                        ].map((info, i) => (
                            <div key={i} style={{ padding: '12px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)', border: '1px solid var(--border-light)' }}>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>{info.label}</div>
                                <div style={{ fontSize: '15px', fontWeight: 700, marginTop: '4px', fontFamily: 'var(--mono)' }}>{info.value}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </>
    );
}
