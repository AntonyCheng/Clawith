import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { IconChevronDown, IconBolt } from '@tabler/icons-react';
import { fileApi } from '../services/api';

interface SkillEntry {
    name: string;
    path: string;
}

interface Props {
    agentId: string;
    /**
     * Called when the user picks a skill. Receives the folder_name, which is the
     * canonical slash-command identifier the LLM receives (e.g. "complex-task-executor").
     * The parent should append `使用/${name} ` (or whatever convention the backend expects)
     * to the chat textarea.
     */
    onInsert: (skillName: string) => void;
    disabled?: boolean;
}

export default function SkillSwitcher({ agentId, onInsert, disabled }: Props) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [hovered, setHovered] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const [coords, setCoords] = useState<
        { top: number; bottom: number; left: number; width: number; placement: 'above' | 'below'; maxHeight: number } | null
    >(null);

    // List the agent's installed skills by enumerating its `skills/` workspace folder.
    // Each subfolder is one installed skill; its folder_name doubles as the slash-command.
    const { data: entries = [], isLoading } = useQuery({
        queryKey: ['agent-skills', agentId],
        queryFn: () => fileApi.list(agentId, 'skills'),
        enabled: !!agentId && !disabled,
        staleTime: 30_000,
    });

    const skills = useMemo<SkillEntry[]>(() => {
        const list = Array.isArray(entries) ? entries : [];
        return list
            .filter((item: any) => item && item.is_dir && item.name)
            .map((item: any) => ({
                name: String(item.name),
                path: String(item.path || `skills/${item.name}`),
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [entries]);

    // Click-outside to close — same shape as ModelSwitcher
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            const inTrigger = ref.current?.contains(e.target as Node);
            const inPopover = popoverRef.current?.contains(e.target as Node);
            if (!inTrigger && !inPopover) setOpen(false);
        };
        window.addEventListener('mousedown', handler);
        return () => window.removeEventListener('mousedown', handler);
    }, [open]);

    // Popover positioning — identical algorithm to ModelSwitcher
    useLayoutEffect(() => {
        if (!open) return;
        const PREFERRED_HEIGHT = 280;
        const GAP = 4;
        const VIEWPORT_PADDING = 8;
        const recompute = () => {
            const btn = buttonRef.current;
            if (!btn) return;
            const r = btn.getBoundingClientRect();
            const vh = window.innerHeight;
            const spaceAbove = r.top - VIEWPORT_PADDING - GAP;
            const spaceBelow = vh - r.bottom - VIEWPORT_PADDING - GAP;
            const placeAbove = spaceAbove >= PREFERRED_HEIGHT || spaceAbove >= spaceBelow;
            const maxHeight = Math.min(
                PREFERRED_HEIGHT,
                Math.max(120, placeAbove ? spaceAbove : spaceBelow),
            );
            setCoords({
                top: r.top,
                bottom: r.bottom,
                left: r.left,
                width: r.width,
                placement: placeAbove ? 'above' : 'below',
                maxHeight,
            });
        };
        recompute();
        window.addEventListener('scroll', recompute, true);
        window.addEventListener('resize', recompute);
        return () => {
            window.removeEventListener('scroll', recompute, true);
            window.removeEventListener('resize', recompute);
        };
    }, [open]);

    const buttonLabel = t('chat.skillSwitcher.label', '技能');
    const emptyLabel = t('chat.skillSwitcher.empty', '该员工暂未安装技能');
    const loadingLabel = t('chat.skillSwitcher.loading', '加载中…');
    const titleAttr = t('chat.skillSwitcher.title', 'Insert a skill command');

    return (
        <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
            <button
                ref={buttonRef}
                type="button"
                onClick={() => !disabled && setOpen(o => !o)}
                disabled={disabled}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    height: '28px',
                    padding: '0 10px 0 12px', fontSize: '12px',
                    border: `1px solid ${open || hovered ? 'var(--border-default)' : 'var(--border-subtle)'}`,
                    borderRadius: '999px',
                    background: open || hovered ? 'var(--bg-elevated)' : 'rgba(255, 254, 253, 0)',
                    color: 'var(--text-primary)',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.6 : 1,
                    boxShadow: 'none',
                    outline: 'none',
                    transition: 'background 120ms, border-color 120ms, box-shadow 120ms, color 120ms',
                }}
                title={titleAttr}
            >
                <IconBolt size={13} stroke={2} style={{ color: 'var(--text-secondary)' }} />
                <span style={{
                    display: 'inline-block', maxWidth: '160px',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                    {buttonLabel}
                </span>
                <IconChevronDown
                    size={13}
                    stroke={2}
                    style={{
                        color: 'var(--text-secondary)',
                        transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 120ms',
                    }}
                />
            </button>
            {open && coords && createPortal(
                <div
                    ref={popoverRef}
                    style={{
                        position: 'fixed',
                        ...(coords.placement === 'above'
                            ? { bottom: `calc(100vh - ${coords.top}px + 4px)` }
                            : { top: `${coords.bottom + 4}px` }),
                        left: coords.left,
                        minWidth: Math.max(240, coords.width),
                        maxHeight: `${coords.maxHeight}px`, overflowY: 'auto',
                        background: 'rgba(255, 255, 255, 1)', border: '1px solid rgba(236, 236, 236, 1)',
                        borderRadius: '8px', boxShadow: 'none',
                        zIndex: 10001, padding: '4px',
                    }}
                >
                    {isLoading ? (
                        <div style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-tertiary)' }}>
                            {loadingLabel}
                        </div>
                    ) : skills.length === 0 ? (
                        <div style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-tertiary)' }}>
                            {emptyLabel}
                        </div>
                    ) : (
                        skills.map(s => (
                            <button
                                key={s.path}
                                onClick={() => {
                                    onInsert(s.name);
                                    setOpen(false);
                                }}
                                style={{
                                    display: 'flex', alignItems: 'center', width: '100%',
                                    padding: '6px 10px', gap: '8px',
                                    border: 'none', borderRadius: '6px',
                                    background: 'transparent',
                                    color: 'var(--text-primary)',
                                    cursor: 'pointer', fontSize: '12.5px', textAlign: 'left',
                                }}
                                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-secondary)'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                            >
                                <span style={{ width: '14px', display: 'inline-flex', color: 'var(--text-tertiary)' }}>
                                    <IconBolt size={13} stroke={2} />
                                </span>
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {s.name}
                                </span>
                                <span style={{
                                    fontSize: '10px', padding: '2px 6px',
                                    background: 'var(--bg-secondary)', color: 'var(--text-tertiary)',
                                    borderRadius: '4px', letterSpacing: '0.02em',
                                }}>
                                    /{s.name}
                                </span>
                            </button>
                        ))
                    )}
                </div>,
                document.body,
            )}
        </div>
    );
}