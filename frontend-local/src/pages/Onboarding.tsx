import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { IconArrowLeft, IconArrowRight, IconChevronDown, IconWorld } from '@tabler/icons-react';
import { onboardingApi } from '../services/api';
import { useAuthStore } from '../stores';
import '../styles/Onboarding.css';

type Step = 'assistant' | 'opening';

export default function Onboarding() {
    const { i18n } = useTranslation();
    const isZh = i18n.language.startsWith('zh');
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const user = useAuthStore((s) => s.user);
    const mode = (searchParams.get('mode') === 'join' ? 'join' : 'create') as 'create' | 'join';
    const [step, setStep] = useState<Step>('assistant');
    const [assistantId, setAssistantId] = useState<string | null>(null);
    const [assistantName, setAssistantName] = useState(i18n.language.startsWith('zh') ? '数字员工' : 'Digital Employee');
    const [personalities, setPersonalities] = useState<string[]>(['warm']);
    const togglePersonality = (id: string) => {
        setPersonalities((prev) =>
            prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
        );
    };
    const [workStyle, setWorkStyle] = useState('concise');
    const [boundaries, setBoundaries] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        onboardingApi.start(mode)
            .then((status) => {
                if (cancelled) return;
                if (status?.status === 'completed' && status.personal_assistant_agent_id) {
                    navigate(`/agents/${status.personal_assistant_agent_id}/chat`, { replace: true });
                    return;
                }
                if (status?.personal_assistant_agent_id) {
                    setAssistantId(status.personal_assistant_agent_id);
                    setStep('opening');
                }
            })
            .catch((err) => setError(err.message || 'Failed to start onboarding'));
        return () => { cancelled = true; };
    }, [mode, navigate]);

    const personalityOptions = useMemo(() => [
        { id: 'warm', zh: '温和', en: 'Warm' },
        { id: 'precise', zh: '严谨', en: 'Precise' },
        { id: 'quiet', zh: '幽默', en: 'Witty' },
        { id: 'direct', zh: '直接', en: 'Direct' },
    ], []);
    const workStyleOptions = useMemo(() => [
        { id: 'concise', zh: '简洁', en: 'Concise' },
        { id: 'efficient', zh: '高效', en: 'Efficient' },
        { id: 'detailed', zh: '详尽', en: 'Detailed' },
        { id: 'steady', zh: '保守', en: 'Steady' },
    ], []);

    const createAssistant = async () => {
        setError('');
        setLoading(true);
        try {
            const result = await onboardingApi.createPersonalAssistant({
                name: assistantName.trim(),
                personality: personalities.join(', ') || 'warm',
                work_style: workStyle,
                boundaries,
            });
            const nextId = result?.agent?.id || result?.onboarding?.personal_assistant_agent_id;
            setAssistantId(nextId);
            setStep('opening');
        } catch (err: any) {
            setError(err.message || 'Failed to create personal assistant');
        } finally {
            setLoading(false);
        }
    };

    const enterOffice = () => {
        if (!assistantId) return;
        navigate(`/plaza?tour=company&assistantId=${assistantId}`);
    };

    const toggleLang = () => i18n.changeLanguage(isZh ? 'en' : 'zh');

    const renderTopbar = (withBack: boolean) => (
        <>
            <div className="onb-topbar">
                {withBack && (
                    <button type="button" className="onb-back-btn" onClick={() => navigate(-1)}>
                        <IconArrowLeft size={14} stroke={1.5} />
                        <span>{isZh ? '返回' : 'Back'}</span>
                    </button>
                )}
                <img src="/logo-new.png" alt="DigitalEmployee" className="onb-logo" />
            </div>
            <div className="onb-lang-wrap">
                <button type="button" className="onb-lang-btn" onClick={toggleLang}>
                    <IconWorld size={11} stroke={1.4} />
                    <span>{isZh ? '中文' : 'English'}</span>
                    <IconChevronDown size={8} stroke={2} className="arrow" />
                </button>
            </div>
        </>
    );

    if (!user?.tenant_id) {
        return (
            <div className="onb-page">
                {renderTopbar(false)}
                <div className="onb-stack">
                    <h1 className="onb-h1">{isZh ? '先创建或加入一家公司' : 'Create or join a company first'}</h1>
                    <button className="onb-btn onb-btn--primary" onClick={() => navigate('/setup-company')}>
                        {isZh ? '去设置公司' : 'Set up company'}
                    </button>
                </div>
            </div>
        );
    }

    if (step === 'assistant') {
        return (
            <div className="onb-page">
                {renderTopbar(true)}
                <div className="onb-stack">
                    <h1 className="onb-h1">
                        {isZh ? (
                            <>见见你的<em>第一位员工</em>。</>
                        ) : (
                            <>Meet your <em>first employee.</em></>
                        )}
                    </h1>
                    <p className="onb-body-text">{isZh
                        ? '你的私人助理 —— 打理日程、备忘、和你不愿亲自处理的事。给 ta 起个名字。'
                        : "A personal assistant — for your calendar, your memory, and the things you'd rather hand off. Name them."}</p>

                    {error && <div className="onb-error">{error}</div>}

                    <form className="onb-form" onSubmit={(e) => { e.preventDefault(); createAssistant(); }}>
                        <label className="onb-field-label" htmlFor="onb-name">{isZh ? '名字' : 'Name'}</label>
                        <input
                            id="onb-name"
                            className="onb-input onb-input--hero"
                            value={assistantName}
                            onChange={(e) => setAssistantName(e.target.value)}
                            placeholder={isZh ? '助理的名字' : 'Assistant name'}
                            autoFocus
                        />

                        <label className="onb-field-label">{isZh ? '性格' : 'Personality'}</label>
                        <div className="onb-chip-row">
                            {personalityOptions.map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    className={`onb-chip${personalities.includes(item.id) ? ' is-active' : ''}`}
                                    aria-pressed={personalities.includes(item.id)}
                                    onClick={() => togglePersonality(item.id)}
                                >
                                    {isZh ? item.zh : item.en}
                                </button>
                            ))}
                        </div>

                        <label className="onb-field-label">{isZh ? '办事风格' : 'Work style'}</label>
                        <div className="onb-chip-row">
                            {workStyleOptions.map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    className={`onb-chip${workStyle === item.id ? ' is-active' : ''}`}
                                    onClick={() => setWorkStyle(item.id)}
                                >
                                    {isZh ? item.zh : item.en}
                                </button>
                            ))}
                        </div>

                        <label className="onb-field-label">{isZh ? '界限' : 'Boundaries'}</label>
                        <textarea
                            className="onb-textarea"
                            value={boundaries}
                            onChange={(e) => setBoundaries(e.target.value)}
                            placeholder={isZh ? '绝对不要做的事情（可留空）' : 'Things they should never do (optional)'}
                        />

                        <div className="onb-actions">
                            <button
                                type="submit"
                                className="onb-btn onb-btn--primary onb-btn--grow"
                                disabled={loading || !assistantName.trim()}
                            >
                                {loading ? '…' : (isZh ? '欢迎入职' : 'Welcome aboard')}
                                <IconArrowRight size={14} stroke={1.5} />
                            </button>
                            <button
                                className="onb-link"
                                type="button"
                                onClick={createAssistant}
                                disabled={loading}
                            >
                                {isZh ? '暂时跳过' : 'Skip for now'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    // step === 'opening'
    const displayName = (assistantName || (isZh ? '数字员工' : 'Digital Employee')).toUpperCase();
    return (
        <div className="onb-page">
            {renderTopbar(false)}
            <div className="onb-stack">
                <h1 className="onb-display">{isZh ? '灯，亮了。' : 'The lights are on.'}</h1>
                <p className="onb-body-text">{isZh
                    ? '一片以你的名字命名的小型星座。从这里开始扩展 —— 一条轨道，一次招募，一颗星，慢慢来。'
                    : 'A small constellation, charted in your name. From here it only grows — one orbit, one hire, one star at a time.'}</p>

                <hr className="onb-divider" />

                <ul className="onb-roster">
                    <li className="onb-roster-item">
                        <span className="onb-roster-mark" aria-hidden="true">★</span>
                        <span className="onb-roster-label">{isZh ? '创始人' : 'FOUNDER'}</span>
                        <span className="onb-roster-value">{isZh ? '你' : 'YOU'}</span>
                    </li>
                    <li className="onb-roster-item">
                        <span className="onb-roster-mark" aria-hidden="true">○</span>
                        <span className="onb-roster-label">{isZh ? '1 号员工' : 'NO. 1 EMPLOYEE'}</span>
                        <span className="onb-roster-value">{displayName}</span>
                    </li>
                    <li className="onb-roster-item">
                        <span className="onb-roster-mark" aria-hidden="true">·</span>
                        <span className="onb-roster-label">{isZh ? '未来员工' : 'FUTURE EMPLOYEES'}</span>
                        <span className="onb-roster-value">∞</span>
                    </li>
                </ul>

                {error && <div className="onb-error">{error}</div>}

                <button
                    className="onb-btn onb-btn--primary onb-btn--full"
                    onClick={enterOffice}
                    disabled={!assistantId}
                    style={{ marginTop: 4 }}
                >
                    {isZh ? '进入你的宇宙' : 'Enter your universe'}
                    <IconArrowRight size={14} stroke={1.5} />
                </button>
            </div>
        </div>
    );
}