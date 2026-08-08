import { useState, useRef, useEffect, useCallback } from 'react';

function Avatar({ name, isAgent, size = 32 }: { name: string; isAgent: boolean; size?: number }) {
    return (
        <div style={{
            width: size, height: size, borderRadius: 'var(--radius-md)',
            background: 'rgba(230, 0, 39, 0.07)', border: '1px solid var(--border-subtle)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-tertiary)', flexShrink: 0,
            fontSize: isAgent ? `${size * 0.45}px` : `${size * 0.4}px`,
            fontWeight: 600,
        }}>
            {isAgent ? (
                <svg width={`${size * 0.7}px`} height={`${size * 0.7}px`} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="5" width="12" height="10" rx="2" />
                    <circle cx="7" cy="10" r="1" fill="currentColor" stroke="none" />
                    <circle cx="11" cy="10" r="1" fill="currentColor" stroke="none" />
                    <path d="M9 2v3M6 2h6" />
                </svg>
            ) : name[0]?.toUpperCase()}
        </div>
    );
}

interface MentionInputProps {
    value: string;
    onChange: (val: string) => void;
    onSubmit?: () => void;
    mentionables: { id: string; name: string; isAgent: boolean }[];
    placeholder?: string;
    maxLength?: number;
    multiline?: boolean;
    style?: React.CSSProperties;
}

export default function MentionInput({
    value, onChange, onSubmit, mentionables, placeholder, maxLength, multiline, style
}: MentionInputProps) {
    const [showDropdown, setShowDropdown] = useState(false);
    const [mentionFilter, setMentionFilter] = useState('');
    const [mentionStart, setMentionStart] = useState(-1);
    const [selectedIdx, setSelectedIdx] = useState(0);
    const [dropdownPos, setDropdownPos] = useState<{ left: number; top: number; openUp: boolean } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);

    const filtered = mentionables.filter(m =>
        m.name.toLowerCase().includes(mentionFilter.toLowerCase())
    ).slice(0, 50);

    const DROPDOWN_WIDTH = 200;
    const DROPDOWN_MAX_HEIGHT = 240;
    const GAP = 4;

    const updateDropdownPos = useCallback(() => {
        const el = inputRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        const openUp = spaceBelow < DROPDOWN_MAX_HEIGHT + GAP && spaceAbove > spaceBelow;
        let left = rect.left;
        if (left + DROPDOWN_WIDTH > window.innerWidth - 8) {
            left = Math.max(8, window.innerWidth - 8 - DROPDOWN_WIDTH);
        }
        const top = openUp ? rect.top - GAP : rect.bottom + GAP;
        setDropdownPos({ left, top, openUp });
    }, []);

    const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
        const val = e.target.value;
        onChange(val);

        const cursorPos = e.target.selectionStart || 0;
        const textBeforeCursor = val.substring(0, cursorPos);
        const atIdx = textBeforeCursor.lastIndexOf('@');

        const prevChar = atIdx > 0 ? textBeforeCursor[atIdx - 1] : '';
        if (atIdx >= 0 && (atIdx === 0 || !/[a-zA-Z0-9_]/.test(prevChar))) {
            const query = textBeforeCursor.substring(atIdx + 1);
            if (!/\s/.test(query)) {
                setMentionStart(atIdx);
                setMentionFilter(query);
                setShowDropdown(true);
                setSelectedIdx(0);
                updateDropdownPos();
                return;
            }
        }
        setShowDropdown(false);
    }, [onChange, updateDropdownPos]);

    const insertMention = useCallback((name: string) => {
        const before = value.substring(0, mentionStart);
        const after = value.substring((inputRef.current as any)?.selectionStart ?? value.length);
        const newVal = `${before}@${name} ${after}`;
        onChange(newVal);
        setShowDropdown(false);
        setMentionStart(-1);
        setMentionFilter('');
        setTimeout(() => {
            if (inputRef.current) {
                const pos = mentionStart + name.length + 2;
                inputRef.current.focus();
                inputRef.current.setSelectionRange(pos, pos);
            }
        }, 0);
    }, [value, mentionStart, onChange]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
        if (showDropdown) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIdx(i => (i + 1) % filtered.length);
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIdx(i => (i - 1 + filtered.length) % filtered.length);
                return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                insertMention(filtered[selectedIdx].name);
                return;
            }
            if (e.key === 'Escape') {
                setShowDropdown(false);
                return;
            }
        }
        if (e.key === 'Enter' && !e.shiftKey && !multiline && onSubmit) {
            e.preventDefault();
            onSubmit();
        }
    }, [showDropdown, filtered, selectedIdx, insertMention, multiline, onSubmit]);

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    useEffect(() => {
        if (!showDropdown) return;
        const handler = () => updateDropdownPos();
        window.addEventListener('scroll', handler, true);
        window.addEventListener('resize', handler);
        return () => {
            window.removeEventListener('scroll', handler, true);
            window.removeEventListener('resize', handler);
        };
    }, [showDropdown, updateDropdownPos]);

    const InputTag = multiline ? 'textarea' : 'input';

    return (
        <div ref={containerRef} style={{ position: 'relative', flex: style?.flex || 1 }}>
            <InputTag
                ref={inputRef as any}
                value={value}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                maxLength={maxLength}
                rows={multiline ? 2 : undefined}
                style={{
                    width: '100%', boxSizing: 'border-box',
                    resize: multiline ? 'none' : undefined,
                    padding: multiline ? '8px 12px' : '6px 10px',
                    fontSize: 'var(--text-sm)', lineHeight: 1.5,
                    background: 'rgba(246, 248, 250, 1)',
                    color: 'var(--text-primary)',
                    border: '1px solid rgba(231, 231, 231, 1)',
                    borderRadius: 'var(--radius-md)',
                    fontFamily: 'var(--font-family)',
                    transition: 'border-color var(--transition-fast)',
                    ...style,
                }}
                onFocus={e => {
                    e.currentTarget.style.borderColor = 'var(--accent-primary)';
                    e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent-subtle)';
                    if (multiline) (e.currentTarget as HTMLTextAreaElement).rows = 3;
                }}
                onBlur={e => {
                    e.currentTarget.style.borderColor = 'rgba(231, 231, 231, 1)';
                    e.currentTarget.style.boxShadow = 'none';
                    if (multiline && !value) (e.currentTarget as HTMLTextAreaElement).rows = 2;
                }}
            />
            {showDropdown && filtered.length > 0 && dropdownPos && (
                <div style={{
                    position: 'fixed',
                    left: `${dropdownPos.left}px`,
                    top: `${dropdownPos.top}px`,
                    transform: dropdownPos.openUp ? 'translateY(-100%)' : undefined,
                    zIndex: 1000,
                    width: `${DROPDOWN_WIDTH}px`, maxHeight: `${DROPDOWN_MAX_HEIGHT}px`,
                    background: 'var(--bg-primary)', border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)',
                    overflowY: 'auto', overflowX: 'hidden',
                }}>
                    {filtered.map((a, idx) => (
                        <div key={a.id}
                            onMouseDown={e => { e.preventDefault(); insertMention(a.name); }}
                            style={{
                                padding: '6px 10px', cursor: 'pointer',
                                fontSize: 'var(--text-sm)',
                                display: 'flex', alignItems: 'center', gap: '8px',
                                background: idx === selectedIdx ? 'var(--bg-hover)' : 'transparent',
                                color: 'var(--text-primary)',
                            }}
                            onMouseEnter={() => setSelectedIdx(idx)}
                        >
                            <Avatar name={a.name} isAgent={a.isAgent} size={20} />
                            <span>{a.name}</span>
                            {a.isAgent && <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginLeft: 'auto' }}>AI</span>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
