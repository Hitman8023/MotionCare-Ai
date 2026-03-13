import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SessionUser, UserRole } from '../types/auth';
import { signInUser, registerUser } from '../services/authService';

type LoginProps = {
    onLogin: (user: SessionUser) => void;
};

const DEMO_EMAIL: Record<UserRole, string> = {
    doctor: 'doctor@motioncare.ai',
    patient: 'patient@motioncare.ai',
};
const DEMO_PASS: Record<UserRole, string> = {
    doctor: 'doctor123',
    patient: 'patient123',
};

export default function Login({ onLogin }: LoginProps) {
    const [mode, setMode] = useState<'signin' | 'signup'>('signin');

    // — sign-in state —
    const [loginRole, setLoginRole] = useState<UserRole>('doctor');
    const [loginEmail, setLoginEmail] = useState(DEMO_EMAIL.doctor);
    const [loginPassword, setLoginPassword] = useState(DEMO_PASS.doctor);
    const [loginError, setLoginError] = useState('');
    const [loginLoading, setLoginLoading] = useState(false);

    // — sign-up state —
    const [signupRole, setSignupRole] = useState<UserRole>('patient');
    const [signupName, setSignupName] = useState('');
    const [signupEmail, setSignupEmail] = useState('');
    const [signupPassword, setSignupPassword] = useState('');
    const [signupConfirm, setSignupConfirm] = useState('');
    const [signupError, setSignupError] = useState('');
    const [signupSuccess, setSignupSuccess] = useState('');
    const [signupLoading, setSignupLoading] = useState(false);

    const navigate = useNavigate();

    const switchLoginRole = (nextRole: UserRole) => {
        setLoginRole(nextRole);
        setLoginEmail(DEMO_EMAIL[nextRole]);
        setLoginPassword(DEMO_PASS[nextRole]);
        setLoginError('');
    };

    const switchMode = (next: 'signin' | 'signup') => {
        setMode(next);
        setLoginError('');
        setSignupError('');
        setSignupSuccess('');
    };

    const handleSignIn = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setLoginError('');
        setLoginLoading(true);
        try {
            const user = await signInUser(loginEmail, loginPassword, loginRole);
            onLogin(user);
            navigate('/', { replace: true });
        } catch (err: unknown) {
            setLoginError((err as Error).message ?? 'Sign-in failed. Please try again.');
        } finally {
            setLoginLoading(false);
        }
    };

    const handleSignUp = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSignupError('');
        setSignupSuccess('');

        const trimmedName = signupName.trim();

        if (trimmedName.length < 2) {
            setSignupError('Please enter your full name (at least 2 characters).');
            return;
        }
        if (signupPassword.length < 6) {
            setSignupError('Password must be at least 6 characters.');
            return;
        }
        if (signupPassword !== signupConfirm) {
            setSignupError('Passwords do not match.');
            return;
        }

        setSignupLoading(true);
        try {
            const user = await registerUser(trimmedName, signupEmail, signupPassword, signupRole);
            setSignupSuccess('Account created! Signing you in…');
            setTimeout(() => {
                onLogin(user);
                navigate('/', { replace: true });
            }, 800);
        } catch (err: unknown) {
            setSignupError((err as Error).message ?? 'Registration failed. Please try again.');
        } finally {
            setSignupLoading(false);
        }
    };

    return (
        <div className="auth-shell">
            <div className="auth-panel card">
                {/* Brand */}
                <div className="auth-brand">
                    <div className="auth-logo-icon">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                        </svg>
                    </div>
                    <div>
                        <div className="auth-title">
                            {mode === 'signin' ? 'Welcome back' : 'Create account'}
                        </div>
                        <div className="auth-subtitle">
                            {mode === 'signin' ? 'Sign in to MotionCare AI' : 'Join MotionCare AI today'}
                        </div>
                    </div>
                </div>

                {/* Mode switcher */}
                <div className="auth-mode-switcher">
                    <button
                        type="button"
                        className={`auth-mode-btn${mode === 'signin' ? ' active' : ''}`}
                        onClick={() => switchMode('signin')}
                    >
                        Sign In
                    </button>
                    <button
                        type="button"
                        className={`auth-mode-btn${mode === 'signup' ? ' active' : ''}`}
                        onClick={() => switchMode('signup')}
                    >
                        Create Account
                    </button>
                </div>

                {/* ── SIGN IN ── */}
                {mode === 'signin' && (
                    <>
                        <div className="role-toggle" role="tablist" aria-label="Select login role">
                            <button
                                type="button"
                                className={`role-toggle-btn${loginRole === 'doctor' ? ' active' : ''}`}
                                onClick={() => switchLoginRole('doctor')}
                            >
                                🩺 Doctor
                            </button>
                            <button
                                type="button"
                                className={`role-toggle-btn${loginRole === 'patient' ? ' active' : ''}`}
                                onClick={() => switchLoginRole('patient')}
                            >
                                🧑‍⚕️ Patient
                            </button>
                        </div>

                        <form className="auth-form" onSubmit={handleSignIn}>
                            <label className="auth-label" htmlFor="login-email">Email</label>
                            <input
                                id="login-email"
                                className="auth-input"
                                type="email"
                                value={loginEmail}
                                onChange={(e) => setLoginEmail(e.target.value)}
                                autoComplete="username"
                                required
                            />

                            <label className="auth-label" htmlFor="login-password">Password</label>
                            <input
                                id="login-password"
                                className="auth-input"
                                type="password"
                                value={loginPassword}
                                onChange={(e) => setLoginPassword(e.target.value)}
                                autoComplete="current-password"
                                required
                            />

                            {loginError ? <div className="auth-error">{loginError}</div> : null}

                            <button type="submit" className="auth-submit-btn" disabled={loginLoading}>
                                {loginLoading ? 'Signing in…' : `Sign In as ${loginRole === 'doctor' ? 'Doctor' : 'Patient'}`}
                            </button>
                        </form>

                        <div className="auth-demo-note">
                            Demo: <code>doctor@motioncare.ai / doctor123</code> &nbsp;·&nbsp; <code>patient@motioncare.ai / patient123</code>
                        </div>

                        <div className="auth-switch-prompt">
                            Don't have an account?{' '}
                            <button type="button" className="auth-switch-link" onClick={() => switchMode('signup')}>
                                Create one
                            </button>
                        </div>
                    </>
                )}

                {/* ── SIGN UP ── */}
                {mode === 'signup' && (
                    <>
                        <div className="role-toggle" role="tablist" aria-label="Select account role">
                            <button
                                type="button"
                                className={`role-toggle-btn${signupRole === 'doctor' ? ' active' : ''}`}
                                onClick={() => setSignupRole('doctor')}
                            >
                                🩺 I'm a Doctor
                            </button>
                            <button
                                type="button"
                                className={`role-toggle-btn${signupRole === 'patient' ? ' active' : ''}`}
                                onClick={() => setSignupRole('patient')}
                            >
                                🧑‍⚕️ I'm a Patient
                            </button>
                        </div>

                        <form className="auth-form" onSubmit={handleSignUp}>
                            <label className="auth-label" htmlFor="signup-name">
                                {signupRole === 'doctor' ? 'Full Name (without Dr.)' : 'Full Name'}
                            </label>
                            <input
                                id="signup-name"
                                className="auth-input"
                                type="text"
                                value={signupName}
                                onChange={(e) => setSignupName(e.target.value)}
                                autoComplete="name"
                                placeholder={signupRole === 'doctor' ? 'e.g. Rachel Moore' : 'e.g. James Davidson'}
                                required
                            />

                            <label className="auth-label" htmlFor="signup-email">Email</label>
                            <input
                                id="signup-email"
                                className="auth-input"
                                type="email"
                                value={signupEmail}
                                onChange={(e) => setSignupEmail(e.target.value)}
                                autoComplete="email"
                                placeholder="you@example.com"
                                required
                            />

                            <label className="auth-label" htmlFor="signup-password">Password</label>
                            <input
                                id="signup-password"
                                className="auth-input"
                                type="password"
                                value={signupPassword}
                                onChange={(e) => setSignupPassword(e.target.value)}
                                autoComplete="new-password"
                                placeholder="Min. 6 characters"
                                required
                            />

                            <label className="auth-label" htmlFor="signup-confirm">Confirm Password</label>
                            <input
                                id="signup-confirm"
                                className="auth-input"
                                type="password"
                                value={signupConfirm}
                                onChange={(e) => setSignupConfirm(e.target.value)}
                                autoComplete="new-password"
                                placeholder="Repeat your password"
                                required
                            />

                            {signupError ? <div className="auth-error">{signupError}</div> : null}
                            {signupSuccess ? <div className="auth-success">{signupSuccess}</div> : null}

                            <button type="submit" className="auth-submit-btn" disabled={signupLoading}>
                                {signupLoading ? 'Creating account…' : `Create ${signupRole === 'doctor' ? 'Doctor' : 'Patient'} Account`}
                            </button>
                        </form>

                        <div className="auth-switch-prompt">
                            Already have an account?{' '}
                            <button type="button" className="auth-switch-link" onClick={() => switchMode('signin')}>
                                Sign in
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
