import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores';
import { authApi, tenantApi, fetchJson } from '../../services/api';
import type { TokenResponse } from '../../types';
import {
    IconAlertTriangle,
    IconArrowRight,
    IconCheck,
    IconWorld,
    IconChevronDown,
} from '@tabler/icons-react';
import '../styles/LoginPage.css';

export default function Login() {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const invitationCode = searchParams.get('code');
    const invitedEmail = searchParams.get('email') || '';
    const setAuth = useAuthStore((s) => s.setAuth);
    // Default to register if there's an invitation code — will be overridden after email check
    const [isRegister, setIsRegister] = useState(!!invitationCode);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [checkingEmail, setCheckingEmail] = useState(!!invitationCode && !!invitedEmail);
    const [tenant, setTenant] = useState<any>(null);
    const [resolving, setResolving] = useState(true);
    const [ssoProviders, setSsoProviders] = useState<any[]>([]);
    const [oauthProviders, setOauthProviders] = useState<any[]>([]);
    const [ssoLoading, setSsoLoading] = useState(false);
    const [oauthLoading, setOauthLoading] = useState(false);
    const [ssoError, setSsoError] = useState('');
    const [oauthError, setOauthError] = useState('');
    const [tenantSelection, setTenantSelection] = useState<any[] | null>(null);
    const [showVerification, setShowVerification] = useState(false);
    const [verificationEmail, setVerificationEmail] = useState('');
    const [verificationCode, setVerificationCode] = useState('');
    const [verificationEntryMode, setVerificationEntryMode] = useState<'create' | 'join' | 'home'>('home');

    const [form, setForm] = useState({
        login_identifier: invitedEmail,  // Pre-fill invited email if present
        password: '',
        tenant_id: '',
    });

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', 'light');

        // If arriving via invitation link with email, check whether the email is already registered
        // to decide whether to show login or register form.
        if (invitationCode && invitedEmail) {
            setCheckingEmail(true);
            fetch('/api/enterprise/check-email-exists', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: invitedEmail }),
            })
                .then(r => r.json())
                .then((res: { exists: boolean }) => {
                    // If email already registered → show login form; otherwise show register form
                    setIsRegister(!res.exists);
                })
                .catch(() => {
                    // On error, fall back to register form (safe default)
                    setIsRegister(true);
                })
                .finally(() => setCheckingEmail(false));
        }

        // Resolve tenant by domain (for SSO detection only, not for login form)
        const domain = window.location.host;
        if (domain.startsWith('localhost') || domain.startsWith('127.0.0.1')) {
            setResolving(false);
            return;
        }

        tenantApi.resolveByDomain(domain)
            .then(res => {
                if (res) {
                    setTenant(res);
                }
            })
            .catch(() => { })
            .finally(() => setResolving(false));
    }, []);

    useEffect(() => {
        let cancelled = false;
        if (isRegister) {
            setOauthProviders([]);
            setOauthError('');
            return;
        }

        setOauthLoading(true);
        setOauthError('');
        fetchJson<any[]>('/auth/providers')
            .then(providers => {
                if (cancelled) return;
                setOauthProviders((providers || []).filter(p => ['google', 'github'].includes(p.provider_type)));
            })
            .catch(() => {
                if (cancelled) return;
                setOauthProviders([]);
                setOauthError(t('auth.oauthLoadFailed', 'social login 加载失败'));
            })
            .finally(() => {
                if (cancelled) return;
                setOauthLoading(false);
            });

        return () => { cancelled = true; };
    }, [isRegister]);

    useEffect(() => {
        let cancelled = false;
        if (!tenant?.sso_enabled || isRegister) {
            setSsoProviders([]);
            setSsoError('');
            return;
        }
        if (!tenant?.id) return;

        setSsoLoading(true);
        setSsoError('');

        fetchJson<{ session_id: string }>(`/sso/session?tenant_id=${tenant.id}`, { method: 'POST' })
            .then(res => fetchJson<any[]>(`/sso/config?sid=${res.session_id}`))
            .then(providers => {
                if (cancelled) return;
                setSsoProviders(providers || []);
            })
            .catch(() => {
                if (cancelled) return;
                setSsoError(t('auth.ssoLoadFailed', 'Failed to load SSO providers.'));
                setSsoProviders([]);
            })
            .finally(() => {
                if (cancelled) return;
                setSsoLoading(false);
            });

        return () => { cancelled = true; };
    }, [tenant?.id, tenant?.sso_enabled, isRegister, t]);

    const toggleLang = () => {
        i18n.changeLanguage(i18n.language === 'zh' ? 'en' : 'zh');
    };

    const isZh = i18n.language.startsWith('zh');

    const enterVerificationStep = (email: string, mode: 'create' | 'join' | 'home') => {
        setVerificationEmail(email);
        setVerificationCode('');
        setVerificationEntryMode(mode);
        setShowVerification(true);
        setTenantSelection(null);
    };

    const handleVerifyEmail = async (e: React.FormEvent) => {
        e.preventDefault();
        const token = verificationCode.trim();
        if (!token) return;

        setError('');
        setSuccessMessage('');
        setLoading(true);

        try {
            const res = await authApi.verifyEmail(token);
            if (res.access_token && res.user) {
                setAuth(res.user, res.access_token);
            }

            if (res.needs_company_setup) {
                navigate('/setup-company', {
                    state: {
                        fromRegister: true,
                        email: verificationEmail || res.user?.email,
                    },
                });
                return;
            }

            if (verificationEntryMode === 'join') {
                navigate('/onboarding?mode=join');
                return;
            }

            navigate('/');
        } catch (err: any) {
            setError(err.message || (isZh ? '验证码无效或已过期' : 'The verification code is invalid or expired.'));
        } finally {
            setLoading(false);
        }
    };

    const handleResendVerification = async () => {
        const email = verificationEmail || form.login_identifier;
        if (!email) return;

        setError('');
        setSuccessMessage('');
        setLoading(true);

        try {
            await authApi.resendVerification(email);
            setSuccessMessage(isZh ? `新的验证码已发送到 ${email}` : `A new code has been sent to ${email}.`);
        } catch (err: any) {
            setError(err.message || (isZh ? '发送验证码失败' : 'Failed to resend the verification code.'));
        } finally {
            setLoading(false);
        }
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
        setSuccessMessage('');
        setLoading(true);

        try {
            if (isRegister) {
                const regRes = await authApi.register({
                    username: form.login_identifier.split('@')[0],
                    email: form.login_identifier,
                    password: form.password,
                    display_name: form.login_identifier.split('@')[0],
                    ...(invitationCode ? { invitation_code: invitationCode } : {})
                });
                // Save authentication state for company selection (user not active yet)
                if (regRes.access_token && regRes.user) {
                    setAuth(regRes.user, regRes.access_token);
                }
                if (regRes.user?.email_verified || regRes.user?.is_active) {
                    if (invitationCode) {
                        navigate('/onboarding?mode=join');
                    } else if (regRes.needs_company_setup) {
                        navigate('/setup-company', {
                            state: { fromRegister: true, email: regRes.email || form.login_identifier },
                        });
                    } else {
                        navigate('/');
                    }
                    return;
                }
                enterVerificationStep(regRes.email || form.login_identifier, invitationCode ? 'join' : 'create');
                setSuccessMessage(
                    i18n.language.startsWith('zh')
                        ? `验证码已发送到 ${regRes.email || form.login_identifier}`
                        : `A verification code has been sent to ${regRes.email || form.login_identifier}.`
                );
                return;
            } else {
                const res = await authApi.login({
                    login_identifier: form.login_identifier,
                    password: form.password,
                    // Only pass tenant_id for dedicated SSO subdomain login (not IP-mode SSO).
                    // IP-mode SSO resolves a tenant for SSO buttons only and must NOT constrain
                    // password-based login to that tenant (it would reject users from other tenants).
                    ...(tenant?.id && tenant.sso_domain && !tenant.sso_domain.match(/^https?:\/\/\d{1,3}(\.\d{1,3}){3}(:\d+)?$/)
                        ? { tenant_id: tenant.id }
                        : {}
                    ),
                });

                // Check if multi-tenant selection is needed
                if ('requires_tenant_selection' in res && res.requires_tenant_selection) {
                    setTenantSelection(res.tenants);
                    setLoading(false);
                    return;
                }

                const tokenRes = res as TokenResponse;
                setAuth(tokenRes.user, tokenRes.access_token);

                // If the user arrived via an invitation link, join the invited company
                // before redirecting. The /tenants/join endpoint handles:
                // - Existing user with no tenant → assigns the tenant directly
                // - Existing user with a tenant → creates a new User record for the new tenant
                //   and returns a new access_token scoped to that tenant.
                if (invitationCode) {
                    try {
                        const joinRes = await tenantApi.join(invitationCode);
                        if (joinRes?.access_token) {
                            // Store the new tenant-scoped token first so that
                            // the subsequent /auth/me call uses the correct context.
                            localStorage.setItem('token', joinRes.access_token);
                            const meRes = await authApi.me();
                            setAuth(meRes, joinRes.access_token);
                        }
                        navigate('/onboarding?mode=join');
                        return;
                    } catch (joinErr: any) {
                        // If joining fails (code already used, code invalid, already a member),
                        // just continue into the user's existing company — don't block login.
                        console.warn('[invitation] join failed, entering original company:', joinErr.message);
                    }
                }

                if (tokenRes.user && !tokenRes.user.tenant_id) {
                    navigate('/setup-company');
                } else {
                    navigate('/');
                }
            }
        } catch (err: any) {
            // Handle structured verification error
            if (err.detail?.needs_verification) {
                enterVerificationStep(err.detail.email || form.login_identifier, 'home');
                setSuccessMessage(
                    i18n.language.startsWith('zh')
                        ? `请先输入发送到 ${err.detail.email || form.login_identifier} 的验证码。`
                        : `Enter the verification code sent to ${err.detail.email || form.login_identifier}.`
                );
                return;
            }

            const msg = err.message || '';
            if (msg && msg !== 'Failed to fetch' && !msg.includes('NetworkError') && !msg.includes('ERR_CONNECTION')) {
                if (msg.includes('company has been disabled')) {
                    setError(t('auth.companyDisabled'));
                } else if (msg.includes('Invalid credentials')) {
                    setError(t('auth.invalidCredentials'));
                } else if (msg.includes('Account is disabled')) {
                    setError(t('auth.accountDisabled'));
                } else if (msg.includes('does not belong to this organization')) {
                    setError(t('auth.notInOrganization', 'This account does not belong to this organization.'));
                } else if (msg.includes('500') || msg.includes('Internal Server Error')) {
                    setError(t('auth.serverStarting'));
                } else if (msg.includes('Email already registered') || msg.includes('该邮箱已注册')) {
                    setError(t('auth.emailAlreadyRegistered', '该邮箱已注册，请直接登录'));
                } else {
                    setError(msg);
                }
            } else {
                setError(t('auth.serverUnreachable'));
            }
        } finally {
            setLoading(false);
        }
    };

    const handleTenantSelect = async (tenantId: string) => {
        setForm(f => ({ ...f, tenant_id: tenantId }));
        setTenantSelection(null);
        setError('');
        setLoading(true);

        try {
            const res = await authApi.login({
                login_identifier: form.login_identifier,
                password: form.password,
                tenant_id: tenantId,
            });

            // Should not get multi-tenant response when tenant_id is provided
            if ('requires_tenant_selection' in res && res.requires_tenant_selection) {
                setTenantSelection(res.tenants);
                setLoading(false);
                return;
            }

            const tokenRes = res as TokenResponse;
            setAuth(tokenRes.user, tokenRes.access_token);
            if (tokenRes.user && !tokenRes.user.tenant_id) {
                navigate('/setup-company');
            } else {
                navigate('/');
            }
        } catch (err: any) {
            const msg = err.message || '';
            setError(msg || t('auth.loginFailed', 'Login failed'));
        } finally {
            setLoading(false);
        }
    };

    const ssoMeta: Record<string, { label: string; icon: string }> = {
        feishu: { label: 'Feishu', icon: '/feishu.png' },
        dingtalk: { label: 'DingTalk', icon: '/dingtalk.png' },
        wecom: { label: 'WeCom', icon: '/wecom.png' },
        google: { label: 'Google', icon: '/google.svg' },
        google_workspace: { label: 'Google', icon: '/google.svg' },
    };

    const startOAuthLogin = async (providerType: string) => {
        try {
            const redirectUri = `${window.location.origin}/oauth/callback/${providerType}`;
            const res = await fetchJson<{ authorization_url: string }>(
                `/auth/${providerType}/authorize?redirect_uri=${encodeURIComponent(redirectUri)}`
            );
            if (res?.authorization_url) {
                window.location.href = res.authorization_url;
            }
        } catch (err: any) {
            setError(err.message || 'Failed to start social login');
        }
    };

    const shouldShowGlobalOAuth = !tenant?.sso_enabled && !isRegister && !showVerification;

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
                    <IconChevronDown size={8} stroke={2} className="arrow" />
                </button>

                <div className="lp-form-wrapper">
                    {checkingEmail ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '200px', gap: '16px' }}>
                            <span className="lp-btn-primary" style={{ width: 24, height: 24, borderRadius: '50%', padding: 0 }}>
                                <span className="spinner" />
                            </span>
                            <span style={{ fontSize: '13px', color: 'var(--lp-text-muted)' }}>
                                {t('auth.checkingInvitation', 'Checking invitation...')}
                            </span>
                        </div>
                    ) : (
                        <>
                            <h2 className="lp-form-title">
                                {showVerification
                                    ? (isZh ? '验证邮箱' : 'Verify email')
                                    : (isRegister ? t('auth.register') : t('auth.login'))}
                            </h2>
                            <p className="lp-form-subtitle">
                                {showVerification
                                    ? (isZh
                                        ? `输入发送到 ${verificationEmail || form.login_identifier} 的验证码。`
                                        : `Enter the verification code sent to ${verificationEmail || form.login_identifier}.`)
                                    : (isRegister ? t('auth.subtitleRegister') : t('auth.subtitleLogin'))}
                            </p>

                            {error && (
                                <div className="lp-error">
                                    <IconAlertTriangle size={16} stroke={1.8} /> {error}
                                </div>
                            )}

                            {successMessage && (
                                <div className="lp-success">
                                    <IconCheck size={16} stroke={1.8} /> {successMessage}
                                </div>
                            )}

                            {tenant && tenant.sso_enabled && !isRegister && !showVerification && (
                                <div>
                                    <div className="lp-sso-notice">
                                        <strong>{tenant.name}</strong>
                                        <br />
                                        {t('auth.ssoNotice', 'Enterprise SSO is enabled for this domain.')}
                                    </div>

                                    {ssoLoading && (
                                        <div className="lp-sso-loading">
                                            {t('auth.ssoLoading', 'Loading SSO providers...')}
                                        </div>
                                    )}

                                    {!ssoLoading && ssoProviders.length > 0 && (
                                        <div className="lp-sso-buttons">
                                            {ssoProviders.map(p => {
                                                const meta = ssoMeta[p.provider_type] || { label: p.name || p.provider_type, icon: '' };
                                                return (
                                                    <button
                                                        key={p.provider_type}
                                                        className="lp-sso-btn"
                                                        onClick={() => window.location.href = p.url}
                                                    >
                                                        {meta.icon ? (
                                                            <img src={meta.icon} alt={meta.label} width={18} height={18} />
                                                        ) : (
                                                            <span style={{ width: 18, height: 18, borderRadius: 4, background: 'var(--lp-border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>
                                                                {(meta.label || '').slice(0, 1).toUpperCase()}
                                                            </span>
                                                        )}
                                                        {meta.label || p.name || p.provider_type}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {!ssoLoading && ssoProviders.length === 0 && (
                                        <div className="lp-sso-error">
                                            {ssoError || t('auth.ssoNoProviders', 'No SSO providers configured.')}
                                        </div>
                                    )}

                                    <div className="lp-divider">{t('auth.or', 'or')}</div>
                                </div>
                            )}

                            {shouldShowGlobalOAuth && (
                                <div>
                                    {!oauthLoading && oauthProviders.length > 0 && (
                                        <div className="lp-sso-buttons">
                                            {oauthProviders.map(p => {
                                                const meta = ssoMeta[p.provider_type] || { label: p.name || p.provider_type, icon: '' };
                                                return (
                                                    <button
                                                        key={p.provider_type}
                                                        className="lp-sso-btn"
                                                        type="button"
                                                        onClick={() => startOAuthLogin(p.provider_type)}
                                                    >
                                                        {meta.icon ? (
                                                            <img src={meta.icon} width={18} height={18} alt="" />
                                                        ) : (
                                                            <span style={{ width: 18, height: 18, borderRadius: 4, background: 'var(--lp-border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>
                                                                {(meta.label || '').slice(0, 1).toUpperCase()}
                                                            </span>
                                                        )}
                                                        Continue with {meta.label || p.name || p.provider_type}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {oauthError && (
                                        <div className="lp-sso-error">
                                            {oauthError}
                                        </div>
                                    )}

                                    {!oauthLoading && oauthProviders.length > 0 && (
                                        <div className="lp-divider">{t('auth.or', 'or')}</div>
                                    )}
                                </div>
                            )}

                            {showVerification ? (
                                <form onSubmit={handleVerifyEmail} className="lp-form">
                                    <div className="lp-form-field">
                                        <label>{isZh ? '邮箱验证码' : 'Verification code'}</label>
                                        <input
                                            className="lp-input"
                                            type="text"
                                            value={verificationCode}
                                            onChange={(e) => setVerificationCode(e.target.value)}
                                            required
                                            autoFocus
                                            inputMode="numeric"
                                            autoComplete="one-time-code"
                                            placeholder={isZh ? '输入验证码' : 'Enter code'}
                                        />
                                    </div>

                                    <button className="lp-btn-primary" type="submit" disabled={loading || !verificationCode.trim()}>
                                        {loading ? (
                                            <span className="spinner" />
                                        ) : (
                                            <>
                                                {isZh ? '验证并继续' : 'Verify and continue'}
                                                <IconArrowRight size={17} stroke={1.9} style={{ marginLeft: '6px' }} />
                                            </>
                                        )}
                                    </button>

                                    <div className="lp-link-group">
                                        <button type="button" onClick={handleResendVerification} disabled={loading} style={{ background: 'none', border: 'none', color: 'var(--lp-primary)', cursor: 'pointer', textDecoration: 'underline' }}>
                                            {isZh ? '重新发送验证码' : 'Resend code'}
                                        </button>
                                        <span style={{ margin: '0 12px' }}>|</span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowVerification(false);
                                                setVerificationCode('');
                                                setError('');
                                                setSuccessMessage('');
                                            }}
                                            disabled={loading}
                                            style={{ background: 'none', border: 'none', color: 'var(--lp-text-muted)', cursor: 'pointer', textDecoration: 'underline' }}
                                        >
                                            {isZh ? '返回' : 'Back'}
                                        </button>
                                    </div>
                                </form>
                            ) : (
                                <form onSubmit={handleSubmit} className="lp-form">
                                    <div className="lp-form-field">
                                        <label>{t('auth.email')}</label>
                                        <input
                                            className="lp-input"
                                            type="email"
                                            value={form.login_identifier}
                                            onChange={(e) => setForm({ ...form, login_identifier: e.target.value })}
                                            onInvalid={handleValidationMessage}
                                            onInput={clearValidationMessage}
                                            required
                                            autoFocus
                                            placeholder={t('auth.emailPlaceholder')}
                                        />
                                    </div>

                                    <div className="lp-form-field">
                                        <label>{t('auth.password')}</label>
                                        <div className="lp-input-group">
                                            <input
                                                className="lp-input"
                                                type="password"
                                                value={form.password}
                                                onChange={(e) => setForm({ ...form, password: e.target.value })}
                                                onInvalid={handleValidationMessage}
                                                onInput={clearValidationMessage}
                                                required
                                                placeholder={t('auth.passwordPlaceholder')}
                                            />
                                            {!isRegister && (
                                                <Link to="/forgot-password" className="lp-forget-link">
                                                    {t('auth.forgotPassword', '忘记密码？')}
                                                </Link>
                                            )}
                                        </div>
                                    </div>

                                    <button className="lp-btn-primary" type="submit" disabled={loading}>
                                        {loading ? (
                                            <span className="spinner" />
                                        ) : (
                                            <>
                                                {isRegister ? t('auth.register') : t('auth.login')}
                                                <IconArrowRight size={17} stroke={1.9} style={{ marginLeft: '6px' }} />
                                            </>
                                        )}
                                    </button>
                                </form>
                            )}

                            {/* Multi-tenant selection modal */}
                            {tenantSelection && (
                                <div className="lp-modal-overlay">
                                    <div className="lp-modal">
                                        <h3 className="lp-modal-title">
                                            {t('auth.selectOrganization', '选择公司')}
                                        </h3>
                                        <p className="lp-modal-subtitle">
                                            {t('auth.multiTenantPrompt', '该邮箱对应多个公司，请选择要登录的公司：')}
                                        </p>
                                        <div className="lp-modal-list">
                                            {tenantSelection.map((tenant: any) => (
                                                <button
                                                    key={tenant.tenant_id}
                                                    className="lp-modal-item"
                                                    onClick={() => handleTenantSelect(tenant.tenant_id)}
                                                >
                                                    {tenant.tenant_name} {tenant.tenant_slug && `(${tenant.tenant_slug})`}
                                                </button>
                                            ))}
                                        </div>
                                        <button
                                            className="lp-modal-item lp-modal-item--dashed"
                                            onClick={async () => {
                                                try {
                                                    setLoading(true);
                                                    const firstTenant = tenantSelection[0];
                                                    const res = await authApi.login({
                                                        login_identifier: form.login_identifier,
                                                        password: form.password,
                                                        tenant_id: firstTenant.tenant_id,
                                                    });
                                                    const tokenRes = res as TokenResponse;
                                                    setAuth(tokenRes.user, tokenRes.access_token);
                                                    setTenantSelection(null);
                                                    navigate('/setup-company?from=tenant-selection');
                                                } catch (err: any) {
                                                    setError(err.message || 'Failed');
                                                    setTenantSelection(null);
                                                } finally {
                                                    setLoading(false);
                                                }
                                            }}
                                        >
                                            {t('auth.createOrJoinOrganization', 'Create or Join Organization')}
                                        </button>
                                        <button
                                            className="lp-modal-cancel"
                                            onClick={() => setTenantSelection(null)}
                                        >
                                            {t('common.cancel', 'Cancel')}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {!showVerification && (
                                <div className="lp-link-group">
                                    {isRegister ? t('auth.hasAccount') : t('auth.noAccount')}{' '}
                                    <a href="#" onClick={(e) => { e.preventDefault(); setIsRegister(!isRegister); setError(''); }}>
                                        {isRegister ? t('auth.goLogin') : t('auth.goRegister')}
                                    </a>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
            </div>
        </div>
    );
}
