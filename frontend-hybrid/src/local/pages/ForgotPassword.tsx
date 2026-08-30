import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { IconAlertTriangle, IconBulb, IconCheck, IconChevronDown, IconWorld } from '@tabler/icons-react';
import { authApi } from '../../services/api';
import '../styles/LoginPage.css';

export default function ForgotPassword() {
    const { t, i18n } = useTranslation();
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [showHintForm, setShowHintForm] = useState(false);
    const [usernameHint, setUsernameHint] = useState('');
    const [hintResult, setHintResult] = useState('');

    const isZh = i18n.language.startsWith('zh');

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', 'light');
    }, []);

    const toggleLang = () => {
        i18n.changeLanguage(isZh ? 'en' : 'zh');
    };

    const handleValidationMessage = (e: React.InvalidEvent<HTMLInputElement>) => {
        const target = e.currentTarget;
        if (target.validity.valueMissing) {
            target.setCustomValidity(t('auth.fieldRequired'));
        } else if (target.validity.typeMismatch && target.type === 'email') {
            target.setCustomValidity(t('auth.emailInvalid'));
        } else {
            target.setCustomValidity('');
        }
    };

    const clearValidationMessage = (e: React.FormEvent<HTMLInputElement>) => {
        e.currentTarget.setCustomValidity('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setMessage('');
        setLoading(true);

        try {
            const res = await authApi.forgotPassword({ email: email.trim() });
            setMessage(res.message);
        } catch (err: any) {
            setError(err.message || t('auth.forgotPasswordRequestFailed', 'Failed to request password reset'));
        } finally {
            setLoading(false);
        }
    };

    const handleGetHint = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setMessage('');
        setHintResult('');
        setLoading(true);

        try {
            const res = await authApi.emailHint(usernameHint.trim());
            setHintResult(res.hint);
            setShowHintForm(false);
        } catch (err: any) {
            setError(err.message || t('auth.emailHintFailed', 'Failed to get email hint. User may not exist.'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="lp-container">
            <div className="lp-wrapper">
                {/* ── Left: Brand showcase ── */}
                <div className="lp-left">
                    <div className="lp-brand">
                        <img className="lp-logo" src="/logo-new.png" alt="" />
                        <span className="lp-brand-text">{t('app.brand')}</span>
                    </div>
                </div>

                {/* ── Right: Form Panel ── */}
                <div className="lp-right">
                    {/* Language toggle */}
                    <button type="button" className="lp-lang-btn" onClick={toggleLang}>
                        <IconWorld size={11} stroke={1.4} />
                        <span>{isZh ? 'English' : '中文'}</span>
                        <IconChevronDown size={8} stroke={2} />
                    </button>

                    <div className="lp-form-wrapper">
                        <h2 className="lp-form-title">{t('auth.forgotPasswordTitle', 'Forgot password')}</h2>
                        <p className="lp-form-subtitle">
                            {t('auth.forgotPasswordSubtitle', 'Enter your account email and we will send a reset link if the account exists.')}
                        </p>

                        {error && (
                            <div className="lp-error">
                                <span><IconAlertTriangle size={14} stroke={1.8} /></span> {error}
                            </div>
                        )}

                        {message && (
                            <div className="lp-success">
                                <span><IconCheck size={14} stroke={1.8} /></span> {message}
                            </div>
                        )}

                        {hintResult && (
                            <div className="lp-info">
                                <IconBulb size={14} stroke={1.8} />
                                {t('auth.emailHintResult', 'Email hint')}: <strong>{hintResult}</strong>
                            </div>
                        )}

                        {!showHintForm ? (
                            <form onSubmit={handleSubmit} className="lp-form">
                                <div className="lp-field">
                                    <label className="lp-label">{t('auth.email', 'Email')}</label>
                                    <input
                                        className="lp-input"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        onInvalid={handleValidationMessage}
                                        onInput={clearValidationMessage}
                                        required
                                        autoFocus
                                        placeholder={t('auth.emailPlaceholderReset', '请输入邮箱')}
                                    />
                                </div>

                                <button className="lp-btn-primary" type="submit" disabled={loading || !email.trim()}>
                                    {loading ? <span className="lp-spinner" /> : t('auth.sendResetLink', 'Send reset link')}
                                </button>

                                <div className="lp-link-group">
                                    <button type="button" onClick={() => setShowHintForm(true)}>
                                        {t('auth.forgotEmailHint', 'Forgot which email you used?')}
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <form onSubmit={handleGetHint} className="lp-form">
                                <div className="lp-field">
                                    <label className="lp-label">{t('auth.username', 'Username')}</label>
                                    <input
                                        className="lp-input"
                                        type="text"
                                        value={usernameHint}
                                        onChange={(e) => setUsernameHint(e.target.value)}
                                        onInvalid={handleValidationMessage}
                                        onInput={clearValidationMessage}
                                        required
                                        autoFocus
                                        placeholder={t('auth.usernamePlaceholderHint', 'Enter your account username')}
                                    />
                                </div>

                                <button className="lp-btn-primary" type="submit" disabled={loading || !usernameHint.trim()}>
                                    {loading ? <span className="lp-spinner" /> : t('auth.getEmailHint', 'Get Email Hint')}
                                </button>

                                <div className="lp-link-group">
                                    <button type="button" onClick={() => setShowHintForm(false)}>
                                        {t('common.cancel', 'Cancel')}
                                    </button>
                                </div>
                            </form>
                        )}

                        <div className="lp-switch">
                            {t('auth.rememberedPassword', 'Remembered your password?')} <Link to="/login">{t('auth.backToLogin', 'Back to login')}</Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
